import { entityKind } from "drizzle-orm/entity";
import { sql as yql, type SQL } from "drizzle-orm/sql/sql";
import { getTableName } from "drizzle-orm/table";
import type { YdbColumn } from "./columns/common.js";
import type { YdbTable } from "./table.js";

export type YdbIndexLocality = "GLOBAL" | "LOCAL";
export type YdbIndexSyncMode = "SYNC" | "ASYNC";

export interface YdbIndexWithOptions {
  [key: string]: string | number | boolean;
}

export interface YdbIndexConfig {
  readonly name?: string;
  readonly table: YdbTable;
  readonly columns: readonly YdbColumn[];
  readonly unique: boolean;
  readonly locality: YdbIndexLocality;
  readonly sync: YdbIndexSyncMode;
  readonly indexType?: string;
  readonly cover: readonly YdbColumn[];
  readonly withOptions: Readonly<Record<string, string | number | boolean>>;
}

function assertColumnsBelongToTable(table: YdbTable, columns: readonly YdbColumn[], kind: string): void {
  const tableName = getTableName(table);

  for (const column of columns) {
    if (column.table !== table) {
      throw new Error(`${kind} column "${column.name}" does not belong to table "${tableName}"`);
    }
  }
}

export class YdbIndexBuilderOn {
  static readonly [entityKind] = "YdbIndexBuilderOn";

  constructor(
    private readonly name: string | undefined,
    private readonly unique: boolean,
  ) {}

  on(...columns: [YdbColumn, ...YdbColumn[]]): YdbIndexBuilder {
    return new YdbIndexBuilder(this.name, columns, this.unique);
  }
}

export class YdbIndexBuilder {
  static readonly [entityKind] = "YdbIndexBuilder";

  private locality: YdbIndexLocality = "GLOBAL";
  private syncMode: YdbIndexSyncMode = "SYNC";
  private indexType?: string;
  private coverColumns: YdbColumn[] = [];
  private withOptions: YdbIndexWithOptions = {};

  constructor(
    private readonly name: string | undefined,
    private readonly columns: [YdbColumn, ...YdbColumn[]],
    private readonly unique: boolean,
  ) {}

  global(): this {
    this.locality = "GLOBAL";
    return this;
  }

  local(): this {
    this.locality = "LOCAL";
    return this;
  }

  sync(): this {
    this.syncMode = "SYNC";
    return this;
  }

  async(): this {
    this.syncMode = "ASYNC";
    return this;
  }

  using(indexType: string): this {
    this.indexType = indexType;
    return this;
  }

  cover(...columns: YdbColumn[]): this {
    this.coverColumns = [...columns];
    return this;
  }

  with(options: YdbIndexWithOptions): this {
    this.withOptions = { ...this.withOptions, ...options };
    return this;
  }

  build(table: YdbTable): YdbIndex {
    assertColumnsBelongToTable(table, this.columns, "Index");
    assertColumnsBelongToTable(table, this.coverColumns, "Index cover");

    return new YdbIndex({
      name: this.name,
      table,
      columns: [...this.columns],
      unique: this.unique,
      locality: this.locality,
      sync: this.syncMode,
      indexType: this.indexType,
      cover: [...this.coverColumns],
      withOptions: { ...this.withOptions },
    });
  }
}

export class YdbIndex {
  static readonly [entityKind] = "YdbIndex";

  constructor(readonly config: YdbIndexConfig) {}
}

export function index(name?: string): YdbIndexBuilderOn {
  return new YdbIndexBuilderOn(name, false);
}

export function uniqueIndex(name?: string): YdbIndexBuilderOn {
  return new YdbIndexBuilderOn(name, true);
}

export function indexView(table: YdbTable | string, indexName: string, alias?: string): SQL {
  const tableSql = typeof table === "string" ? yql.identifier(table) : yql`${table}`;
  const aliasSql = alias ? yql` as ${yql.identifier(alias)}` : undefined;
  return yql`${tableSql} view ${yql.identifier(indexName)}${aliasSql}`;
}
