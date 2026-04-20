import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { drizzle, migrate, type YdbExecutor } from "../../src/index.js";

function normalizeSql(query: string): string {
  return query.replace(/\s+/gu, " ").trim();
}

function parseHistoryUpsert(query: string): [string, number, string] {
  const match = normalizeSql(query).match(/VALUES \( '([^']+)', ([0-9]+), '([^']*)', '([^']*)',/u);

  if (!match) {
    throw new Error(`Cannot parse migration bookkeeping query: ${query}`);
  }

  return [match[1], Number(match[2]), match[3]];
}

function createMigratorExecutor(
  initialRows: Array<[string, number, string]> = [],
  options: {
    activeLock?: boolean;
    failQuery?: (query: string) => boolean;
  } = {},
) {
  const calls: Array<{ query: string; method: string; arrayMode: boolean }> = [];
  const appliedRows = initialRows.map((row) => [...row, "applied", null, null, null, null, null, null] as unknown[]);
  const lockRows = new Map<string, { ownerId: string; expiresAt: number }>();
  if (options.activeLock) {
    lockRows.set("migrate", { ownerId: "other-unit-runner", expiresAt: Date.now() + 60_000 });
  }

  const executor: YdbExecutor & { transaction<T>(callback: (tx: YdbExecutor) => Promise<T>): Promise<T> } = {
    async execute(query, _params, method, execOptions) {
      const normalized = normalizeSql(query);
      calls.push({ query: normalized, method, arrayMode: execOptions?.arrayMode === true });

      if (normalized.startsWith("SELECT `owner_id`, `expires_at` FROM `")) {
        const key = normalized.match(/`lock_key` = '([^']+)'/u)?.[1] ?? "migrate";
        const lock = lockRows.get(key);
        return { rows: lock ? [[lock.ownerId, lock.expiresAt]] : [] };
      }

      if (normalized.startsWith("UPSERT INTO `") && normalized.includes("`lock_key`")) {
        const match = normalized.match(/VALUES \('([^']+)', '([^']+)', [0-9]+, [0-9]+, ([0-9]+)\)/u);
        if (match) {
          lockRows.set(match[1]!, { ownerId: match[2]!, expiresAt: Number(match[3]) });
        }
        return { rows: [] };
      }

      if (normalized.startsWith("DELETE FROM `") && normalized.includes("`lock_key`")) {
        const key = normalized.match(/`lock_key` = '([^']+)'/u)?.[1] ?? "migrate";
        lockRows.delete(key);
        return { rows: [] };
      }

      if (normalized.startsWith("SELECT `hash`, `created_at`, `name` FROM `")) {
        return { rows: appliedRows.map((row) => [...row]) };
      }

      if (normalized.startsWith("SELECT `hash`, `created_at`, `name`, `status`, ")) {
        return { rows: appliedRows.map((row) => [...row]) };
      }

      if (normalized.startsWith("SELECT `status` FROM `")) {
        return { rows: [] };
      }

      if (normalized.startsWith("UPSERT INTO `")) {
        const parsed = parseHistoryUpsert(normalized);
        const existingIndex = appliedRows.findIndex((row) => row[0] === parsed[0]);
        const nextRow = [parsed[0], parsed[1], parsed[2], normalized.includes("'applied'") ? "applied" : normalized.includes("'failed'") ? "failed" : "running", null, null, null, null, null, null];
        if (existingIndex >= 0) {
          appliedRows[existingIndex] = nextRow;
        } else {
          appliedRows.unshift(nextRow);
        }
        return { rows: [] };
      }

      if (options.failQuery?.(normalized)) {
        throw new Error(`forced failure: ${normalized}`);
      }

      return { rows: [] };
    },
    async transaction(callback) {
      return callback(executor);
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

  assert.ok(calls.some((call) => call.query.startsWith("CREATE TABLE IF NOT EXISTS `__unit_migrations`")));
  assert.ok(calls.some((call) => call.query.startsWith("CREATE TABLE IF NOT EXISTS `__unit_migrations_lock`")));
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
  assert.ok(calls.some((call) => call.query.startsWith("UPSERT INTO `__folder_migrations`") && call.query.includes("'applied'")));
});

test("migrate fails fast when migration lock is held", async () => {
  const { executor, calls } = createMigratorExecutor([], { activeLock: true });
  const db = drizzle(executor);

  await assert.rejects(
    () => migrate(db, {
      migrationsTable: "__locked_migrations",
      migrationLock: {
        ownerId: "unit-owner",
        acquireTimeoutMs: 5,
        retryIntervalMs: 1,
      },
      migrations: [
        {
          name: "0001_locked",
          folderMillis: 1,
          sql: ["select 1"],
        },
      ],
    }),
    /could not acquire migration lock/u,
  );

  assert.ok(calls.some((call) => call.query.startsWith("CREATE TABLE IF NOT EXISTS `__locked_migrations_lock`")));
  assert.ok(!calls.some((call) => call.query === "select 1"));
});

test("migrate records failed state and retries only when recovery retry is enabled", async () => {
  let failUnstable = true;
  const { executor, calls, appliedRows } = createMigratorExecutor([], {
    failQuery(query) {
      return failUnstable && query === "unstable statement";
    },
  });
  const db = drizzle(executor);
  const config = {
    migrationsTable: "__recovery_migrations",
    migrationLock: {
      ownerId: "unit-recovery-owner",
    },
    migrations: [
      {
        name: "0001_recoverable",
        folderMillis: 1,
        hash: "recovery_hash",
        sql: ["select 1", "unstable statement"],
      },
    ],
  } as const;

  await assert.rejects(
    () => migrate(db, config),
    /failed after 1\/2 statements/u,
  );
  assert.equal(appliedRows[0]?.[3], "failed");
  assert.equal(calls.filter((call) => call.query === "unstable statement").length, 1);

  await assert.rejects(
    () => migrate(db, config),
    /marked as failed/u,
  );
  assert.equal(calls.filter((call) => call.query === "unstable statement").length, 1);

  failUnstable = false;
  await migrate(db, {
    ...config,
    migrationRecovery: { mode: "retry" },
  });

  assert.equal(appliedRows[0]?.[3], "applied");
  assert.equal(calls.filter((call) => call.query === "unstable statement").length, 2);
});
