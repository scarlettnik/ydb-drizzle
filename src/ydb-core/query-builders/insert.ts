import { is } from "drizzle-orm/entity";
import { QueryPromise } from "drizzle-orm/query-promise";
import { Param, SQL, sql, type SQL as SQLType } from "drizzle-orm/sql/sql";
import type { Subquery } from "drizzle-orm/subquery";
import { haveSameKeys } from "drizzle-orm/utils";
import type { YdbPreparedQueryConfig, YdbSession } from "../session.js";
import type { YdbTable } from "../table.js";
import type { YdbColumn } from "../columns/common.js";
import { YdbDialect } from "../../ydb/dialect.js";
import { getInsertColumnEntries, getTableColumns, resolveInsertValue, validateTableColumnKeys } from "./utils.js";
import { YdbQueryBuilder } from "./query-builder.js";

type InsertValues = Record<string, unknown>;
type OnDuplicateKeyUpdateConfig = { set: InsertValues };
type InsertSelectQuery =
  | SQLType
  | {
    getSQL(): SQLType;
    getSelectedFields(): Record<string, unknown> | undefined;
  };

function qualifyAlias(alias: string, columnName: string): SQLType {
  return sql`${sql.identifier(alias)}.${sql.identifier(columnName)}`;
}

function resolveOnDuplicateValue(column: YdbColumn, value: unknown): unknown {
  return is(value, SQL) || is(value, Param) ? value : sql.param(value, column);
}

export class YdbInsertBuilder<TResult = unknown> extends QueryPromise<TResult> {
  private valuesData?: InsertValues | InsertValues[];
  private selectQuery?: InsertSelectQuery;
  private onDuplicateSet?: InsertValues;

  constructor(
    private readonly table: YdbTable,
    private readonly session: YdbSession,
    private readonly dialect = new YdbDialect(),
    private readonly withList: Subquery[] = [],
  ) {
    super();
  }

  values(values: InsertValues | InsertValues[]): this {
    this.valuesData = values;
    this.selectQuery = undefined;
    return this;
  }

  select(
    query:
      | InsertSelectQuery
      | ((qb: YdbQueryBuilder) => InsertSelectQuery),
  ): this {
    const resolved = typeof query === "function" ? query(new YdbQueryBuilder(this.dialect)) : query;

    if (
      !is(resolved, SQL)
      && !haveSameKeys(getTableColumns(this.table), resolved.getSelectedFields() ?? {})
    ) {
      throw new Error(
        "Insert select error: selected fields are not the same or are in a different order compared to the table definition",
      );
    }

    this.selectQuery = resolved;
    this.valuesData = undefined;
    return this;
  }

  onDuplicateKeyUpdate(config: OnDuplicateKeyUpdateConfig): this {
    validateTableColumnKeys(this.table, config.set, "update");
    this.onDuplicateSet = { ...config.set };
    return this;
  }

  private buildOnDuplicateKeyUpdateQuery(rows: InsertValues[]): SQLType {
    if (this.selectQuery) {
      throw new Error("YDB onDuplicateKeyUpdate() does not support insert().select(...)");
    }

    const columnEntries = getInsertColumnEntries(this.table);
    if (columnEntries.length === 0) {
      throw new Error("Insertable columns are missing");
    }

    const primaryColumns = columnEntries
      .map(([, column]) => column)
      .filter((column) => column.primary);

    if (primaryColumns.length === 0) {
      throw new Error("YDB onDuplicateKeyUpdate() requires at least one primary key column");
    }

    const incomingAlias = "__ydb_incoming";
    const incomingSql = sql.join(
      rows.map((row) => sql`select ${
        sql.join(
          columnEntries.map(([key, column]) => sql`${resolveInsertValue(column, row[key])} as ${sql.identifier(column.name)}`),
          sql`, `,
        )
      }`),
      sql` union all `,
    );

    const conflictDetectedSql = sql`${this.table}.${sql.identifier(primaryColumns[0]!.name)}`;
    const mergedSelections = sql.join(
      columnEntries.map(([key, column]) => {
        if (column.primary) {
          return sql`${qualifyAlias(incomingAlias, column.name)} as ${sql.identifier(column.name)}`;
        }

        if (this.onDuplicateSet && key in this.onDuplicateSet) {
          return sql`case when ${conflictDetectedSql} is null then ${
            qualifyAlias(incomingAlias, column.name)
          } else ${resolveOnDuplicateValue(column, this.onDuplicateSet[key])} end as ${sql.identifier(column.name)}`;
        }

        return sql`case when ${conflictDetectedSql} is null then ${
          qualifyAlias(incomingAlias, column.name)
        } else ${column} end as ${sql.identifier(column.name)}`;
      }),
      sql`, `,
    );

    const joinSql = sql.join(
      primaryColumns.map((column) => sql`${column} = ${qualifyAlias(incomingAlias, column.name)}`),
      sql` and `,
    );
    const columnList = sql.join(
      columnEntries.map(([, column]) => sql.identifier(column.name)),
      sql`, `,
    );
    const withSql = this.dialect.buildWithCTE([
      ...this.withList,
      { _: { alias: incomingAlias, sql: incomingSql } } as any,
    ]);

    return sql`${withSql}upsert into ${this.table} (${columnList}) select ${mergedSelections} from ${
      sql.identifier(incomingAlias)
    } left join ${this.table} on ${joinSql}`;
  }

  getSQL(): SQLType {
    if (this.selectQuery) {
      return this.dialect.buildInsertQuery({
        table: this.table,
        values: this.selectQuery,
        select: true,
        withList: this.withList,
      });
    }

    if (!this.valuesData) {
      throw new Error("Insert values are missing");
    }
    const rows = Array.isArray(this.valuesData) ? this.valuesData : [this.valuesData];
    if (rows.length === 0) {
      throw new Error("Insert values are empty");
    }

    for (const row of rows) {
      validateTableColumnKeys(this.table, row, "insert");
    }

    if (this.onDuplicateSet) {
      return this.buildOnDuplicateKeyUpdateQuery(rows);
    }

    return this.dialect.buildInsertQuery({
      table: this.table,
      values: rows,
      withList: this.withList,
    });
  }

  toSQL() {
    const { typings: _typings, ...query } = this.dialect.sqlToQuery(this.getSQL());
    return query;
  }

  prepare(name?: string) {
    return this.session.prepareQuery<YdbPreparedQueryConfig & { execute: TResult }>(this.getSQL(), undefined, name, false);
  }

  override execute(): Promise<TResult> {
    return this.prepare().execute() as Promise<TResult>;
  }
}
