import test from "node:test";
import assert from "node:assert/strict";
import { relations } from "drizzle-orm";
import { drizzle, integer, text, ydbTable } from "../../src/index.js";

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

test("schema", async () => {
  const executedQueries: string[] = [];
  const buildObjectRows = (query: string, values: unknown[]) => {
    const aliases = Array.from(query.matchAll(/ as `([^`]+)`/g), (match) => match[1]!);
    return [Object.fromEntries(aliases.map((alias, index) => [alias, values[index]]))];
  };

  const db = drizzle({
    async execute(query, _params, _method, options) {
      executedQueries.push(query);

      if (query.includes("from `users`")) {
        return {
          rows: options?.arrayMode
            ? [[1, "Twilight Sparkle"]]
            : buildObjectRows(query, [1, "Twilight Sparkle"]),
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
  assert.match(executedQueries[0] ?? "", /^select `users`\.`id` as `__ydb_c0`, `users`\.`name` as `__ydb_c1` from `users` `users`$/);
  assert.match(executedQueries[1] ?? "", /^select `users`\.`id` as `__ydb_c0`, `users`\.`name` as `__ydb_c1` from `users` `users` where `users`\.`id` = \$p0 limit \$p1$/);
  assert.match(executedQueries[2] ?? "", /^select `users`\.`id` as `__ydb_c0`, `users`\.`name` as `__ydb_c1` from `users` `users` where `users`\.`id` = \$p0 limit \$p1$/);
});
