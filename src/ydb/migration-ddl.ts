import crypto from "node:crypto";
import { getTableName } from "drizzle-orm/table";
import type { YdbColumn } from "../ydb-core/columns/common.js";
import type { YdbIndex, YdbIndexConfig } from "../ydb-core/indexes.js";
import type { YdbPrimaryKey } from "../ydb-core/primary-keys.js";
import type {
  YdbColumnFamily,
  YdbColumnFamilyOptions,
  YdbTableOptionValue,
  YdbTableOptions,
  YdbTtl,
} from "../ydb-core/table-options.js";
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

export interface YdbSetTableOptionsOperation {
  kind: "set_table_options";
  table: string | YdbTable;
  options: Readonly<Record<string, YdbTableOptionValue>>;
}

export interface YdbResetTableOptionsOperation {
  kind: "reset_table_options";
  table: string | YdbTable;
  names: [string, ...string[]];
}

export interface YdbAddColumnFamilyOperation {
  kind: "add_column_family";
  table: string | YdbTable;
  family: Pick<YdbColumnFamily["config"], "name" | "options">;
}

export interface YdbAlterColumnFamilyOperation {
  kind: "alter_column_family";
  table: string | YdbTable;
  name: string;
  options: YdbColumnFamilyOptions;
}

export interface YdbSetColumnFamilyOperation {
  kind: "set_column_family";
  table: string | YdbTable;
  familyName: string;
  columns: [YdbColumn, ...YdbColumn[]] | [string, ...string[]];
}

export type YdbMigrationOperation =
  | YdbCreateTableOperation
  | YdbDropTableOperation
  | YdbAddColumnsOperation
  | YdbDropColumnsOperation
  | YdbAddIndexOperation
  | YdbDropIndexOperation
  | YdbSetTableOptionsOperation
  | YdbResetTableOptionsOperation
  | YdbAddColumnFamilyOperation
  | YdbAlterColumnFamilyOperation
  | YdbSetColumnFamilyOperation;

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

