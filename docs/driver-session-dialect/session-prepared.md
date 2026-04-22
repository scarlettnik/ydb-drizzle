---
title: YdbSession и YdbPreparedQuery
description: Сегментированная справка по prepareQuery, execute, all, get, values, batch, count, transaction and prepared query methods.
---

# YdbSession и YdbPreparedQuery

`YdbSession` binds executor, dialect, logger and result mapping.

Обзор раздела: [Driver, Session и Dialect](../driver-session-dialect.md).

## Creating a session

```ts
import { YdbDialect, YdbDriver, YdbSession } from "ydb-drizzle-adapter";

const driver = new YdbDriver(process.env.YDB_CONNECTION_STRING!);
const session = new YdbSession(driver, new YdbDialect());
```

## prepareQuery

```ts
const prepared = session.prepareQuery(
  sql`SELECT 1 AS value`,
  undefined,
  "select_one",
  false,
);
```

Arguments:

- `query`
- `fields`
- `name`
- `isResponseInArrayMode`
- `customResultMapper`

## Execution helpers

```ts
await session.execute(sql`UPSERT INTO users (id) VALUES (1)`);
await session.all(sql`SELECT 1 AS value`);
await session.get(sql`SELECT 1 AS value`);
await session.values<[number]>(sql`SELECT 1`);
```

Array mode:

```ts
await session.execute(sql`SELECT 1`, { arrayMode: true });
```

## batch

```ts
const [created, selected] = await session.batch([
  sql`UPSERT INTO users (id, name) VALUES (1, "Ada")`,
  sql`SELECT * FROM users`,
]);
```

`batch()` executes queries sequentially and accepts raw query, `YdbPreparedQuery` or builder with `prepare()`.

## count

```ts
const count = await session.count(sql`SELECT count(*) FROM users`);
```

`count()` returns `Number(firstRow[0] ?? 0)`.

## transaction

```ts
await session.transaction(async (tx) => {
  await tx.execute(sql`UPSERT INTO users (id, name) VALUES (1, "Ada")`);
});
```

If the executor does not support transactions, the session throws `Transactions are not supported`.

## YdbPreparedQuery

```ts
prepared.getQuery();
prepared.isResponseInArrayMode();
prepared.mapResult(rows);
await prepared.execute();
await prepared.all();
await prepared.get();
await prepared.values();
```

Prepared query execution logs SQL through Drizzle logger before calling the executor.

## Result metadata

Returned row arrays receive non-enumerable metadata:

- `rowCount`
- `command`
- `meta`

The metadata does not alter JSON serialization.
