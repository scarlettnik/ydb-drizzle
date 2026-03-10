import { is } from "drizzle-orm/entity";
import { Param, SQL, sql } from "drizzle-orm/sql/sql";
import { Table } from "drizzle-orm/table";
import type { YdbColumn } from "../columns/common.js";
import type { YdbTable } from "../table.js";

type TableColumns = Record<string, YdbColumn>;

export function getTableColumns(table: YdbTable): TableColumns {
  return ((table as any)[(Table as any).Symbol.Columns] ?? {}) as TableColumns;
}

export function validateTableColumnKeys(
  table: YdbTable,
  input: Record<string, unknown>,
  operation: "insert" | "update",
): void {
  const columns = getTableColumns(table);

  for (const key of Object.keys(input)) {
    if (!(key in columns)) {
      throw new Error(`Unknown column "${key}" in ${operation}()`);
    }
  }
}

export function getInsertColumnEntries(table: YdbTable): Array<[string, YdbColumn]> {
  return Object.entries(getTableColumns(table)).filter(([, column]) => !(column as any).shouldDisableInsert?.());
}

export function resolveInsertValue(column: YdbColumn, value: unknown): unknown {
  if (value === undefined || (is(value, Param) && value.value === undefined)) {
    if (column.defaultFn !== undefined) {
      const defaultValue = column.defaultFn();
      return is(defaultValue, SQL) ? defaultValue : sql.param(defaultValue, column);
    }

    if (column.default === undefined && column.onUpdateFn !== undefined) {
      const onUpdateValue = column.onUpdateFn();
      return is(onUpdateValue, SQL) ? onUpdateValue : sql.param(onUpdateValue, column);
    }

    return sql`default`;
  }

  return is(value, SQL) || is(value, Param) ? value : sql.param(value, column);
}

export function resolveUpdateValue(column: YdbColumn, value: unknown): unknown {
  if (value !== undefined) {
    return is(value, SQL) || is(value, Param) ? value : sql.param(value, column);
  }

  if (column.onUpdateFn !== undefined) {
    const onUpdateValue = column.onUpdateFn();
    return is(onUpdateValue, SQL) ? onUpdateValue : sql.param(onUpdateValue, column);
  }

  return undefined;
}
