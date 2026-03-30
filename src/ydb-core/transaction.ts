import { TransactionRollbackError } from "drizzle-orm/errors";
import type { RelationalSchemaConfig, TablesRelationalConfig } from "drizzle-orm/relations";
import type { YdbTransactionConfig } from "../ydb/driver.js";
import type { YdbDialect } from "../ydb/dialect.js";
import type { YdbSession } from "./session.js";
import type {
  YdbSchemaDefinition,
  YdbSchemaRelations,
  YdbSchemaWithoutTables,
} from "./schema.types.js";
import { YdbDatabase } from "./db.js";

/**
 * Transaction-scoped database wrapper.
 *
 * @typeParam TSchemaDefinition - Raw schema object passed to `drizzle({ schema })`.
 * @typeParam TSchemaRelations - Relational metadata extracted from `TSchemaDefinition`.
 */
export class YdbTransaction<
  TSchemaDefinition extends YdbSchemaDefinition = YdbSchemaWithoutTables,
  TSchemaRelations extends TablesRelationalConfig = YdbSchemaRelations<TSchemaDefinition>,
> extends YdbDatabase<TSchemaDefinition, TSchemaRelations> {
  constructor(
    dialect: YdbDialect,
    session: YdbSession,
    schema?: RelationalSchemaConfig<TSchemaRelations>,
  ) {
    super(dialect, session, schema);
  }

  rollback(): never {
    throw new TransactionRollbackError();
  }

  override async transaction<T>(
    _transaction: (tx: YdbTransaction<TSchemaDefinition, TSchemaRelations>) => Promise<T>,
    _config?: YdbTransactionConfig,
  ): Promise<T> {
    throw new Error("Nested transactions are not supported by YDB");
  }
}
