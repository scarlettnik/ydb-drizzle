import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { integer, text, ydbTable } from "../src/index.js";
import { YdbDialect } from "../src/ydb/dialect.js";
import { YdbDeleteBuilder, YdbInsertBuilder, YdbSelectBuilder, YdbUpdateBuilder } from "../src/ydb-core/query-builders/index.js";

const dialect = new YdbDialect();
const session = {} as any;

const users = ydbTable("users", {
  id: integer("id").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at").$defaultFn(() => 100),
  updatedAt: integer("updated_at").$onUpdateFn(() => 200),
});

function toQuery(builder: { getSQL(): any }) {
  return dialect.sqlToQuery(builder.getSQL());
}

test("select sql", () => {
  const query = toQuery(new YdbSelectBuilder(session).from(users).where(eq(users.id, 7)));

  assert.equal(
    query.sql,
    "select `users`.`id`, `users`.`name`, `users`.`created_at`, `users`.`updated_at` from `users` where `users`.`id` = $p0",
  );
  assert.deepEqual(query.params, [7]);
});

test("delete sql", () => {
  const query = toQuery(new YdbDeleteBuilder(users, session).where(eq(users.id, 7)));

  assert.equal(query.sql, "delete from `users` where `users`.`id` = $p0");
  assert.deepEqual(query.params, [7]);
});

test("insert defaults", () => {
  const query = toQuery(new YdbInsertBuilder(users, session).values({ id: 1, name: "Pinkie Pie" }));

  assert.equal(
    query.sql,
    "insert into `users` (`id`, `name`, `created_at`, `updated_at`) values ($p0, $p1, $p2, $p3)",
  );
  assert.deepEqual(query.params, [1, "Pinkie Pie", 100, 200]);
});

test("insert order", () => {
  const query = toQuery(
    new YdbInsertBuilder(users, session).values([
      { id: 1, name: "Twilight Sparkle", createdAt: 10, updatedAt: 11 },
      { name: "Rainbow Dash", id: 2, updatedAt: 22 },
    ]),
  );

  assert.equal(
    query.sql,
    "insert into `users` (`id`, `name`, `created_at`, `updated_at`) values ($p0, $p1, $p2, $p3), ($p4, $p5, $p6, $p7)",
  );
  assert.deepEqual(query.params, [1, "Twilight Sparkle", 10, 11, 2, "Rainbow Dash", 100, 22]);
});

test("insert rejects unknown", () => {
  assert.throws(
    () => toQuery(new YdbInsertBuilder(users, session).values({ id: 1, name: "Applejack", nope: true } as any)),
    /Unknown column "nope" in insert\(\)/,
  );
});

test("update onUpdate", () => {
  const query = toQuery(new YdbUpdateBuilder(users, session).set({ name: "Fluttershy" }).where(eq(users.id, 5)));

  assert.equal(
    query.sql,
    "update `users` set `name` = $p0, `updated_at` = $p1 where `users`.`id` = $p2",
  );
  assert.deepEqual(query.params, ["Fluttershy", 200, 5]);
});

test("update rejects unknown", () => {
  assert.throws(
    () => toQuery(new YdbUpdateBuilder(users, session).set({ nope: true } as any)),
    /Unknown column "nope" in update\(\)/,
  );
});

test("update rejects empty", () => {
  const tableWithoutUpdateHooks = ydbTable("plain_users", {
    id: integer("id").notNull(),
    name: text("name").notNull(),
  });

  assert.throws(
    () => toQuery(new YdbUpdateBuilder(tableWithoutUpdateHooks, session).set({})),
    /Update values are empty/,
  );
});
