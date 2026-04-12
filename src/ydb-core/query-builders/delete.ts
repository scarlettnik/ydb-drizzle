import { QueryPromise } from "drizzle-orm/query-promise";
import { type SQL, type SQLWrapper } from "drizzle-orm/sql/sql";
import type { Subquery } from "drizzle-orm/subquery";
import type { YdbPreparedQueryConfig, YdbSession } from "../session.js";
import type { YdbTable } from "../table.js";
import { YdbDialect } from "../../ydb/dialect.js";

export class YdbDeleteBuilder<TResult = unknown> extends QueryPromise<TResult> {
  private whereClause?: SQL;
  private usingTables: SQLWrapper[] = [];

  constructor(
    private readonly table: YdbTable,
    private readonly session: YdbSession,
    private readonly dialect = new YdbDialect(),
    private readonly withList: Subquery[] = [],
  ) {
    super();
  }

  where(where: SQL | undefined): this {
    this.whereClause = where ?? undefined;
    return this;
  }

  using(...tables: SQLWrapper[]): this {
    this.usingTables = [...tables];
    return this;
  }

  getSQL(): SQL {
    return this.dialect.buildDeleteQuery({
      table: this.table,
      where: this.whereClause,
      using: this.usingTables.length > 0 ? [...this.usingTables] : undefined,
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
