---
title: Driver, Session и Dialect
description: YdbDriver, YdbExecutor, YdbSession, YdbPreparedQuery, result metadata и расширенное использование dialect.
---

Прикладной код должен использовать `createDrizzle()`. Низкоуровневые классы предназначены для интеграций, тестов, пользовательских executors и расширений.

## YdbDriver

`YdbDriver` реализует `YdbTransactionalExecutor`.

### Конструкторы

```ts
import { YdbDriver } from "ydb-drizzle-adapter";
import { Driver } from "@ydbjs/core";

const a = new YdbDriver("grpc://localhost:2136/local");
const b = new YdbDriver({ connectionString: "grpc://localhost:2136/local" });

const existing = new Driver("grpc://localhost:2136/local");
const c = new YdbDriver(existing);
```

Если передана строка подключения или options, `YdbDriver` владеет внутренним `Driver` и закрывает его в `close()`. Если передан существующий `Driver`, `close()` не закрывает его.

### ready

```ts
await driver.ready();

const controller = new AbortController();
await driver.ready(controller.signal);
```

### execute

```ts
const result = await driver.execute(
  "SELECT $p0 AS value",
  [1],
  "all",
  { arrayMode: false },
);
```

Сигнатура:

```ts
execute(
  sql: string,
  params: unknown[],
  method: "all" | "execute",
  options?: {
    arrayMode?: boolean;
    typings?: unknown[];
  },
): Promise<YdbQueryResult>
```

`YdbQueryResult`:

```ts
{
  rows: unknown[];
  rowCount?: number;
  command?: "all" | "execute";
  meta?: {
    arrayMode: boolean;
    typings?: unknown[];
  };
}
```

### transaction

```ts
await driver.transaction(async (tx) => {
  await tx.execute("UPSERT INTO `users` (`id`) VALUES ($p0)", [1], "execute");
}, {
  accessMode: "read write",
  isolationLevel: "serializableReadWrite",
  idempotent: true,
});
```

Config:

- `accessMode`: `"read only"` или `"read write"`;
- `isolationLevel`: `"serializableReadWrite"` или `"snapshotReadOnly"`;
- `idempotent`: boolean.

Если `isolationLevel` не задан:

- `accessMode: "read only"` превращается в `snapshotReadOnly` и `idempotent: true`;
- иначе используется `serializableReadWrite`.

### close

```ts
driver.close();
```

### fromCallback

`YdbDriver.fromCallback(callback)` предназначен для тестов, удаленного исполнения и RPC мостов.

```ts
import { YdbDriver } from "ydb-drizzle-adapter";

const executor = YdbDriver.fromCallback(async (sql, params, method, options) => {
  return {
    rows: [],
    rowCount: 0,
    command: method,
    meta: {
      arrayMode: options?.arrayMode === true,
      typings: options?.typings,
    },
  };
});
```

## YdbExecutor

Минимальный executor:

```ts
interface YdbExecutor {
  execute(
    sql: string,
    params: unknown[],
    method: "all" | "execute",
    options?: YdbExecuteOptions,
  ): Promise<YdbQueryResult>;
  ready?(signal?: AbortSignal): Promise<void>;
  close?(): Promise<void> | void;
}
```

Transactional executor добавляет:

```ts
interface YdbTransactionalExecutor extends YdbExecutor {
  transaction<T>(
    callback: (tx: YdbExecutor) => Promise<T>,
    config?: YdbTransactionConfig,
  ): Promise<T>;
}
```

## YdbSession

`YdbSession` связывает executor и dialect. `YdbDatabase` использует session внутри себя.

```ts
import { YdbDialect, YdbDriver, YdbSession } from "ydb-drizzle-adapter";

const driver = new YdbDriver(process.env.YDB_CONNECTION_STRING!);
const session = new YdbSession(driver, new YdbDialect());
```

### prepareQuery

```ts
const prepared = session.prepareQuery(
  sql`SELECT 1 AS value`,
  undefined,
  "select_one",
  false,
);
```

Аргументы:

- `query`: `SQL`, `SQLWrapper` или `QueryWithTypings`;
- `fields`: ordered selected fields для result mapping;
- `name`: optional prepared query name;
- `isResponseInArrayMode`: вернуть строки массивами;
- `customResultMapper`: пользовательская функция mapping.

### execute

```ts
await session.execute(sql`UPSERT INTO users (id) VALUES (1)`);
await session.execute(sql`SELECT 1`, { arrayMode: true });
```

### all

```ts
const rows = await session.all(sql`SELECT 1 AS value`);
```

### get

```ts
const row = await session.get(sql`SELECT 1 AS value`);
```

### values

```ts
const rows = await session.values<[number]>(sql`SELECT 1`);
```

### batch

```ts
const [created, selected] = await session.batch([
  sql`UPSERT INTO users (id, name) VALUES (1, "Ada")`,
  sql`SELECT * FROM users`,
]);
```

`batch` выполняет запросы последовательно и принимает raw query, `YdbPreparedQuery` или builder с `prepare()`.

### count

```ts
const count = await session.count(sql`SELECT count(*) FROM users`);
```

Возвращает `Number(firstRow[0] ?? 0)`.

### transaction

```ts
await session.transaction(async (tx) => {
  await tx.execute(sql`UPSERT INTO users (id, name) VALUES (1, "Ada")`);
});
```

Если executor не поддерживает transactions, будет ошибка `Transactions are not supported`.

## YdbPreparedQuery

Методы:

```ts
prepared.getQuery();
prepared.isResponseInArrayMode();
prepared.mapResult(rows);
await prepared.execute();
await prepared.all();
await prepared.get();
await prepared.values();
```

`execute`, `all`, `get`, `values` логируют query через Drizzle logger и затем вызывают executor.

## Result metadata

Результат `execute/all/values` возвращает массив строк. Адаптер добавляет non-enumerable metadata:

- `rowCount`;
- `command`;
- `meta`.

Это не изменяет результат `JSON.stringify(rows)`, но позволяет читать metadata при необходимости.

## YdbDialect

`YdbDialect` - внутренний слой рендера YQL для расширенных сценариев. Прямое использование рекомендуется только для расширений и тестов.

Публичные методы включают:

- `escapeName(name)`;
- `escapeParam(num)`;
- `escapeString(str)`;
- `prepareTyping(encoder)`;
- `buildWithCTE(queries)`;
- select/mutation render methods;
- relational query render methods;
- `migrate(migrations, session, config)`;
- `sqlToQuery(sql)`.

Пример расширенного использования:

```ts
import { YdbDialect } from "ydb-drizzle-adapter";

const dialect = new YdbDialect({ casing: "snake_case" });
const query = dialect.sqlToQuery(sql`SELECT 1`);
```

Для прикладного кода предпочтительнее `db.*` API: он стабилен для пользователей и скрывает детали mapping.
