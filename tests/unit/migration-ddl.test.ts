import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAddColumnsSql,
  buildAddIndexSql,
  buildCreateTableSql,
  buildDropColumnsSql,
  buildDropIndexSql,
  buildDropTableSql,
  buildMigrationSql,
  index,
  integer,
  text,
  unique,
  ydbTable,
} from "../../src/index.js";

test("migration DDL generates create table with inline indexes and unique constraints", () => {
  const users = ydbTable("migration_users", {
    id: integer("id").notNull().primaryKey(),
    name: text("name").notNull(),
    age: integer("age"),
  }, (table) => [
    index("migration_users_name_idx").on(table.name).cover(table.age),
    unique("migration_users_name_unique").on(table.name),
  ]);

  const ddl = buildCreateTableSql(users, { ifNotExists: true });

  assert.match(ddl, /^CREATE TABLE IF NOT EXISTS `migration_users`/u);
  assert.match(ddl, /`id` Int32 NOT NULL/u);
  assert.match(ddl, /`name` Utf8 NOT NULL/u);
  assert.match(ddl, /INDEX `migration_users_name_idx` GLOBAL SYNC ON \(`name`\) COVER \(`age`\)/u);
  assert.match(ddl, /INDEX `migration_users_name_unique` GLOBAL UNIQUE SYNC ON \(`name`\)/u);
  assert.match(ddl, /PRIMARY KEY \(`id`\)/u);
});

test("migration DDL generates alter and drop statements", () => {
  const users = ydbTable("migration_users", {
    id: integer("id").notNull().primaryKey(),
    age: integer("age"),
    score: integer("score").notNull(),
  });
  const ageIndex = index("migration_users_age_idx").on(users.age).build(users);

  assert.deepEqual(buildAddColumnsSql(users, [users.age, users.score]), [
    "ALTER TABLE `migration_users` ADD COLUMN `age` Int32",
    "ALTER TABLE `migration_users` ADD COLUMN `score` Int32 NOT NULL",
  ]);
  assert.deepEqual(buildDropColumnsSql(users, ["age", "score"]), [
    "ALTER TABLE `migration_users` DROP COLUMN `age`",
    "ALTER TABLE `migration_users` DROP COLUMN `score`",
  ]);
  assert.equal(
    buildAddIndexSql(users, ageIndex),
    "ALTER TABLE `migration_users` ADD INDEX `migration_users_age_idx` GLOBAL SYNC ON (`age`)",
  );
  assert.equal(
    buildDropIndexSql(users, "migration_users_age_idx"),
    "ALTER TABLE `migration_users` DROP INDEX `migration_users_age_idx`",
  );
  assert.equal(buildDropTableSql(users, { ifExists: true }), "DROP TABLE IF EXISTS `migration_users`");
  assert.deepEqual(
    buildMigrationSql([
      { kind: "add_columns", table: users, columns: [users.age] },
      { kind: "add_index", table: users, index: ageIndex },
      { kind: "drop_columns", table: users, columns: ["age"] },
    ]),
    [
      "ALTER TABLE `migration_users` ADD COLUMN `age` Int32",
      "ALTER TABLE `migration_users` ADD INDEX `migration_users_age_idx` GLOBAL SYNC ON (`age`)",
      "ALTER TABLE `migration_users` DROP COLUMN `age`",
    ],
  );
});

test("migration DDL rejects invalid YDB constructs", () => {
  const users = ydbTable("users", {
    id: integer("id").notNull().primaryKey(),
    name: text("name"),
  });
  const uniqueAge = unique("users_age_unique").on(users.name).build(users);

  assert.throws(() => buildAddIndexSql(users, uniqueAge), /cannot add UNIQUE indexes/u);
});

test("migration DDL includes inline column unique constraints", () => {
  const users = ydbTable("migration_unique_users", {
    id: integer("id").notNull().primaryKey(),
    email: text("email").notNull().unique(),
    externalId: text("external_id").unique("migration_unique_users_external_unique"),
  });

  const ddl = buildCreateTableSql(users);

  assert.match(ddl, /INDEX `migration_unique_users_email_unique` GLOBAL UNIQUE SYNC ON \(`email`\)/u);
  assert.match(ddl, /INDEX `migration_unique_users_external_unique` GLOBAL UNIQUE SYNC ON \(`external_id`\)/u);
});
