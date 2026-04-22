import { readMigrationFiles, type MigrationConfig as DrizzleMigrationConfig, type MigrationMeta } from "drizzle-orm/migrator";
import type { YdbDatabase } from "../ydb-core/db.js";
import { YdbDialect } from "./dialect.js";
import {
  normalizeInlineMigration,
  type YdbInlineMigration,
  type YdbMigrationTableConfig,
  type YdbNormalizedMigration,
} from "./migration-ddl.js";

export interface YdbMigratorConfig extends YdbMigrationTableConfig {
  migrations: readonly YdbInlineMigration[];
}

export type YdbMigrateConfig = (DrizzleMigrationConfig & YdbMigrationTableConfig) | YdbMigratorConfig;

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

export async function migrate<TSchema extends Record<string, unknown>>(
  db: YdbDatabase<TSchema, any>,
  config: YdbMigrateConfig,
): Promise<void> {
  const session = db._.session;
  const migrationConfig: YdbMigrationTableConfig = isDrizzleMigrationConfig(config)
    ? {
      migrationsTable: config.migrationsTable,
      migrationsSchema: config.migrationsSchema,
      migrationsLockTable: config.migrationsLockTable,
      migrationLock: config.migrationLock,
      migrationRecovery: config.migrationRecovery,
    }
    : {
      migrationsTable: config.migrationsTable,
      migrationsSchema: config.migrationsSchema,
      migrationsLockTable: config.migrationsLockTable,
      migrationLock: config.migrationLock,
      migrationRecovery: config.migrationRecovery,
    };

  const dialect = new YdbDialect();
  await dialect.migrate(normalizeMigrations(config), session, migrationConfig);
}
