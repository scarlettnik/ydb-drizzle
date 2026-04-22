---
title: Analytical helpers
description: Сегментированная справка по GROUP BY helpers, windowDefinition, sessionWindow, HOP and KNN helpers.
---

# Analytical helpers

Analytical helpers render YDB expressions for grouping, windows, session windows and vector search.

Обзор раздела: [YDB/YQL helpers](../ydb-yql-helpers.md).

## UNIQUE and DISTINCT hints

```ts
await db
  .select()
  .from(users)
  .uniqueDistinct(
    uniqueHint("id"),
    distinctHint("name"),
  );
```

The helpers validate hint column names before rendering.

## Window definition

```ts
const w = windowDefinition({
  partitionBy: [users.tenantId],
  orderBy: [users.id],
  frame: "ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW",
});
```

Use `window(name, definition)` on the SELECT builder to attach named windows.

## GROUP BY helpers

```ts
groupKey(users.tenantId, "tenant");
rollup(users.country, users.city);
cube(users.country, users.city);
groupingSets([users.country], [users.city]);
grouping(users.country, users.city);
```

These helpers return SQL fragments that can be passed to `groupBy()`.

## Session and HOP windows

```ts
sessionWindow(events.createdAt, "PT30M");
sessionStart();

hop(events.createdAt, "PT1M", "PT5M", "PT0S");
hopStart();
hopEnd();
```

The extended `sessionWindow()` overload requires `init`, `update` and `calculate` lambdas.

## KNN helpers

```ts
knnCosineDistance(items.embedding, sql`$target`);
knnEuclideanDistance(items.embedding, sql`$target`);
knnManhattanDistance(items.embedding, sql`$target`);
knnCosineSimilarity(items.embedding, sql`$target`);
knnInnerProductSimilarity(items.embedding, sql`$target`);
```

Generic forms:

```ts
knnDistance("CosineDistance", items.embedding, sql`$target`);
knnSimilarity("InnerProductSimilarity", items.embedding, sql`$target`);
```
