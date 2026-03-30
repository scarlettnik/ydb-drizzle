import { entityKind } from "drizzle-orm/entity";
import type {
  RelationalSchemaConfig,
  TablesRelationalConfig,
} from "drizzle-orm/relations";
import type { DrizzleTypeError } from "drizzle-orm/utils";
import type { SQLWrapper } from "drizzle-orm/sql/sql";
import type { YdbTransactionConfig } from "../ydb/driver.js";
import type { YdbDialect } from "../ydb/dialect.js";
import type { YdbSession } from "./session.js";
import type { YdbQuerySource } from "./session.js";
import type {
  YdbSchemaDefinition,
  YdbSchemaRelations,
  YdbSchemaWithoutTables,
} from "./schema.types.js";
import type { YdbTable } from "./table.js";
import {
  YdbDeleteBuilder,
  YdbInsertBuilder,
  YdbRelationalQueryBuilder,
  YdbSelectBuilder,
  YdbUpdateBuilder,
} from "./query-builders/index.js";

/**
 * Database shape available inside `db.transaction(...)`.
 *
 * @typeParam TSchemaDefinition - Raw schema object passed to `drizzle({ schema })`.
 * @typeParam TSchemaRelations - Relational metadata extracted from `TSchemaDefinition`.
 */
export type YdbTransactionScope<
  TSchemaDefinition extends YdbSchemaDefinition = YdbSchemaWithoutTables,
  TSchemaRelations extends TablesRelationalConfig = YdbSchemaRelations<TSchemaDefinition>,
> = YdbDatabase<TSchemaDefinition, TSchemaRelations> & {
  rollback(): never;
};

/**
 * Main Drizzle database wrapper for YDB.
 *
 * @typeParam TSchemaDefinition - Raw schema object passed to `drizzle({ schema })`.
 * @typeParam TSchemaRelations - Relational metadata extracted from `TSchemaDefinition`.
 */
export class YdbDatabase<
  TSchemaDefinition extends YdbSchemaDefinition = YdbSchemaWithoutTables,
  TSchemaRelations extends TablesRelationalConfig = YdbSchemaRelations<TSchemaDefinition>,
> {
  static readonly [entityKind] = "YdbDatabase";

  readonly _: {
    /** Relational metadata generated from `fullSchema` and used by `db.query.*`. */
    readonly schema: TSchemaRelations | undefined;
    /** Exact schema object passed to `drizzle({ schema })`. */
    readonly fullSchema: TSchemaDefinition;
    readonly tableNamesMap: Record<string, string>;
    readonly session: YdbSession;
  };

  query: TSchemaDefinition extends YdbSchemaWithoutTables ? DrizzleTypeError<
    "Seems like the schema generic is missing - did you forget to add it to your DB type?"
  >
    : {
      [K in keyof TSchemaRelations]: YdbRelationalQueryBuilder<TSchemaRelations, TSchemaRelations[K]>;
    };

  constructor(
    protected readonly dialect: YdbDialect,
    protected readonly session: YdbSession,
    schema?: RelationalSchemaConfig<TSchemaRelations>,
  ) {
    this._ = schema
      ? {
        schema: schema.schema,
        fullSchema: schema.fullSchema as TSchemaDefinition,
        tableNamesMap: schema.tableNamesMap,
        session,
      }
      : {
        schema: undefined,
        fullSchema: {} as TSchemaDefinition,
        tableNamesMap: {},
        session,
      };

    this.query = {} as typeof this.query;

    if (this._.schema) {
      for (const [tableKey, tableConfig] of Object.entries(this._.schema)) {
        const table = this._.fullSchema[tableConfig.tsName] as YdbTable | undefined;

        if (!table) {
          continue;
        }

        (this.query as Record<string, unknown>)[tableKey] = new YdbRelationalQueryBuilder(
          this._.fullSchema,
          this._.schema,
          this._.tableNamesMap,
          table,
          tableConfig,
          this.session,
        );
      }
    }
  }

  execute<T = unknown>(query: YdbQuerySource): Promise<T> {
    return this.session.execute<T>(query);
  }

  all<T = unknown>(query: YdbQuerySource): Promise<T[]> {
    return this.session.all<T>(query);
  }

  get<T = unknown>(query: YdbQuerySource): Promise<T> {
    return this.session.get<T>(query);
  }

  values<T extends unknown[] = unknown[]>(query: YdbQuerySource): Promise<T[]> {
    return this.session.values<T>(query);
  }

  select<TFields extends Record<string, unknown> | undefined = undefined>(fields?: TFields) {
    return new YdbSelectBuilder(this.session, this.dialect, fields as any);
  }

  selectDistinct<TFields extends Record<string, unknown> | undefined = undefined>(fields?: TFields) {
    return new YdbSelectBuilder(this.session, this.dialect, fields as any, { distinct: true });
  }

  selectDistinctOn<TFields extends Record<string, unknown> | undefined = undefined>(
    on: SQLWrapper | SQLWrapper[],
    fields?: TFields,
  ) {
    return new YdbSelectBuilder(this.session, this.dialect, fields as any, {
      distinctOn: Array.isArray(on) ? on : [on],
    });
  }

  insert(table: YdbTable) {
    return new YdbInsertBuilder(table, this.session);
  }

  update(table: YdbTable) {
    return new YdbUpdateBuilder(table, this.session);
  }

  delete(table: YdbTable) {
    return new YdbDeleteBuilder(table, this.session);
  }

  transaction<T>(
    transaction: (tx: YdbTransactionScope<TSchemaDefinition, TSchemaRelations>) => Promise<T>,
    config?: YdbTransactionConfig,
  ) {
    const schema = this._.schema
      ? {
        fullSchema: this._.fullSchema,
        schema: this._.schema,
        tableNamesMap: this._.tableNamesMap,
      } as RelationalSchemaConfig<TSchemaRelations>
      : undefined;

    return this.session.transaction(transaction, config, schema);
  }
}
