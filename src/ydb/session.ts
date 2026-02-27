import { NoopCache } from "drizzle-orm/cache/core/cache";
import { entityKind } from "drizzle-orm/entity";
import { NoopLogger, type Logger } from "drizzle-orm/logger";
import {
  PgPreparedQuery as PreparedQueryBase,
  PgSession,
  type PgQueryResultHKT,
  type PgTransactionConfig,
  type PreparedQueryConfig,
} from "drizzle-orm/pg-core/session";
import type { SelectedFieldsOrdered } from "drizzle-orm/pg-core/query-builders/select.types";
import type { PgDialect } from "drizzle-orm/pg-core/dialect";
import { fillPlaceholders, type QueryWithTypings } from "drizzle-orm/sql/sql";
import * as drizzleUtils from "drizzle-orm/utils";
import type { Cache } from "drizzle-orm/cache/core/cache";
import type { WithCacheConfig } from "drizzle-orm/cache/core/types";
import type { RelationalSchemaConfig, TablesRelationalConfig } from "drizzle-orm/relations";
import { YdbTransaction } from "./transaction.js";
import type { YdbExecutor } from "./driver.js";

export interface YdbSessionOptions {
  logger?: Logger;
  cache?: Cache;
}

export interface YdbPreparedQueryOptions {
  client: YdbExecutor;
  queryString: string;
  params: unknown[];
  typings?: unknown[];
  logger: Logger;
  cache: Cache;
  queryMetadata?: {
    type: "select" | "update" | "delete" | "insert";
    tables: string[];
  };
  cacheConfig?: WithCacheConfig;
  fields?: SelectedFieldsOrdered;
  isResponseInArrayMode: boolean;
  customResultMapper?: (rows: unknown[][]) => unknown;
}

export interface YdbQueryResultHKT extends PgQueryResultHKT {
  readonly row: unknown;
  readonly type: this["row"][];
}

const mapResultRow = (drizzleUtils as any).mapResultRow as (
  fields: SelectedFieldsOrdered,
  row: unknown[],
  joinsNotNullableMap?: Record<string, boolean>,
) => unknown;

class YdbPreparedQuery<T extends PreparedQueryConfig> extends PreparedQueryBase<T> {
  static readonly [entityKind] = "YdbPreparedQuery";

  private readonly client: YdbExecutor;
  private readonly queryString: string;
  private readonly params: unknown[];
  private readonly typings?: unknown[];
  private readonly logger: Logger;
  private readonly fields?: SelectedFieldsOrdered;
  private readonly _isResponseInArrayMode: boolean;
  private readonly customResultMapper?: (rows: unknown[][]) => T["execute"];

  constructor(options: YdbPreparedQueryOptions) {
    super({ sql: options.queryString, params: options.params }, options.cache, options.queryMetadata, options.cacheConfig);
    this.client = options.client;
    this.queryString = options.queryString;
    this.params = options.params;
    this.typings = options.typings;
    this.logger = options.logger;
    this.fields = options.fields;
    this._isResponseInArrayMode = options.isResponseInArrayMode;
    this.customResultMapper = options.customResultMapper as ((rows: unknown[][]) => T["execute"]) | undefined;
  }

  override async execute(placeholderValues: Record<string, unknown> = {}): Promise<T["execute"]> {
    const params = fillPlaceholders(this.params, placeholderValues);
    const { fields, customResultMapper, logger, queryString, typings } = this;
    const arrayMode = Boolean(fields || customResultMapper);

    logger.logQuery(queryString, params);

    if (/\breturning\b/i.test(queryString)) {
      throw new Error("RETURNING.");
    }

    if (!fields && !customResultMapper) {
      const { rows } = await (this as any).queryWithCache(queryString, params, async () =>
        this.client.execute(queryString, params, "execute", { arrayMode: false, typings }),
      );
      return rows as T["execute"];
    }

    const rows = await (this as any)
      .queryWithCache(queryString, params, async () => this.client.execute(queryString, params, "all", { arrayMode, typings }))
      .then((result: { rows: unknown[] }) => result.rows as unknown[][]);

    if (customResultMapper) {
      return customResultMapper(rows);
    }

    return rows.map((row) => mapResultRow(this.fields!, row, (this as any).joinsNotNullableMap)) as T["execute"];
  }

  all(placeholderValues: Record<string, unknown> = {}): Promise<T["all"]> {
    return (async () => {
      const params = fillPlaceholders(this.params, placeholderValues);
      this.logger.logQuery(this.queryString, params);
      const { rows } = await (this as any).queryWithCache(this.queryString, params, async () =>
        this.client.execute(this.queryString, params, "all", { arrayMode: false, typings: this.typings }),
      );
      return rows as T["all"];
    })();
  }

  isResponseInArrayMode(): boolean {
    return this._isResponseInArrayMode;
  }
}

export class YdbSession<
  TFullSchema extends Record<string, unknown> = Record<string, never>,
  TSchema extends TablesRelationalConfig = Record<string, never>,
> extends PgSession<YdbQueryResultHKT, TFullSchema, TSchema> {
  static readonly [entityKind] = "YdbSession";

  private readonly client: YdbExecutor;
  private readonly schema: RelationalSchemaConfig<TSchema> | undefined;
  private readonly logger: Logger;
  private readonly cache: Cache;

  constructor(client: YdbExecutor, dialect: PgDialect, schema?: RelationalSchemaConfig<TSchema>, options: YdbSessionOptions = {}) {
    super(dialect);
    this.client = client;
    this.schema = schema;
    this.logger = options.logger ?? new NoopLogger();
    this.cache = options.cache ?? new NoopCache();
  }

  override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
    query: QueryWithTypings,
    fields: SelectedFieldsOrdered | undefined,
    _name: string | undefined,
    isResponseInArrayMode: boolean,
    customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => T["execute"],
    queryMetadata?: { type: "select" | "update" | "delete" | "insert"; tables: string[] },
    cacheConfig?: WithCacheConfig,
  ): YdbPreparedQuery<T> {
    return new YdbPreparedQuery<T>({
      client: this.client,
      queryString: query.sql,
      params: query.params,
      typings: query.typings,
      logger: this.logger,
      cache: this.cache,
      queryMetadata,
      cacheConfig,
      fields,
      isResponseInArrayMode,
      customResultMapper: customResultMapper as ((rows: unknown[][]) => T["execute"]) | undefined,
    });
  }

  override async transaction<T>(
    transaction: (tx: YdbTransaction<TFullSchema, TSchema>) => Promise<T>,
    config?: PgTransactionConfig,
  ): Promise<T> {
    if (!this.client.transaction) {
      throw new Error("Transactions are not supported");
    }

    return this.client.transaction(async (txClient) => {
      const session = new YdbSession<TFullSchema, TSchema>(txClient, this.dialect, this.schema, {
        logger: this.logger,
        cache: this.cache,
      });
      const tx = new YdbTransaction<TFullSchema, TSchema>(this.dialect, session as any, this.schema);
      return transaction(tx);
    }, config);
  }
}
