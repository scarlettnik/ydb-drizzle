import type {
  BuildRelationalQueryResult,
  DBQueryConfig,
  Relation,
  TableRelationalConfig,
  TablesRelationalConfig,
} from "drizzle-orm/relations";
import type { MigrationMeta } from "drizzle-orm/migrator";
import type { SQL, SQLWrapper } from "drizzle-orm/sql/sql";
import type { Subquery } from "drizzle-orm/subquery";
import type { UpdateSet } from "drizzle-orm/utils";
import type { YdbSelectedFieldsOrdered } from "../ydb-core/result-mapping.js";
import type { YdbColumn } from "../ydb-core/columns/common.js";
import type { YdbTable } from "../ydb-core/table.js";

export type YdbJoinType =
  | "inner"
  | "left"
  | "right"
  | "full"
  | "cross"
  | "left semi"
  | "right semi"
  | "left only"
  | "right only"
  | "exclusion";

export interface YdbJoinConfig {
  table: unknown;
  joinType: YdbJoinType;
  alias?: string;
  on?: SQL;
}

export interface YdbSetOperatorSource {
  getSelectedFields(): Record<string, unknown>;
  getSQL(selectionAliases?: string[]): SQL;
}

export interface YdbSetOperatorConfig {
  type: "union" | "intersect" | "except";
  isAll: boolean;
  rightSelect: YdbSetOperatorSource;
  orderBy?: SQLWrapper[];
  limit?: number;
  offset?: number;
}

export interface YdbSelectConfig {
  table?: unknown;
  fields: Record<string, unknown>;
  fieldsFlat?: YdbSelectedFieldsOrdered;
  withList?: Subquery[];
  joins?: YdbJoinConfig[];
  where?: SQL;
  groupBy?: SQLWrapper[];
  having?: SQL;
  orderBy?: SQLWrapper[];
  limit?: number;
  offset?: number;
  distinct?: boolean;
  distinctOn?: SQLWrapper[];
  selectionAliases?: string[];
  setOperators: YdbSetOperatorConfig[];
}

export interface YdbInsertConfig {
  table: YdbTable;
  values: Record<string, unknown>[] | SQL | SQLWrapper;
  select?: boolean;
  withList?: Subquery[];
  command?: "insert" | "upsert" | "replace";
  columnEntries?: Array<[string, YdbColumn]>;
  returning?: YdbSelectedFieldsOrdered;
}

export interface YdbUpdateConfig {
  table: YdbTable;
  set?: UpdateSet | Record<string, unknown>;
  where?: SQL;
  withList?: Subquery[];
  on?: SQL | SQLWrapper;
  returning?: YdbSelectedFieldsOrdered;
  batch?: boolean;
}

export interface YdbDeleteConfig {
  table: YdbTable | SQLWrapper;
  where?: SQL;
  using?: SQLWrapper[];
  withList?: Subquery[];
  on?: SQL | SQLWrapper;
  returning?: YdbSelectedFieldsOrdered;
  batch?: boolean;
}

export type YdbFlatRelationalQueryConfig = DBQueryConfig<"many", boolean>;

export interface YdbRelationalQueryConfig {
  fullSchema: Record<string, unknown>;
  schema: TablesRelationalConfig;
  tableNamesMap: Record<string, string>;
  table: YdbTable;
  tableConfig: TableRelationalConfig;
  queryConfig: true | YdbFlatRelationalQueryConfig;
  tableAlias: string;
  joinOn?: SQL;
  nestedQueryRelation?: Relation;
}

export type YdbRelationalQueryResult = BuildRelationalQueryResult<YdbTable, YdbColumn>;

export interface YdbDialectMigrationConfig {
  migrationsTable?: string;
  migrationsSchema?: string;
}

export type YdbDialectMigration = MigrationMeta & { name?: string };
