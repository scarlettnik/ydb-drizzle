import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql as yql } from "drizzle-orm";
import { buildCreateTableSql, index, integer, migrate, text, type YdbInlineMigration, ydbTable } from "../../src/index.js";
import { createLiveContext } from "./helpers/context.js";

const live = createLiveContext();

function normalize(rows: Array<[number, string, number | null]>): Array<[number, string, number | null]> {
  return [...rows].sort((left, right) => left[0] - right[0]);
}

test("inline migrate applies DDL, bookkeeping and remains idempotent on live YDB", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(
    t,
    "bootstrap migration history table, create a temp table via migrate(), add a column and index via later migrations, verify idempotency, then drop temp objects",
  );

  const suffix = live.baseIntId + 501;
  const tableName = `migration_users_${suffix}`;
  const migrationTableName = `migration_history_${suffix}`;

  const baseUsers = ydbTable(tableName, {
    id: integer("id").notNull().primaryKey(),
    name: text("name"),
  }, (table) => [
    index(`${tableName}_name_idx`).on(table.name),
  ]);

  const usersWithAge = ydbTable(tableName, {
    id: integer("id").notNull().primaryKey(),
    name: text("name"),
    age: integer("age"),
  }, (table) => [
    index(`${tableName}_name_idx`).on(table.name),
    index(`${tableName}_age_idx`).on(table.age),
  ]);

  await live.db.execute(yql.raw(`DROP TABLE IF EXISTS \`${migrationTableName}\``));
  await live.db.execute(yql.raw(`DROP TABLE IF EXISTS \`${tableName}\``));

  try {
    await migrate(live.db, {
      migrationsTable: migrationTableName,
      migrations: [
        {
          name: "0001_create_users",
          folderMillis: 1,
          operations: [
            { kind: "create_table", table: baseUsers, ifNotExists: true },
          ],
        },
      ],
    });

    await live.db.execute(yql.raw(`UPSERT INTO \`${tableName}\` (\`id\`, \`name\`) VALUES (1, 'Twilight Sparkle')`));
    const initialRows = await live.db.values<[number, string]>(yql.raw(`SELECT \`id\`, \`name\` FROM \`${tableName}\` ORDER BY \`id\``));
    assert.deepEqual(initialRows, [[1, "Twilight Sparkle"]]);

    const addAgeIndex = index(`${tableName}_age_idx`).on(usersWithAge.age).build(usersWithAge);
    const createUsersMigration: YdbInlineMigration = {
      name: "0001_create_users",
      folderMillis: 1,
      operations: [
        { kind: "create_table", table: baseUsers, ifNotExists: true },
      ],
    };
    const addAgeMigration: YdbInlineMigration = {
      name: "0002_add_age",
      folderMillis: 2,
      operations: [
        { kind: "add_columns", table: tableName, columns: [usersWithAge.age] },
        { kind: "add_index", table: tableName, index: addAgeIndex },
      ],
    };
    const incrementalConfig = {
      migrationsTable: migrationTableName,
      migrations: [createUsersMigration, addAgeMigration],
    };

    await migrate(live.db, incrementalConfig);
    await migrate(live.db, incrementalConfig);

    await live.db.execute(
      yql.raw(`UPSERT INTO \`${tableName}\` (\`id\`, \`name\`, \`age\`) VALUES (2, 'Rainbow Dash', 21)`),
    );
    const rowsWithAge = await live.db.values<[number, string, number | null]>(
      yql.raw(`SELECT \`id\`, \`name\`, \`age\` FROM \`${tableName}\` ORDER BY \`id\``),
    );
    assert.deepEqual(
      normalize(rowsWithAge),
      [
        [1, "Twilight Sparkle", null],
        [2, "Rainbow Dash", 21],
      ],
    );

    const bookkeepingRows = await live.db.values<[string, number, string]>(
      yql.raw(`SELECT \`hash\`, \`created_at\`, \`name\` FROM \`${migrationTableName}\` ORDER BY \`created_at\``),
    );
    assert.equal(bookkeepingRows.length, 2);

    const dropAgeIndexMigration: YdbInlineMigration = {
      name: "0003_drop_age_index",
      folderMillis: 3,
      operations: [
        { kind: "drop_index", table: tableName, name: `${tableName}_age_idx` },
      ],
    };
    const dropUsersMigration: YdbInlineMigration = {
      name: "0004_drop_users",
      folderMillis: 4,
      operations: [
        { kind: "drop_table", table: tableName, ifExists: true },
      ],
    };

    await migrate(live.db, {
      migrationsTable: migrationTableName,
      migrations: [
        ...incrementalConfig.migrations,
        dropAgeIndexMigration,
        dropUsersMigration,
      ],
    });

    await assert.rejects(
      async () => live.db.values(yql.raw(`SELECT * FROM \`${tableName}\``)),
    );
  } finally {
    await live.db.execute(yql.raw(`DROP TABLE IF EXISTS \`${tableName}\``));
    await live.db.execute(yql.raw(`DROP TABLE IF EXISTS \`${migrationTableName}\``));
  }
});

