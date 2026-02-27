import { entityKind } from "drizzle-orm/entity";
import { DefaultLogger } from "drizzle-orm/logger";
import { PgDatabase } from "drizzle-orm/pg-core/db";
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
} from "drizzle-orm/relations";
import type { DrizzleConfig } from "drizzle-orm/utils";
import { YdbDialect } from "./dialect.js";
import { YdbDriver, type YdbExecutor, type YdbRemoteCallback } from "./driver.js";
import { YdbSession, type YdbQueryResultHKT } from "./session.js";

export class YdbDatabase<TSchema extends Record<string, unknown> = Record<string, never>> extends PgDatabase<YdbQueryResultHKT, TSchema> {
  static readonly [entityKind] = "YdbDatabase";
}

export interface YdbDrizzleConfig<TSchema extends Record<string, unknown> = Record<string, never>> extends DrizzleConfig<TSchema> {}

export interface YdbDrizzleOptions<TSchema extends Record<string, unknown> = Record<string, never>>
  extends YdbDrizzleConfig<TSchema> {
  connectionString?: string;
  client?: YdbExecutor;
}

function isYdbExecutor(value: unknown): value is YdbExecutor {
  return !!value && typeof value === "object" && typeof (value as YdbExecutor).execute === "function";
}

function makeDb<TSchema extends Record<string, unknown>>(
  executor: YdbExecutor,
  config: YdbDrizzleConfig<TSchema> = {},
): YdbDatabase<TSchema> & { $client: YdbExecutor } {
  const dialect = new YdbDialect({ casing: config.casing });

  let logger = undefined;
  if (config.logger === true) {
    logger = new DefaultLogger();
  } else if (config.logger !== false) {
    logger = config.logger;
  }

  let schema = undefined;
  if (config.schema) {
    const tablesConfig = extractTablesRelationalConfig(config.schema, createTableRelationsHelpers);
    schema = {
      fullSchema: config.schema,
      schema: tablesConfig.tables,
      tableNamesMap: tablesConfig.tableNamesMap,
    };
  }

  const session = new YdbSession(executor, dialect, schema, { logger, cache: config.cache });
  const db = new YdbDatabase(dialect, session, schema) as YdbDatabase<TSchema> & { $client: YdbExecutor };
  db.$client = executor;
  if (config.cache) {
    (db as any).$cache = config.cache;
    (db as any).$cache.invalidate = config.cache.onMutate;
  }
  return db;
}

function isYdbOptions<TSchema extends Record<string, unknown>>(
  value: unknown,
): value is YdbDrizzleOptions<TSchema> {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (isYdbExecutor(value)) {
    return false;
  }

  return "connectionString" in value || "client" in value || "schema" in value;
}

export function createDrizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
  input: YdbExecutor | YdbRemoteCallback | YdbDrizzleOptions<TSchema>,
  config?: YdbDrizzleConfig<TSchema>,
): YdbDatabase<TSchema> & { $client: YdbExecutor } {
  if (typeof input === "function") {
    return makeDb(YdbDriver.fromCallback(input), config);
  }

  if (isYdbExecutor(input)) {
    return makeDb(input, config);
  }

  if (isYdbOptions<TSchema>(input)) {
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
