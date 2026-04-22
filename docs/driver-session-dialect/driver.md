---
title: YdbDriver
description: Конструкторы YdbDriver, ready, execute, transaction, close и fromCallback.
---

# YdbDriver

`YdbDriver` реализует `YdbTransactionalExecutor` поверх `ydb-sdk` и `@ydbjs/query`.

Обзор раздела: [Driver, Session и Dialect](../driver-session-dialect.md).

## Конструкторы

```ts
import { Driver } from "@ydbjs/core";
import { YdbDriver } from "ydb-drizzle-adapter";

const fromString = new YdbDriver("grpc://localhost:2136/local");
const fromOptions = new YdbDriver({
  connectionString: "grpc://localhost:2136/local",
});

const existing = new Driver("grpc://localhost:2136/local");
const borrowed = new YdbDriver(existing);
```

Если `YdbDriver` создан из строки подключения или options, он владеет внутренним `Driver` и закрывает его в `close()`. Если передан готовый `Driver`, `close()` не закрывает его.

## ready

```ts
await driver.ready();

const controller = new AbortController();
await driver.ready(controller.signal);
```

## execute

```ts
const result = await driver.execute(
  "SELECT $p0 AS value",
  [1],
  "all",
  { arrayMode: false },
);
```

Returns:

```ts
interface YdbQueryResult {
  rows: unknown[];
  rowCount?: number;
  command?: "all" | "execute";
  meta?: {
    arrayMode: boolean;
    typings?: unknown[];
  };
}
```

## transaction

```ts
await driver.transaction(async (tx) => {
  await tx.execute(
    "UPSERT INTO `users` (`id`) VALUES ($p0)",
    [1],
    "execute",
  );
}, {
  accessMode: "read write",
  isolationLevel: "serializableReadWrite",
});
```

`transaction()` passes a transaction-bound executor into the callback.

## close

```ts
driver.close();
```

The method closes only owned drivers.

## fromCallback

```ts
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

Use `fromCallback()` for remote execution, RPC bridges and tests.