test("folder migrate accepts drizzle journal/sql format on live YDB", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(
    t,
    "create a temp migration folder in drizzle journal format, run migrate() against it, verify created schema and bookkeeping rows, then clean all temp objects",
  );

  const suffix = live.baseIntId + 601;
  const tableName = `folder_users_${suffix}`;
  const migrationTableName = `folder_history_${suffix}`;
  const tempDir = mkdtempSync(join(tmpdir(), "ydb-migrator-"));
  const metaDir = join(tempDir, "meta");

  mkdirSync(metaDir, { recursive: true });
  writeFileSync(join(metaDir, "_journal.json"), JSON.stringify({
    entries: [
      { idx: 0, when: 1, tag: "0000_create_folder_users", breakpoints: true },
      { idx: 1, when: 2, tag: "0001_add_age_to_folder_users", breakpoints: true },
    ],
  }, null, 2));
  writeFileSync(
    join(tempDir, "0000_create_folder_users.sql"),
    [
      `CREATE TABLE \`${tableName}\` (`,
      "  `id` Int32 NOT NULL,",
      "  `name` Utf8,",
      "  PRIMARY KEY (`id`)",
      ")",
    ].join("\n"),
  );
  writeFileSync(
    join(tempDir, "0001_add_age_to_folder_users.sql"),
    `ALTER TABLE \`${tableName}\` ADD COLUMN \`age\` Int32`,
  );

  await live.db.execute(yql.raw(`DROP TABLE IF EXISTS \`${migrationTableName}\``));
  await live.db.execute(yql.raw(`DROP TABLE IF EXISTS \`${tableName}\``));

  try {
    await migrate(live.db, {
      migrationsFolder: tempDir,
      migrationsTable: migrationTableName,
    });

    await live.db.execute(
      yql.raw(`UPSERT INTO \`${tableName}\` (\`id\`, \`name\`, \`age\`) VALUES (1, 'Applejack', 24)`),
    );
    const rows = await live.db.values<[number, string, number]>(
      yql.raw(`SELECT \`id\`, \`name\`, \`age\` FROM \`${tableName}\``),
    );
    assert.deepEqual(rows, [[1, "Applejack", 24]]);

    const bookkeepingRows = await live.db.values<[string, number, string]>(
      yql.raw(`SELECT \`hash\`, \`created_at\`, \`name\` FROM \`${migrationTableName}\` ORDER BY \`created_at\``),
    );
    assert.equal(bookkeepingRows.length, 2);

    await migrate(live.db, {
      migrationsFolder: tempDir,
      migrationsTable: migrationTableName,
    });
    const bookkeepingRowsAfter = await live.db.values<[string, number, string]>(
      yql.raw(`SELECT \`hash\`, \`created_at\`, \`name\` FROM \`${migrationTableName}\` ORDER BY \`created_at\``),
    );
    assert.equal(bookkeepingRowsAfter.length, 2);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
    await live.db.execute(yql.raw(`DROP TABLE IF EXISTS \`${tableName}\``));
    await live.db.execute(yql.raw(`DROP TABLE IF EXISTS \`${migrationTableName}\``));
  }
});

test("inline unique column constraints work on live YDB", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(t, "create a temp table with inline unique() metadata, verify duplicate values are rejected by YDB, then drop the temp table");

  const suffix = live.baseIntId + 701;
  const tableName = `unique_users_${suffix}`;
  const users = ydbTable(tableName, {
    id: integer("id").notNull().primaryKey(),
    email: text("email").notNull().unique(),
  });

  await live.db.execute(yql.raw(`DROP TABLE IF EXISTS \`${tableName}\``));

  try {
    await live.db.execute(yql.raw(buildCreateTableSql(users, { ifNotExists: true })));
    await live.db.execute(yql.raw(`INSERT INTO \`${tableName}\` (\`id\`, \`email\`) VALUES (1, 'rarity@example.com')`));

    await assert.rejects(
      () => live.db.execute(yql.raw(`INSERT INTO \`${tableName}\` (\`id\`, \`email\`) VALUES (2, 'rarity@example.com')`)),
    );

    const rows = await live.db.values<[number, string]>(
      yql.raw(`SELECT \`id\`, \`email\` FROM \`${tableName}\` ORDER BY \`id\``),
    );
    assert.deepEqual(rows, [[1, "rarity@example.com"]]);
  } finally {
    await live.db.execute(yql.raw(`DROP TABLE IF EXISTS \`${tableName}\``));
  }
});
