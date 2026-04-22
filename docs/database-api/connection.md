---
title: Подключение и createDrizzle
description: Варианты подключения через createDrizzle, drizzle, готовый client, executor или callback.
---

# Подключение и createDrizzle

`createDrizzle()` создает экземпляр `YdbDatabase`. Функция принимает строку подключения, готовый client, executor, transactional executor или callback для удаленного выполнения запросов.

Обзор раздела: [Database API](../database-api.md).

## Строка подключения

```ts
import { createDrizzle } from "ydb-drizzle-adapter";
import * as schema from "./schema.js";

export const db = createDrizzle({
  connectionString: process.env.YDB_CONNECTION_STRING!,
  schema,
});
```

При таком способе адаптер сам создает `YdbDriver`.

## Готовый client

```ts
import { createDrizzle, YdbDriver } from "ydb-drizzle-adapter";
import * as schema from "./schema.js";

const client = new YdbDriver("grpc://localhost:2136/local");

export const db = createDrizzle({
  client,
  schema,
});
```

Используйте этот вариант, когда жизненный цикл драйвера контролируется приложением.

## Executor

```ts
import { createDrizzle, type YdbExecutor } from "ydb-drizzle-adapter";

const executor: YdbExecutor = {
  execute(sql, params, method, options) {
    return remoteExecute(sql, params, method, options);
  },
};

export const db = createDrizzle(executor);
```

Executor должен возвращать `YdbQueryResult`. Transactional executor дополнительно реализует `transaction(callback, config)`.

## Remote callback

```ts
import { createDrizzle } from "ydb-drizzle-adapter";

const db = createDrizzle(async (sql, params, method, options) => {
  return remoteExecute(sql, params, method, options);
});
```

Этот вариант предназначен для RPC-оберток, edge-окружений и тестов.

## Alias drizzle

```ts
import { drizzle } from "ydb-drizzle-adapter";

const db = drizzle({
  connectionString: process.env.YDB_CONNECTION_STRING!,
});
```

`drizzle` является alias для `createDrizzle`.
