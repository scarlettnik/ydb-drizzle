import test from "node:test";
import assert from "node:assert/strict";
import { sql as yql } from "drizzle-orm";
import { integer, text, ydbTable } from "../../src/index.js";
import {
  getInsertColumnEntries,
  getTableColumns,
  resolveInsertValue,
  resolveUpdateValue,
  validateTableColumnKeys,
} from "../../src/ydb-core/query-builders/utils.js";
import { dialect, users } from "../helpers/unit-basic.js";

function fragmentToQuery(fragment: unknown) {
  return dialect.sqlToQuery(yql`${fragment as any}`);
}

test("getTableColumns and insert entries expose table metadata", () => {
  const columns = getTableColumns(users);

  assert.deepEqual(Object.keys(columns), ["id", "name", "createdAt", "updatedAt"]);
  assert.deepEqual(
    getInsertColumnEntries(users).map(([key]) => key),
    ["id", "name", "createdAt", "updatedAt"],
  );
});

test("validateTableColumnKeys rejects unknown fields for insert and update", () => {
  validateTableColumnKeys(users, { id: 1, name: "Pinkie Pie" }, "insert");
  validateTableColumnKeys(users, { name: "Rainbow Dash" }, "update");

  assert.throws(
    () => validateTableColumnKeys(users, { id: 1, nope: true }, "insert"),
    /Unknown column "nope" in insert\(\)/,
  );
  assert.throws(
    () => validateTableColumnKeys(users, { nope: true }, "update"),
    /Unknown column "nope" in update\(\)/,
  );
});

test("resolveInsertValue uses explicit values, defaults, onUpdate hooks and SQL default", () => {
  const columns = getTableColumns(users);
  const staticDefaultUsers = ydbTable("static_default_users", {
    id: integer("id").notNull(),
    score: integer("score").default(42),
  });
  const plainUsers = ydbTable("plain_users", {
    id: integer("id").notNull(),
    name: text("name").notNull(),
  });
  const staticDefaultColumns = getTableColumns(staticDefaultUsers);
  const plainColumns = getTableColumns(plainUsers);

  assert.deepEqual(fragmentToQuery(resolveInsertValue(columns["name"]!, "Twilight Sparkle")), {
    sql: "$p0",
    params: ["Twilight Sparkle"],
    typings: ["none"],
  });
  assert.deepEqual(fragmentToQuery(resolveInsertValue(columns["createdAt"]!, undefined)), {
    sql: "$p0",
    params: [100],
    typings: ["none"],
  });
  assert.deepEqual(fragmentToQuery(resolveInsertValue(columns["updatedAt"]!, undefined)), {
    sql: "$p0",
    params: [200],
    typings: ["none"],
  });
  assert.deepEqual(fragmentToQuery(resolveInsertValue(staticDefaultColumns["score"]!, undefined)), {
    sql: "$p0",
    params: [42],
    typings: ["none"],
  });
  assert.deepEqual(fragmentToQuery(resolveInsertValue(plainColumns["name"]!, undefined)), {
    sql: "default",
    params: [],
  });
});

test("resolveUpdateValue uses explicit values and onUpdate hooks", () => {
  const columns = getTableColumns(users);
  const plainUsers = ydbTable("plain_users", {
    id: integer("id").notNull(),
    name: text("name").notNull(),
  });
  const plainColumns = getTableColumns(plainUsers);

  assert.deepEqual(fragmentToQuery(resolveUpdateValue(columns["name"]!, "Applejack")), {
    sql: "$p0",
    params: ["Applejack"],
    typings: ["none"],
  });
  assert.deepEqual(fragmentToQuery(resolveUpdateValue(columns["updatedAt"]!, undefined)), {
    sql: "$p0",
    params: [200],
    typings: ["none"],
  });
  assert.equal(resolveUpdateValue(plainColumns["name"]!, undefined), undefined);
});