function escapeDoubleQuoted(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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

function renderColumnDefinition(column: YdbColumn, familyName?: string): string {
  ensureSupportedColumn(column);

  const parts = [escapeName(column.name), column.getSQLType()];
  if (familyName) {
    parts.push("FAMILY", escapeName(familyName));
  }

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

function isRawTableOptionValue(value: YdbTableOptionValue): value is Extract<YdbTableOptionValue, { kind: "raw" }> {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "raw";
}

function renderTableOptionValue(value: YdbTableOptionValue): string {
  if (isRawTableOptionValue(value)) {
    return value.value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }

  return value;
}

function renderTableOptions(options: Readonly<Record<string, YdbTableOptionValue>>): string[] {
  return Object.entries(options).map(([key, value]) => `${key} = ${renderTableOptionValue(value)}`);
}

function renderTtl(ttl: YdbTtl): string {
  const { column, actions, unit } = ttl.config;
  const actionSql = actions.map((action) => {
    const interval = `Interval(${escapeDoubleQuoted(action.interval)})`;

    if ("externalDataSource" in action) {
      return `${interval} TO EXTERNAL DATA SOURCE ${escapeName(action.externalDataSource)}`;
    }

    return action.delete === true ? `${interval} DELETE` : interval;
  }).join(", ");
  const unitSql = unit ? ` AS ${unit}` : "";

  return `${actionSql} ON ${escapeName(column.name)}${unitSql}`;
}

function collectWithOptions(tableOptions: readonly YdbTableOptions[], ttls: readonly YdbTtl[]): string[] {
  const rendered: string[] = [];
  const used = new Set<string>();

  for (const tableOption of tableOptions) {
    for (const [key, value] of Object.entries(tableOption.config.options)) {
      if (used.has(key)) {
        throw new Error(`YDB migrate() duplicate table option "${key}"`);
      }
      used.add(key);
      rendered.push(`${key} = ${renderTableOptionValue(value)}`);
    }
  }

  if (ttls.length > 1) {
    throw new Error("YDB migrate() supports only one TTL definition per table");
  }

  if (ttls.length === 1) {
    if (used.has("TTL")) {
      throw new Error('YDB migrate() duplicate table option "TTL"');
    }
    rendered.push(`TTL = ${renderTtl(ttls[0]!)}`);
  }

  return rendered;
}

function renderColumnFamilyOptions(options: YdbColumnFamilyOptions): string[] {
  const rendered: string[] = [];
  if (options.data !== undefined) {
    rendered.push(`DATA = ${escapeDoubleQuoted(options.data)}`);
  }
  if (options.compression !== undefined) {
    rendered.push(`COMPRESSION = ${escapeDoubleQuoted(options.compression)}`);
  }
  if (options.compressionLevel !== undefined) {
    rendered.push(`COMPRESSION_LEVEL = ${String(options.compressionLevel)}`);
  }
  return rendered;
}

function renderColumnFamilyAlterActions(name: string, options: YdbColumnFamilyOptions): string[] {
  const familyName = escapeName(name);
  const rendered: string[] = [];
  if (options.data !== undefined) {
    rendered.push(`ALTER FAMILY ${familyName} SET DATA ${escapeDoubleQuoted(options.data)}`);
  }
  if (options.compression !== undefined) {
    rendered.push(`ALTER FAMILY ${familyName} SET COMPRESSION ${escapeDoubleQuoted(options.compression)}`);
  }
  if (options.compressionLevel !== undefined) {
    rendered.push(`ALTER FAMILY ${familyName} SET COMPRESSION_LEVEL ${String(options.compressionLevel)}`);
  }
  return rendered;
}

function renderColumnFamilyDefinition(family: Pick<YdbColumnFamily["config"], "name" | "options">): string {
  const options = renderColumnFamilyOptions(family.options);
  return options.length > 0
    ? `FAMILY ${escapeName(family.name)} (${options.join(", ")})`
    : `FAMILY ${escapeName(family.name)}`;
}

function getColumnFamilyByColumnName(columnFamilies: readonly YdbColumnFamily[]): Map<string, string> {
  const familyByColumn = new Map<string, string>();
  const usedFamilyNames = new Set<string>();

  for (const family of columnFamilies) {
    if (usedFamilyNames.has(family.config.name)) {
      throw new Error(`YDB migrate() duplicate column family "${family.config.name}"`);
    }
    usedFamilyNames.add(family.config.name);

    for (const column of family.config.columns) {
      const existing = familyByColumn.get(column.name);
      if (existing) {
        throw new Error(`YDB migrate() column "${column.name}" is assigned to both "${existing}" and "${family.config.name}" families`);
      }

      familyByColumn.set(column.name, family.config.name);
    }
  }

  return familyByColumn;
}

function renderPartitioning(partitioning: ReturnType<typeof getTableConfig>["partitioning"]): string | undefined {
  if (partitioning.length === 0) {
    return undefined;
  }

  if (partitioning.length > 1) {
    throw new Error("YDB migrate() supports only one PARTITION BY definition per table");
  }

  const partitioningConfig = partitioning[0]!.config;
  return `PARTITION BY HASH(${partitioningConfig.columns.map((column) => escapeName(column.name)).join(", ")})`;
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
  const { columns, indexes, primaryKeys, uniqueConstraints, tableOptions, partitioning, ttls, columnFamilies } = getTableConfig(table);

  const primaryKeyColumns = getPrimaryKeyColumns(columns, primaryKeys);
  if (primaryKeyColumns.length === 0) {
    throw new Error(`YDB migrate() CREATE TABLE requires a primary key for "${getTableName(table)}"`);
  }

  const familyByColumnName = getColumnFamilyByColumnName(columnFamilies);
  const definitions = [
    ...columns.map((column) => renderColumnDefinition(column, familyByColumnName.get(column.name))),
    ...indexes.map((index) => renderIndexConfig(index.config)),
    ...uniqueConstraints.map((constraint) => renderIndexConfig(uniqueConstraintToIndex(constraint))),
    ...columnFamilies.map((family) => renderColumnFamilyDefinition(family.config)),
    `PRIMARY KEY (${primaryKeyColumns.map((column) => escapeName(column.name)).join(", ")})`,
  ];
  const partitioningSql = renderPartitioning(partitioning);
  const withOptions = collectWithOptions(tableOptions, ttls);

  const parts = [
    `CREATE TABLE ${options.ifNotExists ? "IF NOT EXISTS " : ""}${escapeName(getTableName(table))} (`,
    definitions.map((definition) => `  ${definition}`).join(",\n"),
    `)`,
  ];

  if (partitioningSql) {
    parts.push(partitioningSql);
  }

  if (withOptions.length > 0) {
    parts.push("WITH (", withOptions.map((option) => `  ${option}`).join(",\n"), ")");
  }

  return parts.join("\n");
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

export function buildAlterTableSetOptionsSql(
  table: string | YdbTable,
  options: Readonly<Record<string, YdbTableOptionValue>>,
): string {
  const renderedOptions = renderTableOptions(options);
  if (renderedOptions.length === 0) {
    throw new Error("YDB migrate() ALTER TABLE SET requires at least one option");
  }

  return `ALTER TABLE ${escapeName(getObjectName(table))} SET (${renderedOptions.join(", ")})`;
}

export function buildAlterTableResetOptionsSql(table: string | YdbTable, names: [string, ...string[]]): string {
  return `ALTER TABLE ${escapeName(getObjectName(table))} RESET (${names.join(", ")})`;
}

export function buildAddColumnFamilySql(
  table: string | YdbTable,
  family: Pick<YdbColumnFamily["config"], "name" | "options">,
): string {
  return `ALTER TABLE ${escapeName(getObjectName(table))} ADD ${renderColumnFamilyDefinition(family)}`;
}

export function buildAlterColumnFamilySql(
  table: string | YdbTable,
  name: string,
  options: YdbColumnFamilyOptions,
): string {
  const actions = renderColumnFamilyAlterActions(name, options);
  if (actions.length === 0) {
    throw new Error("YDB migrate() ALTER FAMILY requires at least one option");
  }

  return `ALTER TABLE ${escapeName(getObjectName(table))} ${actions.join(", ")}`;
}

export function buildAlterColumnSetFamilySql(
  table: string | YdbTable,
  columns: [YdbColumn, ...YdbColumn[]] | [string, ...string[]],
  familyName: string,
): string[] {
  return columns.map((column) => {
    const columnName = typeof column === "string" ? column : column.name;
    return `ALTER TABLE ${escapeName(getObjectName(table))} ALTER COLUMN ${escapeName(columnName)} SET FAMILY ${escapeName(familyName)}`;
  });
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
      case "set_table_options":
        statements.push(buildAlterTableSetOptionsSql(operation.table, operation.options));
        break;
      case "reset_table_options":
        statements.push(buildAlterTableResetOptionsSql(operation.table, operation.names));
        break;
      case "add_column_family":
        statements.push(buildAddColumnFamilySql(operation.table, operation.family));
        break;
      case "alter_column_family":
        statements.push(buildAlterColumnFamilySql(operation.table, operation.name, operation.options));
        break;
      case "set_column_family":
        statements.push(...buildAlterColumnSetFamilySql(operation.table, operation.columns, operation.familyName));
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
