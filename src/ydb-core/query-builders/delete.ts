import { QueryPromise } from "drizzle-orm/query-promise";
import { sql, type SQL } from "drizzle-orm/sql/sql";
import type { YdbPreparedQueryConfig, YdbSession } from "../session.js";
import type { YdbTable } from "../table.js";

export class YdbDeleteBuilder<TResult = unknown> extends QueryPromise<TResult> {
  private whereClause?: SQL;

  constructor(
    private readonly table: YdbTable,
    private readonly session: YdbSession,
  ) {
    super();
  }

  where(where: SQL | undefined): this {
    this.whereClause = where ?? undefined;
    return this;
  }

  getSQL(): SQL {
    const whereSql = this.whereClause ? sql` where ${this.whereClause}` : undefined;
    return sql`delete from ${this.table}${whereSql}`;
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
