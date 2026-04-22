---
title: SELECT source helpers
description: Сегментированная справка по values, valuesTable, asTable и matchRecognize helper functions.
---

# SELECT source helpers

Эти helpers создают SQL fragments для источников данных в SELECT queries.

Обзор раздела: [YDB/YQL helpers](../ydb-yql-helpers.md).

## values

```ts
import { values } from "ydb-drizzle-adapter";

const fragment = values([
  [1, "Ada"],
  [2, "Grace"],
]);
```

Object rows:

```ts
values([
  { id: 1, name: "Ada" },
  { id: 2, name: "Grace" },
]);
```

`values()` validates that rows are non-empty and use consistent shape.

## valuesTable

```ts
const source = valuesTable(
  [
    { id: 1, name: "Ada" },
    { id: 2, name: "Grace" },
  ],
  {
    alias: "v",
    columns: ["id", "name"],
  },
);

await db.select().from(source);
```

`valuesTable()` returns a table source fragment suitable for `from()`.

## asTable

```ts
const source = asTable("$rows", "r");

await db.select().from(source);
```

`asTable(binding, alias?)` renders YDB `AS_TABLE($binding)`.

## matchRecognize

```ts
const clause = matchRecognize({
  partitionBy: [events.userId],
  orderBy: [events.createdAt],
  pattern: "(A B+)",
  define: {
    A: sql`${events.kind} = "start"`,
    B: sql`${events.kind} = "step"`,
  },
});

await db.select().from(events).matchRecognize(clause);
```

`matchRecognize()` accepts either structured config or pre-rendered SQL fragment.
