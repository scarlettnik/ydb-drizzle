import test from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { drizzle, integer, text, ydbTable } from "../../src/index.js";
import { YdbDeleteBuilder, YdbInsertBuilder } from "../../src/ydb-core/query-builders/index.js";
import { dialect, session, users } from "../helpers/unit-basic.js";

test("db $with()/with() builds CTE-backed select queries", () => {
  const db = drizzle({
    async execute() {
      return { rows: [] };
    },
  });

  const sq = db.$with("sq").as(
    db.select({
      id: users.id,
      name: users.name,
    }).from(users).where(eq(users.id, 1)),
  );

  const query = db.with(sq).select().from(sq).toSQL();

  assert.ok(query.sql.startsWith("with `sq` as (select"));
  assert.ok(query.sql.includes("select `sq`.`id`, `sq`.`name` from `sq`"));
  assert.deepEqual(query.params, [1]);
});

test("db $count() embeds count sql and resolves numeric results", async () => {
  const queries: string[] = [];
  const db = drizzle({
    async execute(query) {
      queries.push(query);
      return { rows: [[5]] };
    },
  });

  const result = await db.$count(users, eq(users.id, 1));
  const embedded = dialect.sqlToQuery(
    sql`select ${db.$count(users, eq(users.id, 2))} as ${sql.identifier("count")}`,
  );

  assert.equal(result, 5);
  assert.equal(queries[0], "select count(*) as count from `users` where `users`.`id` = $p0");
  assert.equal(
    embedded.sql,
    "select (select count(*) from `users` where `users`.`id` = $p0) as `count`",
  );
  assert.deepEqual(embedded.params, [2]);
});

test("insert select sql", () => {
  const query = dialect.sqlToQuery(
    new YdbInsertBuilder(users, session, dialect).select((qb) => qb.select({
      id: sql<number>`${2}`.as("id"),
      name: users.name,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    }).from(users).where(eq(users.id, 1))).getSQL(),
  );

  assert.equal(
    query.sql,
    "insert into `users` (`id`, `name`, `created_at`, `updated_at`) select $p0 as `id`, `users`.`name`, `users`.`created_at`, `users`.`updated_at` from `users` where `users`.`id` = $p1",
  );
  assert.deepEqual(query.params, [2, 1]);
});

test("insert select rejects mismatched fields", () => {
  assert.throws(
    () => new YdbInsertBuilder(users, session, dialect).select((qb) => qb.select({
      id: users.id,
      missing: users.name,
    }).from(users)),
    /Insert select error/,
  );
});

test("onDuplicateKeyUpdate sql", () => {
  const plainUsers = ydbTable("plain_users", {
    id: integer("id").notNull().primaryKey(),
    name: text("name").notNull(),
  });
  const query = dialect.sqlToQuery(
    new YdbInsertBuilder(plainUsers, session, dialect)
      .values({ id: 1, name: "insert value" })
      .onDuplicateKeyUpdate({ set: { name: "updated value" } })
      .getSQL(),
  );

  assert.ok(query.sql.startsWith("with `__ydb_incoming` as (select"));
  assert.ok(query.sql.includes("upsert into `plain_users` (`id`, `name`) select"));
  assert.ok(query.sql.includes("case when `plain_users`.`id` is null then `__ydb_incoming`.`name` else $p2 end as `name`"));
  assert.deepEqual(query.params, [1, "insert value", "updated value"]);
});

test("delete using sql", () => {
  const query = dialect.sqlToQuery(
    new YdbDeleteBuilder(users, session, dialect)
      .using(sql.identifier("posts"))
      .where(sql`${users.id} = ${sql.identifier("posts")}.${sql.identifier("user_id")}`)
      .getSQL(),
  );

  assert.equal(
    query.sql,
    "delete from `users` where exists (select 1 from `posts` where `users`.`id` = `posts`.`user_id`)",
  );
  assert.deepEqual(query.params, []);
});

test("session.batch() executes builders sequentially and returns mapped results", async () => {
  const db = drizzle({
    async execute(query, _params, _method, options) {
      if (query.startsWith("insert into `users`")) {
        return { rows: [] };
      }

      if (options?.arrayMode) {
        return { rows: [[1, "Rainbow Dash"]] };
      }

      return { rows: [{ id: 1, name: "Rainbow Dash" }] };
    },
  });

  const results = await db._.session.batch([
    db.insert(users).values({ id: 1, name: "Rainbow Dash" }),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, 1)),
  ] as const);

  assert.deepEqual(results[0], []);
  assert.deepEqual(results[1], [{ id: 1, name: "Rainbow Dash" }]);
});
