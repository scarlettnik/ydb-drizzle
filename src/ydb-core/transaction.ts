import { TransactionRollbackError } from "drizzle-orm/errors";
import type { RelationalSchemaConfig, TablesRelationalConfig } from "drizzle-orm/relations";
import type { YdbTransactionConfig } from "../ydb/driver.js";
import type { YdbDialect } from "../ydb/dialect.js";
import type { YdbSession } from "./session.js";
import { YdbDatabase } from "./db.js";

export class YdbTransaction<
  TFullSchema extends Record<string, unknown> = Record<string, never>,
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
> extends YdbDatabase<TFullSchema, TSchema> {
  constructor(
    dialect: YdbDialect,
    session: YdbSession,
    schema?: RelationalSchemaConfig<TSchema>,
  ) {
    super(dialect, session, schema);
  }

  rollback(): never {
    throw new TransactionRollbackError();
  }

  override async transaction<T>(
    _transaction: (tx: YdbTransaction<TFullSchema, TSchema>) => Promise<T>,
    _config?: YdbTransactionConfig,
  ): Promise<T> {
    throw new Error("Nested transactions are not supported by YDB");
  }
}
