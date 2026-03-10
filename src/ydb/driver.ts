import { Driver } from "@ydbjs/core";
import { query, type QueryClient, type TX } from "@ydbjs/query";
import { fromJs } from "@ydbjs/value";
export interface YdbTransactionConfig {
  accessMode?: "read only" | "read write";
  isolationLevel?: "serializableReadWrite" | "snapshotReadOnly";
  idempotent?: boolean;
}

export type YdbExecutionMethod = "all" | "execute";

export interface YdbExecuteOptions {
  arrayMode?: boolean;
  typings?: unknown[];
}

export interface YdbQueryResult {
  rows: unknown[];
}

export type YdbRemoteCallback = (
  sql: string,
  params: unknown[],
  method: YdbExecutionMethod,
  options?: YdbExecuteOptions,
) => Promise<YdbQueryResult>;

export interface YdbExecutor {
  execute(sql: string, params: unknown[], method: YdbExecutionMethod, options?: YdbExecuteOptions): Promise<YdbQueryResult>;
  transaction?<T>(callback: (tx: YdbExecutor) => Promise<T>, config?: YdbTransactionConfig): Promise<T>;
  ready?(signal?: AbortSignal): Promise<void>;
  close?(): Promise<void> | void;
}

function getRows<T = unknown>(result: unknown): T[] {
  if (!Array.isArray(result) || result.length === 0) {
    return [];
  }

  const [rows] = result;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

async function execQuery(
  ql: QueryClient | TX,
  text: string,
  params: unknown[],
  options?: YdbExecuteOptions,
): Promise<YdbQueryResult> {
  let query = ql(text);

  for (let i = 0; i < params.length; i++) {
    query = query.parameter(`p${i}`, fromJs(params[i] as any));
  }

  const raw = options?.arrayMode ? await query.values() : await query;
  return { rows: getRows(raw) };
}

function mapTransactionConfig(config?: YdbTransactionConfig): { isolation?: "serializableReadWrite" | "snapshotReadOnly"; idempotent?: boolean } | undefined {
  if (!config) {
    return undefined;
  }

  if (config.isolationLevel) {
    return { isolation: config.isolationLevel, idempotent: config.idempotent };
  }

  if (config.accessMode === "read only") {
    return { isolation: "snapshotReadOnly", idempotent: true };
  }

  return { isolation: "serializableReadWrite", idempotent: config.idempotent };
}

class YdbTxExecutor implements YdbExecutor {
  constructor(private readonly tx: TX) {}

  execute(sql: string, params: unknown[], _method: YdbExecutionMethod, options?: YdbExecuteOptions): Promise<YdbQueryResult> {
    return execQuery(this.tx, sql, params, options);
  }

  async transaction<T>(_callback: (tx: YdbExecutor) => Promise<T>, _config?: YdbTransactionConfig): Promise<T> {
    throw new Error("Nested transactions are not supported by YDB");
  }
}

export interface YdbDriverOptions {
  connectionString: string;
}

export class YdbDriver implements YdbExecutor {
  readonly driver: Driver;
  readonly client: QueryClient;
  #ownsDriver: boolean;

  constructor(connectionString: string);
  constructor(options: YdbDriverOptions);
  constructor(driver: Driver);
  constructor(arg: string | YdbDriverOptions | Driver) {
    if (arg instanceof Driver) {
      this.driver = arg;
      this.#ownsDriver = false;
    } else if (typeof arg === "string") {
      this.driver = new Driver(arg);
      this.#ownsDriver = true;
    } else {
      this.driver = new Driver(arg.connectionString);
      this.#ownsDriver = true;
    }

    this.client = query(this.driver);
  }

  async ready(signal?: AbortSignal): Promise<void> {
    await this.driver.ready(signal);
  }

  execute(sql: string, params: unknown[], _method: YdbExecutionMethod, options?: YdbExecuteOptions): Promise<YdbQueryResult> {
    return execQuery(this.client, sql, params, options);
  }

  async transaction<T>(callback: (tx: YdbExecutor) => Promise<T>, config?: YdbTransactionConfig): Promise<T> {
    const options = mapTransactionConfig(config);

    if (options) {
      return this.client.begin(options, async (tx) => callback(new YdbTxExecutor(tx)));
    }

    return this.client.begin(async (tx) => callback(new YdbTxExecutor(tx)));
  }

  close(): void {
    if (this.#ownsDriver) {
      this.driver.close();
    }
  }

  static fromCallback(callback: YdbRemoteCallback): YdbExecutor {
    return {
      execute(sql, params, method, options) {
        return callback(sql, params, method, options);
      },
    };
  }
}
