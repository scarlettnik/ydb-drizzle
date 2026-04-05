import crypto from "node:crypto";
import { getTableName } from "drizzle-orm/table";
import type { YdbColumn } from "../ydb-core/columns/common.js";
import type { YdbIndex, YdbIndexConfig } from "../ydb-core/indexes.js";
import type { YdbPrimaryKey } from "../ydb-core/primary-keys.js";
import { getTableConfig } from "../ydb-core/table.utils.js";
import type { YdbTable, YdbTableWithColumns } from "../ydb-core/table.js";
import type { YdbUniqueConstraint } from "../ydb-core/unique-constraint.js";

export interface YdbMigrationTableConfig {
  migrationsTable?: string;
  migrationsSchema?: string;
}

export interface YdbCreateTableOperation {
  kind: "create_table";
  table: YdbTableWithColumns;
  ifNotExists?: boolean;
}

export interface YdbDropTableOperation {
  kind: "drop_table";
  table: string | YdbTable;
  ifExists?: boolean;
}

export interface YdbAddColumnsOperation {
  kind: "add_columns";
  table: string | YdbTable;
  columns: [YdbColumn, ...YdbColumn[]];
}

export interface YdbDropColumnsOperation {
  kind: "drop_columns";
  table: string | YdbTable;
  columns: [string, ...string[]];
}

export interface YdbAddIndexOperation {
  kind: "add_index";
  table: string | YdbTable;
  index: YdbIndex | YdbUniqueConstraint;
}

export interface YdbDropIndexOperation {
  kind: "drop_index";
  table: string | YdbTable;
  name: string;
}

export type YdbMigrationOperation =
  | YdbCreateTableOperation
  | YdbDropTableOperation
  | YdbAddColumnsOperation
  | YdbDropColumnsOperation
  | YdbAddIndexOperation
  | YdbDropIndexOperation;

export interface YdbInlineMigration {
  readonly name?: string;
  readonly folderMillis?: number;
  readonly hash?: string;
  readonly breakpoints?: boolean;
  readonly sql?: readonly string[];
  readonly operations?: readonly YdbMigrationOperation[];
}

export interface YdbNormalizedMigration {
  readonly name: string;
  readonly folderMillis: number;
  readonly hash: string;
  readonly bps: boolean;
  readonly sql: string[];
}

function escapeName(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}

function escapeString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function getObjectName(value: string | YdbTable): string {
  return typeof value === "string" ? value : getTableName(value);
}

function getMigrationTableName(config: YdbMigrationTableConfig): string {
  const tableName = config.migrationsTable ?? "__drizzle_migrations";
  return config.migrationsSchema ? `${config.migrationsSchema}/${tableName}` : tableName;
}

function ensureSupportedColumn(column: YdbColumn): void {
  if ((column as any).generated !== undefined) {
    throw new Error(`YDB migrate() DDL generation does not support generated columns: "${column.name}"`);
  }
}

function renderColumnDefinition(column: YdbColumn): string {
  ensureSupportedColumn(column);

  const parts = [escapeName(column.name), column.getSQLType()];
  if ((column as any).notNull === true) {
    parts.push("NOT NULL");
  }

  return parts.join(" ");
}

function getPrimaryKeyColumns(columns: readonly YdbColumn[], primaryKeys: readonly YdbPrimaryKey[]): YdbColumn[] {
  const inlinePrimaryKeys = columns.filter((column) => (column as any).primary === true);

  if (inlinePrimaryKeys.length > 0 && primaryKeys.length > 0) {
    throw new Error("YDB migrate() DDL generation found both inline and table-level primary keys");
  }

  if (primaryKeys.length > 1) {
    throw new Error("YDB migrate() DDL generation supports only one table-level primary key definition");
  }

  return inlinePrimaryKeys.length > 0 ? inlinePrimaryKeys : [...(primaryKeys[0]?.config.columns ?? [])];
}

function renderIndexConfig(config: YdbIndexConfig): string {
  const fragments = [
    "INDEX",
    escapeName(config.name ?? `${getTableName(config.table)}_${config.columns.map((column) => column.name).join("_")}_idx`),
    config.locality,
  ];

  if (config.unique) {
    fragments.push("UNIQUE");
  }

  fragments.push(config.sync);

  if (config.indexType && config.indexType !== "secondary") {
    fragments.push("USING", config.indexType);
  }

  fragments.push(`ON (${config.columns.map((column) => escapeName(column.name)).join(", ")})`);

  if (config.cover.length > 0) {
    fragments.push(`COVER (${config.cover.map((column) => escapeName(column.name)).join(", ")})`);
  }

  const withEntries = Object.entries(config.withOptions);
  if (withEntries.length > 0) {
    fragments.push(
      `WITH (${withEntries.map(([key, value]) => `${key} = ${typeof value === "string" ? escapeString(value) : String(value)}`).join(", ")})`,
    );
  }

  return fragments.join(" ");
}

function uniqueConstraintToIndex(constraint: YdbUniqueConstraint): YdbIndexConfig {
  return {
    name: constraint.config.name,
    table: constraint.config.table,
    columns: constraint.config.columns,
    unique: true,
    locality: "GLOBAL",
    sync: "SYNC",
    indexType: undefined,
    cover: [],
    withOptions: {},
  };
}

export function buildMigrationTableBootstrapSql(config: YdbMigrationTableConfig = {}): string {
  const migrationTableName = getMigrationTableName(config);

  return [
    `CREATE TABLE IF NOT EXISTS ${escapeName(migrationTableName)} (`,
    `  ${escapeName("hash")} Utf8 NOT NULL,`,
    `  ${escapeName("created_at")} Int64 NOT NULL,`,
    `  ${escapeName("name")} Utf8 NOT NULL,`,
    `  PRIMARY KEY (${escapeName("hash")})`,
    `)`,
  ].join("\n");
}

