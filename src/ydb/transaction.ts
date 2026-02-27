import { entityKind } from "drizzle-orm/entity";
import { PgTransaction } from "drizzle-orm/pg-core";
import type { TablesRelationalConfig } from "drizzle-orm/relations";
import type { YdbQueryResultHKT } from "./session.js";

export class YdbTransaction<
  TFullSchema extends Record<string, unknown> = Record<string, never>,
  TSchema extends TablesRelationalConfig = Record<string, never>,
> extends PgTransaction<YdbQueryResultHKT, TFullSchema, TSchema> {
  static readonly [entityKind] = "YdbTransaction";

  override async transaction<T>(_transaction: (tx: YdbTransaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
    throw new Error("Nested transactions are not supported by the YDB");
  }
}
