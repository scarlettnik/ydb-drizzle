import { QueryPromise } from "drizzle-orm/query-promise";
import { sql, type SQL } from "drizzle-orm/sql/sql";
import type { YdbPreparedQueryConfig, YdbSession } from "../session.js";
import type { YdbTable } from "../table.js";
import { getTableColumns, resolveUpdateValue, validateTableColumnKeys } from "./utils.js";

type UpdateValues = Record<string, unknown>;

export class YdbUpdateBuilder<TResult = unknown> extends QueryPromise<TResult> {
  private valuesData?: UpdateValues;
  private whereClause?: SQL;

  constructor(
    private readonly table: YdbTable,
    private readonly session: YdbSession,
  ) {
    super();
  }

  set(values: UpdateValues): this {
    this.valuesData = values;
    return this;
  }

  where(where: SQL | undefined): this {
    this.whereClause = where ?? undefined;
    return this;
  }

  getSQL(): SQL {
    if (!this.valuesData) {
      throw new Error("Update values are missing");
    }

    validateTableColumnKeys(this.table, this.valuesData, "update");

    const columns = getTableColumns(this.table);
    const setEntries = Object.entries(columns).flatMap(([key, column]) => {
      const value = resolveUpdateValue(column, this.valuesData?.[key]);
      if (value === undefined) {
        return [];
      }

      return [sql`${sql.identifier(column.name)} = ${value}`];
    });

    if (setEntries.length === 0) {
      throw new Error("Update values are empty");
    }

    const setSql = sql.join(setEntries, sql`, `);
    const whereSql = this.whereClause ? sql` where ${this.whereClause}` : undefined;
    return sql`update ${this.table} set ${setSql}${whereSql}`;
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
