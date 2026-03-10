import { QueryPromise } from "drizzle-orm/query-promise";
import { sql, type SQL } from "drizzle-orm/sql/sql";
import { orderSelectedFields } from "../result-mapping.js";
import { getTableColumns } from "./utils.js";
import type { YdbPreparedQueryConfig, YdbSession } from "../session.js";
import type { YdbTable } from "../table.js";

function buildSelection(fields: Record<string, unknown>): SQL {
  const entries = Object.values(fields);
  if (entries.length === 0) {
    return sql.raw("*");
  }
  return sql.join(entries.map((value) => sql`${value}`), sql`, `);
}

export class YdbSelectBuilder<TResult = unknown[]> extends QueryPromise<TResult> {
  private table?: YdbTable;
  private whereClause?: SQL;

  constructor(
    private readonly session: YdbSession,
    private readonly fields?: Record<string, unknown>,
  ) {
    super();
  }

  from(table: YdbTable): this {
    this.table = table;
    return this;
  }

  where(where: SQL | undefined): this {
    this.whereClause = where ?? undefined;
    return this;
  }

  private getSelectedFields(): Record<string, unknown> {
    if (!this.table) {
      throw new Error("Missing table in select().from()");
    }

    return this.fields ?? getTableColumns(this.table);
  }

  getSQL(): SQL {
    if (!this.table) {
      throw new Error("Missing table in select().from()");
    }

    const selection = buildSelection(this.getSelectedFields());
    const whereSql = this.whereClause ? sql` where ${this.whereClause}` : undefined;
    return sql`select ${selection} from ${this.table}${whereSql}`;
  }

  toSQL() {
    const prepared = this.session.prepareQuery<YdbPreparedQueryConfig>(this.getSQL(), orderSelectedFields(this.getSelectedFields()));
    const { typings: _typings, ...query } = prepared.getQuery();
    return query;
  }

  prepare(name?: string) {
    return this.session.prepareQuery<YdbPreparedQueryConfig & { execute: TResult; all: TResult }>(
      this.getSQL(),
      orderSelectedFields(this.getSelectedFields()),
      name,
      true,
    );
  }

  override execute(): Promise<TResult> {
    return this.prepare().execute() as Promise<TResult>;
  }
}
