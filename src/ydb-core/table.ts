import { entityKind } from "drizzle-orm/entity";
import { Table, type TableConfig as TableConfigBase } from "drizzle-orm/table";
import type { YdbColumn } from "./columns/common.js";
import type { YdbColumnBuilderBase } from "./columns/common.js";
import type { YdbColumnBuilders } from "./columns/all.js";
import type { YdbCheckBuilder } from "./checks.js";
import type { YdbForeignKeyBuilder } from "./foreign-keys.js";
import type { YdbIndexBuilder } from "./indexes.js";
import type { YdbPrimaryKeyBuilder } from "./primary-keys.js";
import type { YdbUniqueConstraintBuilder } from "./unique-constraint.js";
import { getYdbColumnBuilders } from "./columns/all.js";

export type TableConfig = TableConfigBase<YdbColumn>;
const drizzleTableSymbol = (Table as any).Symbol;

export class YdbTable<T extends TableConfig = TableConfig> extends Table<T> {
  static readonly [entityKind] = "YdbTable";
  static readonly Symbol = Object.assign({}, drizzleTableSymbol);
}

export type YdbTableWithColumns = YdbTable & Record<string, YdbColumn>;

export type YdbColumnsMap = Record<string, YdbColumnBuilderBase>;
export type YdbColumnsFactory = (builders: YdbColumnBuilders) => YdbColumnsMap;
export type YdbColumnsInput = YdbColumnsMap | YdbColumnsFactory;
export type YdbTableExtraConfigValue =
  | YdbIndexBuilder
  | YdbCheckBuilder
  | YdbPrimaryKeyBuilder
  | YdbUniqueConstraintBuilder
  | YdbForeignKeyBuilder;
export type YdbTableExtraConfig = Record<string, YdbTableExtraConfigValue>;
export type YdbTableExtraConfigBuilder = (
  self: YdbTableWithColumns,
) => YdbTableExtraConfigValue[] | YdbTableExtraConfig;

export interface YdbTableFn {
  (name: string, columns: YdbColumnsInput, extraConfig?: YdbTableExtraConfigBuilder): YdbTableWithColumns;
}

function ydbTableBase(
  name: string,
  columns: YdbColumnsInput,
  extraConfig?: YdbTableExtraConfigBuilder,
  schema?: string,
  baseName = name,
): YdbTableWithColumns {
  const rawTable = new YdbTable(name, schema, baseName);
  const parsedColumns = (typeof columns === "function" ? columns(getYdbColumnBuilders()) : columns) as YdbColumnsMap;
  const builtColumns = Object.fromEntries(
    Object.entries(parsedColumns).map(([key, builder]) => {
      (builder as any).setName?.(key);
      const column = (builder as any).build?.(rawTable);
      return [key, column];
    }),
  ) as Record<string, YdbColumn>;

  const table = Object.assign(rawTable, builtColumns);
  (table as any)[drizzleTableSymbol.Columns] = builtColumns;
  (table as any)[drizzleTableSymbol.ExtraConfigColumns] = builtColumns;
  if (extraConfig) {
    (table as any)[drizzleTableSymbol.ExtraConfigBuilder] = extraConfig;
  }
  return table as YdbTableWithColumns;
}

export function ydbTable(name: string, columns: YdbColumnsInput): YdbTableWithColumns;
export function ydbTable(name: string, columns: YdbColumnsInput, extraConfig: YdbTableExtraConfigBuilder): YdbTableWithColumns;
export function ydbTable(
  name: string,
  columns: YdbColumnsInput,
  extraConfig?: YdbTableExtraConfigBuilder,
): YdbTableWithColumns {
  return ydbTableBase(name, columns, extraConfig);
}

export function ydbTableCreator(customizeTableName: (name: string) => string): YdbTableFn {
  return (name, columns, extraConfig) => ydbTableBase(customizeTableName(name), columns, extraConfig, undefined, name);
}
