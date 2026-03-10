import test from "node:test";
import assert from "node:assert/strict";
import { TransactionRollbackError } from "drizzle-orm/errors";
import { relations, sql } from "drizzle-orm";
import { drizzle, integer, text, ydbTable } from "../src/index.js";

const users = ydbTable("users", {
  id: integer("id").notNull(),
  name: text("name").notNull(),
});

const posts = ydbTable("posts", {
  id: integer("id").notNull(),
  authorId: integer("author_id").notNull(),
  title: text("title").notNull(),
});

const schema = {
  users,
  posts,
  usersRelations: relations(users, ({ many }) => ({
    posts: many(posts),
  })),
  postsRelations: relations(posts, ({ one }) => ({
    author: one(users, {
      fields: [posts.authorId],
      references: [users.id],
    }),
  })),
};

test("logger", async () => {
  const logs: Array<{ query: string; params: unknown[] }> = [];

  const db = drizzle({
    async execute(query, params) {
      return {
        rows: query.startsWith("select")
          ? [{ value: params[0] }]
          : [],
      };
    },
  }, {
    logger: {
      logQuery(query, params) {
        logs.push({ query, params: [...params] });
      },
    },
  });

  await db.execute<{ value: number }[]>(sql`select ${123} as value`);
  await db.insert(users).values({ id: 1, name: "Pinkie Pie" });

  assert.equal(logs.length, 2);
  assert.equal(logs[0]?.query, "select $p0 as value");
  assert.deepEqual(logs[0]?.params, [123]);
  assert.equal(logs[1]?.query, "insert into `users` (`id`, `name`) values ($p0, $p1)");
  assert.deepEqual(logs[1]?.params, [1, "Pinkie Pie"]);
});

test("schema", async () => {
  const executedQueries: string[] = [];

  const db = drizzle({
    async execute(query, _params, _method, options) {
      executedQueries.push(query);

      if (query.includes("from `users`")) {
        return {
          rows: options?.arrayMode
            ? [[1, "Twilight Sparkle"]]
            : [{ id: 1, name: "Twilight Sparkle" }],
        };
      }

      return { rows: [] };
    },
  }, { schema });

  const relationalSchema = (db as any)._.schema;

  assert.deepEqual(Object.keys(relationalSchema).sort(), ["posts", "users"]);
  assert.equal(relationalSchema.users.tsName, "users");
  assert.equal(relationalSchema.posts.dbName, "posts");
  assert.ok(Object.values((db as any)._.tableNamesMap).includes("users"));
  assert.ok((db as any).query.users);
  assert.ok((db as any).query.posts);

  const many = await (db as any).query.users.findMany();
  const first = await (db as any).query.users.findFirst({
    where: (fields: typeof users, { eq }: { eq: (left: unknown, right: unknown) => unknown }) => eq(fields.id, 1),
  });
  const firstViaGet = await db.get<{ id: number; name: string }>((db as any).query.users.findFirst({
    where: (fields: typeof users, { eq }: { eq: (left: unknown, right: unknown) => unknown }) => eq(fields.id, 1),
  }));

  assert.deepEqual(many, [{ id: 1, name: "Twilight Sparkle" }]);
  assert.deepEqual(first, { id: 1, name: "Twilight Sparkle" });
  assert.deepEqual(firstViaGet, { id: 1, name: "Twilight Sparkle" });
  assert.equal(executedQueries.length, 3);
  assert.match(executedQueries[0] ?? "", /^select `users`\.`id`, `users`\.`name` from `users`$/);
  assert.match(executedQueries[1] ?? "", /^select `users`\.`id`, `users`\.`name` from `users` where `users`\.`id` = \$p0 limit \$p1$/);
  assert.match(executedQueries[2] ?? "", /^select `users`\.`id`, `users`\.`name` from `users` where `users`\.`id` = \$p0 limit \$p1$/);
});

test("schema rejects with", async () => {
  const db = drizzle({
    async execute() {
      return { rows: [] };
    },
  }, { schema });

  await assert.rejects(
    async () => (db as any).query.users.findMany({ with: { posts: true } }).execute(),
    /YDB relational query `with` is not supported yet/,
  );
});

test("transaction commit", async () => {
  const calls: string[] = [];
  const transactionConfigs: unknown[] = [];
  const logs: Array<{ query: string; params: unknown[] }> = [];
  const executeInStore = async (query: string, _params: unknown[], options?: { arrayMode?: boolean }) => {
    calls.push(query);

    if (query.startsWith("select")) {
      return {
        rows: options?.arrayMode ? [[1, "Rainbow Dash"]] : [{ id: 1, name: "Rainbow Dash" }],
      };
    }

    return { rows: [] };
  };

  const db = drizzle({
    async execute(query, params, _method, options) {
      return executeInStore(query, params, options);
    },
    async transaction(callback, config) {
      transactionConfigs.push(config);
      return callback({
        async execute(query, params, method, options) {
          return executeInStore(query, params, options);
        },
        async transaction() {
          throw new Error("Nested transactions are not supported by YDB");
        },
      });
    },
  }, {
    schema,
    logger: {
      logQuery(query, params) {
        logs.push({ query, params: [...params] });
      },
    },
  });

  const result = await db.transaction(async (tx) => {
    await tx.insert(users).values({ id: 1, name: "Rainbow Dash" });

    const row = await tx.query.users.findFirst({
      where: (fields, { eq }) => eq(fields.id, 1),
    });

    return {
      row,
      hasSchema: !!tx._.schema?.users,
    };
  }, { accessMode: "read write", idempotent: false });

  assert.deepEqual(result, {
    row: { id: 1, name: "Rainbow Dash" },
    hasSchema: true,
  });
  assert.deepEqual(transactionConfigs, [{ accessMode: "read write", idempotent: false }]);
  assert.ok(logs.some(({ query }) => query.startsWith("insert into `users`")));
  assert.ok(logs.some(({ query }) => query.startsWith("select `users`.`id`, `users`.`name` from `users`")));
});

test("transaction rollback", async () => {
  let rolledBack = false;

  const db = drizzle({
    async execute() {
      return { rows: [] };
    },
    async transaction(callback) {
      try {
        return await callback({
          async execute() {
            return { rows: [] };
          },
          async transaction() {
            throw new Error("Nested transactions are not supported by YDB");
          },
        });
      } catch (error) {
        rolledBack = true;
        throw new Error("Transaction failed.", { cause: error });
      }
    },
  }, { schema });

  await assert.rejects(
    async () => db.transaction(async (tx) => {
      tx.rollback();
    }),
    TransactionRollbackError,
  );

  assert.equal(rolledBack, true);
});
