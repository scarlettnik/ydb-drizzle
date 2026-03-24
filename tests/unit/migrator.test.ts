import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { drizzle, migrate, type YdbExecutor } from "../../src/index.js";

function normalizeSql(query: string): string {
  return query.replace(/\s+/gu, " ").trim();
}

function parseHistoryUpsert(query: string): [string, number, string] {
  const match = normalizeSql(query).match(/VALUES \('([^']+)', ([0-9]+), '([^']*)'\)$/u);

  if (!match) {
    throw new Error(`Cannot parse migration bookkeeping query: ${query}`);
  }

  return [match[1], Number(match[2]), match[3]];
}

function createMigratorExecutor(initialRows: Array<[string, number, string]> = []) {
  const calls: Array<{ query: string; method: string; arrayMode: boolean }> = [];
  const appliedRows = [...initialRows];

  const executor: YdbExecutor = {
    async execute(query, _params, method, options) {
      const normalized = normalizeSql(query);
      calls.push({ query: normalized, method, arrayMode: options?.arrayMode === true });

      if (normalized.startsWith("SELECT `hash`, `created_at`, `name` FROM `")) {
        return { rows: appliedRows.map((row) => [...row]) };
      }

      if (normalized.startsWith("UPSERT INTO `")) {
        appliedRows.unshift(parseHistoryUpsert(normalized));
        return { rows: [] };
      }

      return { rows: [] };
    },
  };

  return { executor, calls, appliedRows };
}

test("inline migrate bootstraps bookkeeping and skips already applied migrations", async () => {
  const { executor, calls, appliedRows } = createMigratorExecutor();
  const db = drizzle(executor);
  const config = {
    migrationsTable: "__unit_migrations",
    migrations: [
      {
        name: "0001_create",
        folderMillis: 1,
        sql: ["CREATE TABLE `unit_users` (`id` Int32 NOT NULL, PRIMARY KEY (`id`))"],
      },
      {
        name: "0002_alter",
        folderMillis: 2,
        sql: ["ALTER TABLE `unit_users` ADD COLUMN `age` Int32"],
      },
    ],
  } as const;

  await migrate(db, config);
  await migrate(db, config);

  assert.ok(calls[0].query.startsWith("CREATE TABLE IF NOT EXISTS `__unit_migrations`"));
  assert.equal(calls.filter((call) => call.query === "CREATE TABLE `unit_users` (`id` Int32 NOT NULL, PRIMARY KEY (`id`))").length, 1);
  assert.equal(calls.filter((call) => call.query === "ALTER TABLE `unit_users` ADD COLUMN `age` Int32").length, 1);
  assert.equal(appliedRows.length, 2);
  assert.deepEqual(
    appliedRows.map((row) => row[2]).sort(),
    ["0001_create", "0002_alter"],
  );
});

test("folder migrate reads drizzle migration journal format", async () => {
  const { executor, calls } = createMigratorExecutor();
  const db = drizzle(executor);
  const migrationsFolder = resolve(process.cwd(), "tests/fixtures/migrations/basic");

  await migrate(db, {
    migrationsFolder,
    migrationsTable: "__folder_migrations",
  });

  assert.ok(calls.some((call) => call.query.includes("CREATE TABLE `folder_users`")));
  assert.ok(calls.some((call) => call.query.includes("ALTER TABLE `folder_users` ADD COLUMN `age` Int32")));
  assert.ok(calls.some((call) => call.query.startsWith("UPSERT INTO `__folder_migrations`")));
});
