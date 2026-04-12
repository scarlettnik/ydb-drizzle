import { QueryPromise } from "drizzle-orm/query-promise";
import { sql, type SQL } from "drizzle-orm/sql/sql";
import type { Subquery } from "drizzle-orm/subquery";
import type { YdbPreparedQueryConfig, YdbSession } from "../session.js";
import type { YdbTable } from "../table.js";
import { YdbDialect } from "../../ydb/dialect.js";
import { getTableColumns, resolveUpdateValue, validateTableColumnKeys } from "./utils.js";

type UpdateValues = Record<string, unknown>;

export class YdbUpdateBuilder<TResult = unknown> extends QueryPromise<TResult> {
  private valuesData?: UpdateValues;
  private whereClause?: SQL;

  constructor(
    private readonly table: YdbTable,
    private readonly session: YdbSession,
    private readonly dialect = new YdbDialect(),
    private readonly withList: Subquery[] = [],
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

    return this.dialect.buildUpdateQuery({
      table: this.table,
      set: this.valuesData,
      where: this.whereClause,
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
