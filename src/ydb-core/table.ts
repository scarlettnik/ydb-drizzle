import { entityKind } from "drizzle-orm/entity";
import { Table, type TableConfig as TableConfigBase } from "drizzle-orm/table";
import type { YdbColumn } from "./columns/common.js";
import { getYdbColumnBuilders } from "./columns/all.js";

export type TableConfig = TableConfigBase<YdbColumn>;

export class YdbTable<T extends TableConfig = TableConfig> extends Table<T> {
  static readonly [entityKind] = "YdbTable";
}

export type YdbTableWithColumns = YdbTable & Record<string, YdbColumn>;

export type YdbTableFn = (name: string, columns: any) => YdbTableWithColumns;

function ydbTableBase(
  name: string,
  columns: any,
  schema?: string,
  baseName = name,
): YdbTableWithColumns {
  const rawTable = new YdbTable(name, schema, baseName);
  const parsedColumns = (typeof columns === "function" ? columns(getYdbColumnBuilders()) : columns) as Record<string, any>;
  const builtColumns = Object.fromEntries(
    Object.entries(parsedColumns).map(([key, builder]) => {
      (builder as any).setName?.(key);
      const column = (builder as any).build?.(rawTable);
      return [key, column];
    }),
  ) as Record<string, YdbColumn>;

  const table = Object.assign(rawTable, builtColumns);
  (table as any)[(Table as any).Symbol.Columns] = builtColumns;
  (table as any)[(Table as any).Symbol.ExtraConfigColumns] = builtColumns;
  return table as YdbTableWithColumns;
}

export const ydbTable: YdbTableFn = (name, columns) => ydbTableBase(name, columns);

export function ydbTableCreator(customizeTableName: (name: string) => string): YdbTableFn {
  return (name, columns) => ydbTableBase(customizeTableName(name), columns, undefined, name);
}