export function buildCreateTableSql(table: YdbTableWithColumns, options: { ifNotExists?: boolean } = {}): string {
  const { columns, indexes, primaryKeys, uniqueConstraints } = getTableConfig(table);

  const primaryKeyColumns = getPrimaryKeyColumns(columns, primaryKeys);
  if (primaryKeyColumns.length === 0) {
    throw new Error(`YDB migrate() CREATE TABLE requires a primary key for "${getTableName(table)}"`);
  }

  const definitions = [
    ...columns.map((column) => renderColumnDefinition(column)),
    ...indexes.map((index) => renderIndexConfig(index.config)),
    ...uniqueConstraints.map((constraint) => renderIndexConfig(uniqueConstraintToIndex(constraint))),
    `PRIMARY KEY (${primaryKeyColumns.map((column) => escapeName(column.name)).join(", ")})`,
  ];

  return [
    `CREATE TABLE ${options.ifNotExists ? "IF NOT EXISTS " : ""}${escapeName(getTableName(table))} (`,
    definitions.map((definition) => `  ${definition}`).join(",\n"),
    `)`,
  ].join("\n");
}

export function buildDropTableSql(table: string | YdbTable, options: { ifExists?: boolean } = {}): string {
  return `DROP TABLE ${options.ifExists ? "IF EXISTS " : ""}${escapeName(getObjectName(table))}`;
}

export function buildAddColumnsSql(table: string | YdbTable, columns: [YdbColumn, ...YdbColumn[]]): string[] {
  return columns.map((column) => `ALTER TABLE ${escapeName(getObjectName(table))} ADD COLUMN ${renderColumnDefinition(column)}`);
}

export function buildDropColumnsSql(table: string | YdbTable, columns: [string, ...string[]]): string[] {
  return columns.map((column) => `ALTER TABLE ${escapeName(getObjectName(table))} DROP COLUMN ${escapeName(column)}`);
}

export function buildAddIndexSql(table: string | YdbTable, index: YdbIndex | YdbUniqueConstraint): string {
  const rendered = "config" in index && "unique" in index.config
    ? renderIndexConfig(index.config)
    : renderIndexConfig(uniqueConstraintToIndex(index as YdbUniqueConstraint));

  if (rendered.includes(" UNIQUE ")) {
    throw new Error("YDB migrate() cannot add UNIQUE indexes to existing tables; create them inline in CREATE TABLE");
  }

  const tableName = escapeName(getObjectName(table));
  const indexDefinition = rendered.replace(/^INDEX\s+/u, "");
  return `ALTER TABLE ${tableName} ADD INDEX ${indexDefinition}`;
}

export function buildDropIndexSql(table: string | YdbTable, name: string): string {
  return `ALTER TABLE ${escapeName(getObjectName(table))} DROP INDEX ${escapeName(name)}`;
}

export function buildMigrationSql(operations: readonly YdbMigrationOperation[]): string[] {
  const statements: string[] = [];

  for (const operation of operations) {
    switch (operation.kind) {
      case "create_table":
        statements.push(buildCreateTableSql(operation.table, { ifNotExists: operation.ifNotExists }));
        break;
      case "drop_table":
        statements.push(buildDropTableSql(operation.table, { ifExists: operation.ifExists }));
        break;
      case "add_columns":
        statements.push(...buildAddColumnsSql(operation.table, operation.columns));
        break;
      case "drop_columns":
        statements.push(...buildDropColumnsSql(operation.table, operation.columns));
        break;
      case "add_index":
        statements.push(buildAddIndexSql(operation.table, operation.index));
        break;
      case "drop_index":
        statements.push(buildDropIndexSql(operation.table, operation.name));
        break;
    }
  }

  return statements;
}

export function normalizeInlineMigration(migration: YdbInlineMigration, index: number): YdbNormalizedMigration {
  const sqlStatements = migration.sql
    ? [...migration.sql]
    : migration.operations
      ? buildMigrationSql(migration.operations)
      : [];

  if (sqlStatements.length === 0) {
    throw new Error(`YDB migrate() received migration #${index + 1} without sql or operations`);
  }

  const text = sqlStatements.join("\n--> statement-breakpoint\n");

  return {
    name: migration.name ?? `inline_${String(index + 1).padStart(4, "0")}`,
    folderMillis: migration.folderMillis ?? index + 1,
    hash: migration.hash ?? crypto.createHash("sha256").update(text).digest("hex"),
    bps: migration.breakpoints ?? false,
    sql: sqlStatements,
  };
}

export function buildMigrationHistorySelectSql(config: YdbMigrationTableConfig = {}): string {
  const migrationTableName = getMigrationTableName(config);

  return [
    `SELECT ${escapeName("hash")}, ${escapeName("created_at")}, ${escapeName("name")}`,
    `FROM ${escapeName(migrationTableName)}`,
    `ORDER BY ${escapeName("created_at")} DESC`,
  ].join(" ");
}

export function buildMigrationHistoryInsertSql(
  migration: Pick<YdbNormalizedMigration, "hash" | "folderMillis" | "name">,
  config: YdbMigrationTableConfig = {},
): string {
  const migrationTableName = getMigrationTableName(config);

  return [
    `UPSERT INTO ${escapeName(migrationTableName)} (${escapeName("hash")}, ${escapeName("created_at")}, ${escapeName("name")})`,
    `VALUES (${escapeString(migration.hash)}, ${String(migration.folderMillis)}, ${escapeString(migration.name)})`,
  ].join(" ");
}
