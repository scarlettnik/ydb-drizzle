import { DefaultLogger, type Logger } from "drizzle-orm/logger";
import { createTableRelationsHelpers, extractTablesRelationalConfig, type ExtractTablesWithRelations } from "drizzle-orm/relations";
import type { Casing } from "drizzle-orm/utils";
import { YdbDialect } from "./dialect.js";
import { YdbDriver, type YdbExecutor, type YdbRemoteCallback } from "./driver.js";
import { YdbSession } from "../ydb-core/session.js";
import { YdbDatabase } from "../ydb-core/db.js";

export interface YdbDrizzleConfig<TFullSchema extends Record<string, unknown> = Record<string, never>> {
  casing?: Casing;
  logger?: boolean | Logger;
  schema?: TFullSchema;
}

export interface YdbDrizzleOptions<TFullSchema extends Record<string, unknown> = Record<string, never>>
  extends YdbDrizzleConfig<TFullSchema> {
  connectionString?: string;
  client?: YdbExecutor;
}

export type YdbDrizzleDatabase<TFullSchema extends Record<string, unknown> = Record<string, never>> =
  YdbDatabase<TFullSchema, ExtractTablesWithRelations<TFullSchema>> & { $client: YdbExecutor };

function isYdbExecutor(value: unknown): value is YdbExecutor {
  return !!value && typeof value === "object" && typeof (value as YdbExecutor).execute === "function";
}

function makeDb<TFullSchema extends Record<string, unknown>>(
  executor: YdbExecutor,
  config: YdbDrizzleConfig<TFullSchema> = {},
): YdbDrizzleDatabase<TFullSchema> {
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
        schema: tablesConfig.tables as ExtractTablesWithRelations<TFullSchema>,
        tableNamesMap: tablesConfig.tableNamesMap,
      };
    })()
    : undefined;

  const session = new YdbSession(executor, dialect, { logger });
  const db = new YdbDatabase<TFullSchema>(dialect, session, schema) as YdbDrizzleDatabase<TFullSchema>;
  db.$client = executor;
  return db;
}

function isYdbOptions<TFullSchema extends Record<string, unknown>>(
  value: unknown,
): value is YdbDrizzleOptions<TFullSchema> {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (isYdbExecutor(value)) {
    return false;
  }

  return "connectionString" in value || "client" in value || "schema" in value;
}

export function createDrizzle<TFullSchema extends Record<string, unknown>>(
  input: YdbExecutor | YdbRemoteCallback,
  config: YdbDrizzleConfig<TFullSchema> & { schema: TFullSchema },
): YdbDrizzleDatabase<TFullSchema>;
export function createDrizzle(
  input: YdbExecutor | YdbRemoteCallback,
  config?: YdbDrizzleConfig<Record<string, never>>,
): YdbDrizzleDatabase<Record<string, never>>;
export function createDrizzle<TFullSchema extends Record<string, unknown>>(
  input: YdbDrizzleOptions<TFullSchema> & { schema: TFullSchema },
): YdbDrizzleDatabase<TFullSchema>;
export function createDrizzle(
  input: YdbDrizzleOptions<Record<string, never>>,
): YdbDrizzleDatabase<Record<string, never>>;
export function createDrizzle<TFullSchema extends Record<string, unknown> = Record<string, never>>(
  input: YdbExecutor | YdbRemoteCallback | YdbDrizzleOptions<TFullSchema>,
  config?: YdbDrizzleConfig<TFullSchema>,
): YdbDrizzleDatabase<TFullSchema> {
  if (typeof input === "function") {
    return makeDb(YdbDriver.fromCallback(input), config);
  }

  if (isYdbExecutor(input)) {
    return makeDb(input, config);
  }

  if (isYdbOptions<TFullSchema>(input)) {
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
