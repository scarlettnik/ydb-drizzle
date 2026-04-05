import { entityKind } from "drizzle-orm/entity";
import {
  getOperators,
  getOrderByOperators,
  type BuildQueryResult,
  type DBQueryConfig,
  type TableRelationalConfig,
  type TablesRelationalConfig,
} from "drizzle-orm/relations";
import { QueryPromise } from "drizzle-orm/query-promise";
import { sql, type SQL, type SQLWrapper } from "drizzle-orm/sql/sql";
import type { KnownKeysOnly, ValueOrArray } from "drizzle-orm/utils";
import { mapResultRow, orderSelectedFields } from "../result-mapping.js";
import type { YdbPreparedQueryConfig, YdbSession } from "../session.js";
import type { YdbTable } from "../table.js";
import type { YdbColumn } from "../columns/common.js";

function toArray<T>(value: ValueOrArray<T> | undefined): T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function isNumberValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

type YdbRelationalManyConfig<
  TSchema extends TablesRelationalConfig,
  TFields extends TableRelationalConfig,
> = {
  columns?: DBQueryConfig<"many", true, TSchema, TFields>["columns"];
  where?: DBQueryConfig<"many", true, TSchema, TFields>["where"];
  orderBy?: DBQueryConfig<"many", true, TSchema, TFields>["orderBy"];
  limit?: number;
  offset?: number;
};

type YdbRelationalFirstConfig<
  TSchema extends TablesRelationalConfig,
  TFields extends TableRelationalConfig,
> = Omit<YdbRelationalManyConfig<TSchema, TFields>, "limit"> & {
  limit?: never;
};

type YdbRelationalAnyConfig = {
  columns?: DBQueryConfig<"many", true>["columns"];
  where?: DBQueryConfig<"many", true>["where"];
  orderBy?: DBQueryConfig<"many", true>["orderBy"];
  limit?: number;
  offset?: number;
};

function getSelectedFields(
  tableConfig: TableRelationalConfig,
  config: YdbRelationalAnyConfig | true,
): Record<string, YdbColumn> {
  const columns = tableConfig.columns as Record<string, YdbColumn>;

  if (config === true || !config.columns) {
    return columns;
  }

  const explicitTrueEntries = Object.entries(config.columns).filter(([, include]) => include === true);
  if (explicitTrueEntries.length > 0) {
    return Object.fromEntries(
      explicitTrueEntries.flatMap(([key]) => (key in columns ? [[key, columns[key]!]] : [])),
    );
  }

  return Object.fromEntries(
    Object.entries(columns).filter(([key]) => config.columns?.[key] !== false),
  );
}

function getWhereClause(
  tableConfig: TableRelationalConfig,
  config: YdbRelationalAnyConfig | true,
): SQL | undefined {
  if (config === true || config.where === undefined) {
    return undefined;
  }

  if (typeof config.where === "function") {
    return config.where(tableConfig.columns as Record<string, YdbColumn>, getOperators());
  }

  return config.where;
}

function getOrderByClause(
  tableConfig: TableRelationalConfig,
  config: YdbRelationalAnyConfig | true,
): SQL[] {
  if (config === true || config.orderBy === undefined) {
    return [];
  }

  const orderBy = typeof config.orderBy === "function"
    ? config.orderBy(tableConfig.columns as Record<string, YdbColumn>, getOrderByOperators())
    : config.orderBy;

  return toArray(orderBy).map((field) => sql`${field as SQLWrapper}`);
}

function getLimitClause(config: YdbRelationalAnyConfig | true, mode: "many" | "first"): number | undefined {
  if (mode === "first") {
    return 1;
  }

  if (config === true || config.limit === undefined) {
    return undefined;
  }

  if (!isNumberValue(config.limit)) {
    throw new Error("YDB relational query limit must be a finite number");
  }

  return config.limit;
}

function getOffsetClause(config: YdbRelationalAnyConfig | true): number | undefined {
  if (config === true || config.offset === undefined) {
    return undefined;
  }

  if (!isNumberValue(config.offset)) {
    throw new Error("YDB relational query offset must be a finite number");
  }

  return config.offset;
}

