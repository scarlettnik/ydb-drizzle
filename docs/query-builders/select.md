---
title: SELECT builder
description: Сегментированная справка по select, selectDistinct, from, where, groupBy, orderBy, flatten, sample и YDB-specific SELECT clauses.
---

# SELECT builder

`YdbSelectBuilder` строит YDB SELECT queries и поддерживает Drizzle-style chaining вместе с YDB-specific clauses.

Обзор раздела: [Построители запросов](../query-builders.md).

## Entry points

```ts
db.select();
db.select({ id: users.id, name: users.name });
db.selectDistinct({ name: users.name });
db.selectDistinctOn([users.name], { name: users.name });
```

Standalone builder:

```ts
import { YdbQueryBuilder } from "ydb-drizzle-adapter";

const qb = new YdbQueryBuilder();
const query = qb.select({ id: users.id }).from(users);
```

Standalone builders can be rendered with `toSQL()` but cannot execute without a database session.

## Sources

```ts
await db.select().from(users);
await db.select().fromAsTable("$rows", "r");
await db.select().fromValues([{ id: 1, name: "Ada" }], {
  alias: "v",
  columns: ["id", "name"],
});
```

Methods:

- `from(tableOrSql)`
- `fromAsTable(binding, alias?)`
- `fromValues(rows, options?)`
- `getSelectedFields()`

## Filters and grouping

```ts
await db
  .select({
    status: orders.status,
    total: sql<number>`count(*)`,
  })
  .from(orders)
  .where(eq(orders.active, true))
  .groupBy(orders.status)
  .having(sql`count(*) > 10`);
```

Methods:

- `where(predicate)`
- `having(predicate)`
- `groupBy(...expressions)`
- `groupCompactBy(...expressions)`

## Ordering and pagination

```ts
await db
  .select()
  .from(users)
  .orderBy(users.name)
  .assumeOrderBy(users.id)
  .limit(50)
  .offset(100);
```

`limit()` and `offset()` validate finite non-negative numbers.

## YDB-specific clauses

```ts
await db
  .select()
  .from(users)
  .without(users.internalNote)
  .flattenListBy(users.tags)
  .sample(0.1)
  .window("w", {
    partitionBy: [users.tenantId],
    orderBy: [users.id],
  })
  .intoResult("users_result");
```

Supported methods:

- `without(...columns)`
- `flattenBy(...expressions)`
- `flattenListBy(...expressions)`
- `flattenDictBy(...expressions)`
- `flattenOptionalBy(...expressions)`
- `flattenColumns()`
- `sample(ratio)`
- `tableSample(method, size, repeatable?)`
- `matchRecognize(config)`
- `window(name, definition)`
- `intoResult(resultName)`
- `uniqueDistinct(...hints)`
- `distinct()`
- `distinctOn(on)`

## Execution

```ts
const prepared = db.select().from(users).prepare("select_users");

prepared.getQuery();
await prepared.execute();
await prepared.all();
await prepared.get();
await prepared.values();
```

Rendering methods:

- `getSQL()`
- `toSQL()`
- `prepare(name?)`
- `execute()`
