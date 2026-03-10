import { QueryPromise } from "drizzle-orm/query-promise";
import { sql, type SQL } from "drizzle-orm/sql/sql";
import type { YdbPreparedQueryConfig, YdbSession } from "../session.js";
import type { YdbTable } from "../table.js";
import { getInsertColumnEntries, resolveInsertValue, validateTableColumnKeys } from "./utils.js";

type InsertValues = Record<string, unknown>;

export class YdbInsertBuilder<TResult = unknown> extends QueryPromise<TResult> {
  private valuesData?: InsertValues | InsertValues[];

  constructor(
    private readonly table: YdbTable,
    private readonly session: YdbSession,
  ) {
    super();
  }

  values(values: InsertValues | InsertValues[]): this {
    this.valuesData = values;
    return this;
  }

  getSQL(): SQL {
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

    const columnEntries = getInsertColumnEntries(this.table);
    if (columnEntries.length === 0) {
      throw new Error("Insertable columns are missing");
    }

    const columnSql = columnEntries.map(([, column]) => sql.identifier(column.name));
    const valuesSql = rows.map((row) => {
      const valueSql = columnEntries.map(([key, column]) => resolveInsertValue(column, row[key]));
      const wrappedValues = valueSql.map((value) => sql`${value}`);
      return sql`(${sql.join(wrappedValues, sql`, `)})`;
    });

    return sql`insert into ${this.table} (${sql.join(columnSql, sql`, `)}) values ${sql.join(valuesSql, sql`, `)}`;
  }

  toSQL() {
    const prepared = this.session.prepareQuery<YdbPreparedQueryConfig>(this.getSQL(), undefined);
    const { typings: _typings, ...query } = prepared.getQuery();
    return query;
  }

  prepare(name?: string) {
    return this.session.prepareQuery<YdbPreparedQueryConfig & { execute: TResult }>(this.getSQL(), undefined, name, false);
  }

  override execute(): Promise<TResult> {
    return this.prepare().execute() as Promise<TResult>;
  }
}
