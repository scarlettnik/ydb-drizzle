import { DefaultLogger, type Logger } from "drizzle-orm/logger";
import { createTableRelationsHelpers, extractTablesRelationalConfig } from "drizzle-orm/relations";
import type { Casing } from "drizzle-orm/utils";
import { YdbDialect } from "./dialect.js";
import { YdbDriver, type YdbExecutor, type YdbRemoteCallback } from "./driver.js";
import type {
  YdbSchemaDefinition,
  YdbSchemaRelations,
  YdbSchemaWithoutTables,
} from "../ydb-core/schema.types.js";
import { YdbSession } from "../ydb-core/session.js";
import { YdbDatabase } from "../ydb-core/db.js";

/**
 * Shared configuration for `createDrizzle()` / `drizzle()`.
 *
 * @typeParam TSchemaDefinition - User schema object passed via `schema`, for example `{ users, posts }`.
 */
export interface YdbDrizzleConfig<TSchemaDefinition extends YdbSchemaDefinition = YdbSchemaWithoutTables> {
  casing?: Casing;
  logger?: boolean | Logger;
  /** Exact schema object that powers typed queries like `db.query.users.findMany()`. */
  schema?: TSchemaDefinition;
}

/**
 * Connection-oriented overload input for `createDrizzle()`.
 *
 * @typeParam TSchemaDefinition - User schema object passed via `schema`, for example `{ users, posts }`.
 */
export interface YdbDrizzleOptions<TSchemaDefinition extends YdbSchemaDefinition = YdbSchemaWithoutTables>
  extends YdbDrizzleConfig<TSchemaDefinition> {
  connectionString?: string;
  client?: YdbExecutor;
}

/**
 * Concrete database instance returned by `createDrizzle()` / `drizzle()`.
 *
 * @typeParam TSchemaDefinition - User schema object passed via `schema`, for example `{ users, posts }`.
 */
export type YdbDrizzleDatabase<TSchemaDefinition extends YdbSchemaDefinition = YdbSchemaWithoutTables> =
  YdbDatabase<TSchemaDefinition, YdbSchemaRelations<TSchemaDefinition>> & { $client: YdbExecutor };

function isYdbExecutor(value: unknown): value is YdbExecutor {
  return !!value && typeof value === "object" && typeof (value as YdbExecutor).execute === "function";
}

function makeDb<TSchemaDefinition extends YdbSchemaDefinition>(
  executor: YdbExecutor,
  config: YdbDrizzleConfig<TSchemaDefinition> = {},
): YdbDrizzleDatabase<TSchemaDefinition> {
  const dialect = new YdbDialect({ casing: config.casing });

  let logger: Logger | undefined = undefined;
  if (config.logger === true) {
    logger = new DefaultLogger();
  } else if (config.logger !== false) {
    logger = config.logger;
  }

  const schema = config.schema
    ? (() => {
      const tablesConfig = extractTablesRelationalConfig(
        config.schema,
        createTableRelationsHelpers,
      );

      return {
        fullSchema: config.schema,
        schema: tablesConfig.tables as YdbSchemaRelations<TSchemaDefinition>,
        tableNamesMap: tablesConfig.tableNamesMap,
      };
    })()
    : undefined;

  const session = new YdbSession(executor, dialect, { logger });
  const db = new YdbDatabase<TSchemaDefinition>(dialect, session, schema) as YdbDrizzleDatabase<TSchemaDefinition>;
  db.$client = executor;
  return db;
}

function isYdbOptions<TSchemaDefinition extends YdbSchemaDefinition>(
  value: unknown,
): value is YdbDrizzleOptions<TSchemaDefinition> {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (isYdbExecutor(value)) {
    return false;
  }

  return "connectionString" in value || "client" in value || "schema" in value;
}

/**
 * Creates a YDB-backed Drizzle database instance from an executor, callback, or connection options.
 *
 * @typeParam TSchemaDefinition - User schema object passed via `schema`, for example `{ users, posts }`.
 */
export function createDrizzle<TSchemaDefinition extends YdbSchemaDefinition>(
  input: YdbExecutor | YdbRemoteCallback,
  config: YdbDrizzleConfig<TSchemaDefinition> & { schema: TSchemaDefinition },
): YdbDrizzleDatabase<TSchemaDefinition>;
export function createDrizzle(
  input: YdbExecutor | YdbRemoteCallback,
  config?: YdbDrizzleConfig<YdbSchemaWithoutTables>,
): YdbDrizzleDatabase<YdbSchemaWithoutTables>;
export function createDrizzle<TSchemaDefinition extends YdbSchemaDefinition>(
  input: YdbDrizzleOptions<TSchemaDefinition> & { schema: TSchemaDefinition },
): YdbDrizzleDatabase<TSchemaDefinition>;
export function createDrizzle(
  input: YdbDrizzleOptions<YdbSchemaWithoutTables>,
): YdbDrizzleDatabase<YdbSchemaWithoutTables>;
export function createDrizzle<TSchemaDefinition extends YdbSchemaDefinition = YdbSchemaWithoutTables>(
  input: YdbExecutor | YdbRemoteCallback | YdbDrizzleOptions<TSchemaDefinition>,
  config?: YdbDrizzleConfig<TSchemaDefinition>,
): YdbDrizzleDatabase<TSchemaDefinition> {
  if (typeof input === "function") {
    return makeDb(YdbDriver.fromCallback(input), config);
  }

  if (isYdbExecutor(input)) {
    return makeDb(input, config);
  }

  if (isYdbOptions<TSchemaDefinition>(input)) {
    if (input.client) {
      return makeDb(input.client, input);
    }
    if (input.connectionString) {
      const client = new YdbDriver(input.connectionString);
      return makeDb(client, input);
    }
    throw new Error("Must include either `client` or `connectionString`.");
  }

  return makeDb(input, config);
}

export const drizzle = createDrizzle;
