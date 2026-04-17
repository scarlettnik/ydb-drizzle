import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAddColumnsSql,
  buildAddColumnFamilySql,
  buildAddIndexSql,
  buildAlterColumnFamilySql,
  buildAlterColumnSetFamilySql,
  buildAlterTableResetOptionsSql,
  buildAlterTableSetOptionsSql,
  buildCreateTableSql,
  buildDropColumnsSql,
  buildDropIndexSql,
  buildDropTableSql,
  buildMigrationSql,
  columnFamily,
  index,
  integer,
  partitionByHash,
  rawTableOption,
  tableOptions,
  text,
  ttl,
  uint32,
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

test("migration DDL generates table options, partitioning, TTL, and column families", () => {
  const events = ydbTable("migration_events", {
    id: integer("id").notNull().primaryKey(),
    payload: text("payload").notNull(),
    expiresAt: uint32("expires_at").notNull(),
  }, (table) => [
    columnFamily("cold", { data: "rot", compression: "lz4" }).columns(table.payload),
    partitionByHash(table.id),
    ttl(table.expiresAt, "P7D", { unit: "SECONDS" }),
    tableOptions({
      STORE: "COLUMN",
      AUTO_PARTITIONING_BY_SIZE: "ENABLED",
      AUTO_PARTITIONING_PARTITION_SIZE_MB: 512,
    }),
  ]);

  const ddl = buildCreateTableSql(events);

  assert.match(ddl, /^CREATE TABLE `migration_events`/u);
  assert.match(ddl, /`payload` Utf8 FAMILY `cold` NOT NULL/u);
  assert.match(ddl, /FAMILY `cold` \(DATA = "rot", COMPRESSION = "lz4"\)/u);
  assert.match(ddl, /PARTITION BY HASH\(`id`\)/u);
  assert.match(ddl, /STORE = COLUMN/u);
  assert.match(ddl, /AUTO_PARTITIONING_BY_SIZE = ENABLED/u);
  assert.match(ddl, /AUTO_PARTITIONING_PARTITION_SIZE_MB = 512/u);
  assert.match(ddl, /TTL = Interval\("P7D"\) ON `expires_at` AS SECONDS/u);
});

test("migration DDL generates ALTER statements for table options and column families", () => {
  const events = ydbTable("migration_events", {
    id: integer("id").notNull().primaryKey(),
    payload: text("payload").notNull(),
    body: text("body"),
  });

  assert.equal(
    buildAlterTableSetOptionsSql(events, {
      STORE: "ROW",
      AUTO_PARTITIONING_BY_SIZE: "DISABLED",
      READ_REPLICAS_SETTINGS: rawTableOption("'PER_AZ: 2'"),
    }),
    "ALTER TABLE `migration_events` SET (STORE = ROW, AUTO_PARTITIONING_BY_SIZE = DISABLED, READ_REPLICAS_SETTINGS = 'PER_AZ: 2')",
  );
  assert.equal(
    buildAlterTableResetOptionsSql(events, ["TTL", "AUTO_PARTITIONING_BY_SIZE"]),
    "ALTER TABLE `migration_events` RESET (TTL, AUTO_PARTITIONING_BY_SIZE)",
  );
  assert.equal(
    buildAddColumnFamilySql(events, { name: "hot", options: { data: "ssd", compression: "lz4" } }),
    'ALTER TABLE `migration_events` ADD FAMILY `hot` (DATA = "ssd", COMPRESSION = "lz4")',
  );
  assert.equal(
    buildAlterColumnFamilySql(events, "hot", { data: "rot", compression: "zstd", compressionLevel: 4 }),
    'ALTER TABLE `migration_events` ALTER FAMILY `hot` SET DATA "rot", ALTER FAMILY `hot` SET COMPRESSION "zstd", ALTER FAMILY `hot` SET COMPRESSION_LEVEL 4',
  );
  assert.deepEqual(
    buildAlterColumnSetFamilySql(events, [events.payload, events.body], "hot"),
    [
      "ALTER TABLE `migration_events` ALTER COLUMN `payload` SET FAMILY `hot`",
      "ALTER TABLE `migration_events` ALTER COLUMN `body` SET FAMILY `hot`",
    ],
  );
  assert.deepEqual(
    buildMigrationSql([
      { kind: "set_table_options", table: events, options: { STORE: "ROW" } },
      { kind: "reset_table_options", table: events, names: ["TTL"] },
      { kind: "add_column_family", table: events, family: { name: "cold", options: { data: "rot" } } },
      { kind: "alter_column_family", table: events, name: "cold", options: { compression: "lz4" } },
      { kind: "set_column_family", table: events, columns: ["body"], familyName: "cold" },
    ]),
    [
      "ALTER TABLE `migration_events` SET (STORE = ROW)",
      "ALTER TABLE `migration_events` RESET (TTL)",
      'ALTER TABLE `migration_events` ADD FAMILY `cold` (DATA = "rot")',
      'ALTER TABLE `migration_events` ALTER FAMILY `cold` SET COMPRESSION "lz4"',
      "ALTER TABLE `migration_events` ALTER COLUMN `body` SET FAMILY `cold`",
    ],
  );
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

test("migration DDL rejects invalid table option and family definitions", () => {
  const duplicateOptionTable = ydbTable("duplicate_options", {
    id: integer("id").notNull().primaryKey(),
  }, () => [
    tableOptions({ STORE: "ROW" }),
    tableOptions({ STORE: "COLUMN" }),
  ]);
  const duplicateTtlTable = ydbTable("duplicate_ttl", {
    id: integer("id").notNull().primaryKey(),
    expiresAt: uint32("expires_at").notNull(),
  }, (table) => [
    ttl(table.expiresAt, "P1D"),
    ttl(table.expiresAt, "P2D"),
  ]);
  const duplicateFamilyTable = ydbTable("duplicate_family", {
    id: integer("id").notNull().primaryKey(),
    payload: text("payload"),
  }, (table) => [
    columnFamily("hot").columns(table.payload),
    columnFamily("cold").columns(table.payload),
  ]);
  const duplicateFamilyNameTable = ydbTable("duplicate_family_name", {
    id: integer("id").notNull().primaryKey(),
    payload: text("payload"),
    metadata: text("metadata"),
  }, (table) => [
    columnFamily("hot").columns(table.payload),
    columnFamily("hot").columns(table.metadata),
  ]);

  assert.throws(() => buildCreateTableSql(duplicateOptionTable), /duplicate table option "STORE"/u);
  assert.throws(() => buildCreateTableSql(duplicateTtlTable), /supports only one TTL/u);
  assert.throws(() => buildCreateTableSql(duplicateFamilyTable), /assigned to both "hot" and "cold"/u);
  assert.throws(() => buildCreateTableSql(duplicateFamilyNameTable), /duplicate column family "hot"/u);
  assert.throws(() => buildAlterTableSetOptionsSql("duplicate_options", {}), /requires at least one option/u);
  assert.throws(() => buildAlterColumnFamilySql("duplicate_family", "hot", {}), /requires at least one option/u);
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
