import { entityKind } from "drizzle-orm/entity";
import { getTableName } from "drizzle-orm/table";
import type { YdbColumn } from "./columns/common.js";
import type { YdbTable } from "./table.js";

export type YdbForeignKeyAction = "cascade" | "restrict" | "no action" | "set null" | "set default";

export interface YdbForeignKeyBuilderConfig {
  name?: string;
  columns: [YdbColumn, ...YdbColumn[]];
  foreignColumns: [YdbColumn, ...YdbColumn[]];
}

export interface YdbForeignKeyConfig {
  readonly name?: string;
  readonly table: YdbTable;
  readonly columns: readonly YdbColumn[];
  readonly foreignTable: YdbTable;
  readonly foreignColumns: readonly YdbColumn[];
  readonly onUpdate?: YdbForeignKeyAction;
  readonly onDelete?: YdbForeignKeyAction;
}

function assertLocalColumnsBelongToTable(table: YdbTable, columns: readonly YdbColumn[]): void {
  const tableName = getTableName(table);

  for (const column of columns) {
    if (column.table !== table) {
      throw new Error(`Foreign key column "${column.name}" does not belong to table "${tableName}"`);
    }
  }
}

function getForeignTable(columns: readonly YdbColumn[]): YdbTable {
  const table = columns[0]?.table as YdbTable | undefined;

  if (!table) {
    throw new Error("Foreign key requires at least one foreign column");
  }

  for (const column of columns) {
    if (column.table !== table) {
      throw new Error("Foreign key columns must belong to the same foreign table");
    }
  }

  return table;
}

export class YdbForeignKeyBuilder {
  static readonly [entityKind] = "YdbForeignKeyBuilder";

  private updateAction?: YdbForeignKeyAction;
  private deleteAction?: YdbForeignKeyAction;

  constructor(private readonly config: YdbForeignKeyBuilderConfig) {}

  onUpdate(action: YdbForeignKeyAction): this {
    this.updateAction = action;
    return this;
  }

  onDelete(action: YdbForeignKeyAction): this {
    this.deleteAction = action;
    return this;
  }

  build(table: YdbTable): YdbForeignKey {
    assertLocalColumnsBelongToTable(table, this.config.columns);

    return new YdbForeignKey({
      name: this.config.name,
      table,
      columns: [...this.config.columns],
      foreignTable: getForeignTable(this.config.foreignColumns),
      foreignColumns: [...this.config.foreignColumns],
      onUpdate: this.updateAction,
      onDelete: this.deleteAction,
    });
  }
}

export class YdbForeignKey {
  static readonly [entityKind] = "YdbForeignKey";

  constructor(readonly config: YdbForeignKeyConfig) {}
}

export function foreignKey(config: YdbForeignKeyBuilderConfig): YdbForeignKeyBuilder {
  return new YdbForeignKeyBuilder(config);
}
