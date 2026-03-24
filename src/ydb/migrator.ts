import { readMigrationFiles, type MigrationConfig as DrizzleMigrationConfig, type MigrationMeta } from "drizzle-orm/migrator";
import { sql } from "drizzle-orm/sql";
import type { YdbDatabase } from "../ydb-core/db.js";
import type { YdbSession } from "../ydb-core/session.js";
import {
  buildMigrationHistoryInsertSql,
  buildMigrationHistorySelectSql,
  buildMigrationTableBootstrapSql,
  normalizeInlineMigration,
  type YdbInlineMigration,
  type YdbMigrationTableConfig,
  type YdbNormalizedMigration,
} from "./migration-ddl.js";

export interface YdbMigratorConfig extends YdbMigrationTableConfig {
  migrations: readonly YdbInlineMigration[];
}

export type YdbMigrateConfig = DrizzleMigrationConfig | YdbMigratorConfig;

function isDrizzleMigrationConfig(config: YdbMigrateConfig): config is DrizzleMigrationConfig {
  return "migrationsFolder" in config;
}

function normalizeFolderMigrations(config: DrizzleMigrationConfig): YdbNormalizedMigration[] {
  return readMigrationFiles(config).map((migration: MigrationMeta, index) => ({
    name: `folder_${String(index + 1).padStart(4, "0")}`,
    folderMillis: migration.folderMillis,
    hash: migration.hash,
    bps: migration.bps,
    sql: migration.sql.filter((statement) => statement.trim() !== ""),
  }));
}

function normalizeMigrations(config: YdbMigrateConfig): YdbNormalizedMigration[] {
  if (isDrizzleMigrationConfig(config)) {
    return normalizeFolderMigrations(config);
  }

  return config.migrations.map((migration, index) => normalizeInlineMigration(migration, index));
}

async function ensureMigrationTable(session: YdbSession, config: YdbMigrationTableConfig): Promise<void> {
  await session.execute(sql.raw(buildMigrationTableBootstrapSql(config)));
}

async function readAppliedMigrationHashes(session: YdbSession, config: YdbMigrationTableConfig): Promise<Set<string>> {
  const rows = await session.values<[string, number | string, string]>(sql.raw(buildMigrationHistorySelectSql(config)));
  return new Set(rows.map(([hash]) => hash));
}

async function applyMigration(session: YdbSession, migration: YdbNormalizedMigration, config: YdbMigrationTableConfig): Promise<void> {
  for (const statement of migration.sql) {
    const trimmed = statement.trim();
    if (trimmed === "") {
      continue;
    }

    await session.execute(sql.raw(trimmed));
  }

  await session.execute(sql.raw(buildMigrationHistoryInsertSql(migration, config)));
}

export async function migrate<TSchema extends Record<string, unknown>>(
  db: YdbDatabase<TSchema, any>,
  config: YdbMigrateConfig,
): Promise<void> {
  const session = db._.session;
  const migrationConfig: YdbMigrationTableConfig = isDrizzleMigrationConfig(config)
    ? {
      migrationsTable: config.migrationsTable,
      migrationsSchema: config.migrationsSchema,
    }
    : {
      migrationsTable: config.migrationsTable,
      migrationsSchema: config.migrationsSchema,
    };

  await ensureMigrationTable(session, migrationConfig);

  const appliedHashes = await readAppliedMigrationHashes(session, migrationConfig);
  const migrations = normalizeMigrations(config).sort((left, right) => left.folderMillis - right.folderMillis);

  for (const migration of migrations) {
    if (appliedHashes.has(migration.hash)) {
      continue;
    }

    await applyMigration(session, migration, migrationConfig);
    appliedHashes.add(migration.hash);
  }
}