export class YdbRelationalQueryBuilder<
  TSchema extends TablesRelationalConfig,
  TFields extends TableRelationalConfig,
> {
  static readonly [entityKind] = "YdbRelationalQueryBuilder";

  constructor(
    private readonly fullSchema: Record<string, unknown>,
    private readonly schema: TSchema,
    private readonly tableNamesMap: Record<string, string>,
    private readonly table: YdbTable,
    private readonly tableConfig: TFields,
    private readonly session: YdbSession,
  ) {}

  findMany<TConfig extends YdbRelationalManyConfig<TSchema, TFields>>(
    config?: KnownKeysOnly<TConfig, YdbRelationalManyConfig<TSchema, TFields>>,
  ): YdbRelationalQuery<BuildQueryResult<TSchema, TFields, TConfig>[]> {
    return new YdbRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.session,
      config ? (config as YdbRelationalAnyConfig) : true,
      "many",
    );
  }

  findFirst<TConfig extends YdbRelationalFirstConfig<TSchema, TFields>>(
    config?: KnownKeysOnly<TConfig, YdbRelationalFirstConfig<TSchema, TFields>>,
  ): YdbRelationalQuery<BuildQueryResult<TSchema, TFields, TConfig> | undefined> {
    return new YdbRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.session,
      config ? (config as YdbRelationalAnyConfig) : true,
      "first",
    );
  }
}

export class YdbRelationalQuery<TResult> extends QueryPromise<TResult> {
  static override readonly [entityKind] = "YdbRelationalQuery";

  declare readonly _: {
    readonly dialect: "ydb";
    readonly result: TResult;
  };

  constructor(
    private readonly _fullSchema: Record<string, unknown>,
    private readonly _schema: TablesRelationalConfig,
    private readonly _tableNamesMap: Record<string, string>,
    private readonly table: YdbTable,
    private readonly tableConfig: TableRelationalConfig,
    private readonly session: YdbSession,
    private readonly config: YdbRelationalAnyConfig | true,
    private readonly mode: "many" | "first",
  ) {
    super();
  }

  private getSelectedFields(): Record<string, YdbColumn> {
    const selectedFields = getSelectedFields(this.tableConfig, this.config);

    if (Object.keys(selectedFields).length === 0) {
      throw new Error("YDB relational query selected zero columns");
    }

    return selectedFields;
  }

  getSQL(): SQL {
    const selectedFields = this.getSelectedFields();
    const selection = sql.join(
      Object.values(selectedFields).map((field) => sql`${field}`),
      sql`, `,
    );
    const whereClause = getWhereClause(this.tableConfig, this.config);
    const orderBy = getOrderByClause(this.tableConfig, this.config);
    const limit = getLimitClause(this.config, this.mode);
    const offset = getOffsetClause(this.config);

    const whereSql = whereClause ? sql` where ${whereClause}` : undefined;
    const orderBySql = orderBy.length > 0 ? sql` order by ${sql.join(orderBy, sql`, `)}` : undefined;
    const limitSql = limit !== undefined ? sql` limit ${limit}` : undefined;
    const offsetSql = offset !== undefined ? sql` offset ${offset}` : undefined;

    return sql`select ${selection} from ${this.table}${whereSql}${orderBySql}${limitSql}${offsetSql}`;
  }

  private getOrderedFields() {
    return orderSelectedFields(this.getSelectedFields());
  }

  prepare(name?: string) {
    const orderedFields = this.getOrderedFields();
    const customResultMapper = this.mode === "first"
      ? (rows: unknown[][]) => {
        const row = rows[0];
        return (row ? mapResultRow(orderedFields, row) : undefined) as TResult;
      }
      : undefined;

    return this.session.prepareQuery<YdbPreparedQueryConfig & { execute: TResult }>(
      this.getSQL(),
      orderedFields,
      name,
      true,
      customResultMapper,
    );
  }

  toSQL() {
    const prepared = this.prepare();
    const { typings: _typings, ...query } = prepared.getQuery();
    return query;
  }

  override execute(): Promise<TResult> {
    return this.prepare().execute() as Promise<TResult>;
  }
}
