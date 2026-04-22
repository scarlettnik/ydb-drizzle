---
title: YDB/YQL helpers
description: VALUES, AS_TABLE, MATCH_RECOGNIZE, WINDOW, GROUP BY helpers, KNN helpers и YQL script utilities.
---

Этот модуль содержит helpers для YDB-specific YQL, которые удобнее и безопаснее, чем ручная сборка строк.

Импорт:

```ts
import { sql } from "drizzle-orm";
import {
  asTable,
  declareParam,
  kMeansTreeSearchTopSize,
  knnCosineDistance,
  pragma,
  valuesTable,
  yqlScript,
} from "ydb-drizzle-adapter";
```

## values

`values(rows)` строит YQL `VALUES`.

```ts
import { values } from "ydb-drizzle-adapter";

const source = values([
  [1, "Ada"],
  [2, "Grace"],
]);
```

Object rows:

```ts
const source = values([
  { id: 1, name: "Ada" },
  { id: 2, name: "Grace" },
]);
```

Ограничения:

- rows не может быть пустым массивом;
- array rows не могут быть пустыми;
- array rows должны иметь одинаковую длину;
- object rows должны иметь одинаковые ключи в одинаковом порядке;
- нельзя смешивать array rows и object rows;
- object keys должны быть простыми identifiers.

## valuesTable

`valuesTable(rows, { alias?, columns? })` строит `VALUES` source для `FROM`.

```ts
const rows = await db
  .select()
  .from(valuesTable([
    { id: 1, name: "Ada" },
    { id: 2, name: "Grace" },
  ], { alias: "v" }))
  .execute();
```

Если `columns` не переданы, для object rows используются keys первой строки.

```ts
valuesTable([[1, "Ada"]], {
  alias: "v",
  columns: ["id", "name"],
});
```

## asTable

`asTable(binding, alias?)` строит `AS_TABLE($binding)`.

```ts
const query = db
  .select()
  .from(asTable("rows", "r"))
  .toSQL();
```

Binding string должен выглядеть как `$name` или `name`. Alias должен быть простым identifier.
Значение `$rows` должно быть определено в окружающем YQL script или передано через custom executor; helper не добавляет параметры выполнения сам.

## matchRecognize

```ts
import { matchRecognize } from "ydb-drizzle-adapter";

const clause = matchRecognize({
  partitionBy: [events.userId],
  orderBy: [events.createdAt],
  measures: {
    firstTs: sql`FIRST(${events.createdAt})`,
  },
  rowsPerMatch: "ONE ROW PER MATCH",
  afterMatchSkip: "PAST LAST ROW",
  pattern: sql`(A B+)`,
  define: {
    A: sql`${events.kind} = 'start'`,
    B: sql`${events.kind} = 'step'`,
  },
});

await db.select().from(events).matchRecognize(clause).execute();
```

`pattern` может быть строкой или `SQLWrapper`. `measures` aliases и `define` names должны быть простыми identifiers.

## uniqueHint и distinctHint

```ts
import { distinctHint, uniqueHint } from "ydb-drizzle-adapter";

await db
  .select()
  .from(users)
  .uniqueDistinct(uniqueHint("id"), distinctHint("tenantId"))
  .execute();
```

Имена колонок в hints должны быть простыми identifiers.

## windowDefinition

```ts
import { windowDefinition } from "ydb-drizzle-adapter";

const w = windowDefinition({
  partitionBy: [users.tenantId],
  orderBy: [users.createdAt],
  frame: "ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW",
});
```

`windowDefinition` также принимает готовый `SQLWrapper`.

## GROUP BY helpers

### groupKey

```ts
import { groupKey } from "ydb-drizzle-adapter";

await db
  .select({ tenant: users.tenantId, total: sql<number>`count(*)` })
  .from(users)
  .groupBy(groupKey(users.tenantId, "tenant"))
  .execute();
```

### rollup

```ts
import { rollup } from "ydb-drizzle-adapter";

await db.select().from(events).groupBy(rollup(events.tenantId, events.kind)).execute();
```

`rollup()` требует минимум одно выражение.

### cube

```ts
import { cube } from "ydb-drizzle-adapter";

await db.select().from(events).groupBy(cube(events.tenantId, events.kind)).execute();
```

`cube()` требует минимум одно выражение.

### groupingSets

```ts
import { groupingSets } from "ydb-drizzle-adapter";

await db
  .select()
  .from(events)
  .groupBy(groupingSets([events.tenantId], [events.kind], []))
  .execute();
```

### grouping

```ts
import { grouping } from "ydb-drizzle-adapter";

await db
  .select({
    mask: grouping(events.tenantId, events.kind),
  })
  .from(events)
  .groupBy(cube(events.tenantId, events.kind))
  .execute();
```

`grouping()` требует минимум одно выражение.

## Window/session helpers

### sessionWindow

Простая форма:

```ts
import { sessionWindow } from "ydb-drizzle-adapter";

sessionWindow(events.createdAt, "Interval('PT10M')");
```

Расширенная форма:

```ts
sessionWindow(
  events.createdAt,
  sql`($row) -> { RETURN $row.created_at; }`,
  sql`($state, $row) -> { RETURN $state; }`,
  sql`($state) -> { RETURN $state; }`,
);
```

В расширенной форме необходимо передать `init`, `update` и `calculate` lambdas. Вторая позиция не может быть строкой.

### sessionStart

```ts
import { sessionStart } from "ydb-drizzle-adapter";

sql`${sessionStart()} AS session_start`;
```

### hop, hopStart, hopEnd

```ts
import { hop, hopEnd, hopStart } from "ydb-drizzle-adapter";

await db
  .select({
    windowStart: hopStart(),
    windowEnd: hopEnd(),
    total: sql<number>`count(*)`,
  })
  .from(events)
  .groupBy(hop(
    events.createdAt,
    "Interval('PT1M')",
    "Interval('PT5M')",
    "Interval('PT0S')",
  ))
  .execute();
```

## KNN helpers

Generic:

```ts
import { knnDistance, knnSimilarity } from "ydb-drizzle-adapter";

knnDistance("CosineDistance", embeddings.embedding, sql.raw("$target"));
knnSimilarity("InnerProductSimilarity", embeddings.embedding, sql.raw("$target"));
```

Distance helpers:

```ts
import {
  knnCosineDistance,
  knnEuclideanDistance,
  knnManhattanDistance,
} from "ydb-drizzle-adapter";

knnCosineDistance(embeddings.embedding, sql.raw("$target"));
knnEuclideanDistance(embeddings.embedding, sql.raw("$target"));
knnManhattanDistance(embeddings.embedding, sql.raw("$target"));
```

Similarity helpers:

```ts
import {
  knnCosineSimilarity,
  knnInnerProductSimilarity,
} from "ydb-drizzle-adapter";

knnCosineSimilarity(embeddings.embedding, sql.raw("$target"));
knnInnerProductSimilarity(embeddings.embedding, sql.raw("$target"));
```

## yqlScript

`yqlScript(...statements)` объединяет несколько YQL statements.

```ts
import { commit, declareParam, pragma, yqlScript } from "ydb-drizzle-adapter";

await db.execute(yqlScript(
  pragma("TablePathPrefix", "/local"),
  declareParam("$id", "Int32"),
  sql`UPSERT INTO users (id, name) VALUES ($id, "Ada");`,
  commit(),
));
```

`yqlScript()` требует минимум один statement.

## pragma

```ts
pragma("ydb.CostBasedOptimization", "on");
pragma("FeatureR010", true);
pragma("my.List", ["a", "b"]);
pragma("SimpleFlag");
```

Имя pragma должно быть dotted identifier: `Name` или `Name.SubName`.

## kMeansTreeSearchTopSize

```ts
import { kMeansTreeSearchTopSize } from "ydb-drizzle-adapter";

await db.execute(yqlScript(
  kMeansTreeSearchTopSize(100),
  sql`SELECT * FROM embeddings VIEW embeddings_vector_idx;`,
));
```

Это shortcut для `pragma("ydb.KMeansTreeSearchTopSize", String(value))`.

## declareParam

```ts
declareParam("$id", "Int32");
declareParam("tenantId", "Utf8");
```

Имя параметра нормализуется к `$name`. Data type не может быть пустой строкой.

## commit

```ts
commit();
```

Рендерит `COMMIT;`.

## defineAction

```ts
import { defineAction, doAction } from "ydb-drizzle-adapter";

const action = defineAction("insertUser", ["id", { name: "name", optional: true }], [
  sql`UPSERT INTO users (id, name) VALUES ($id, $name);`,
]);

await db.execute(yqlScript(
  action,
  doAction("insertUser", [1, "Ada"]),
));
```

`defineAction` требует минимум один statement. Имя action и параметры должны выглядеть как `$name` или `name`.

## doAction

```ts
doAction("insertUser", [1, "Ada"]);
doAction("EMPTY_ACTION");
```

Аргументы могут быть primitive values, `Date`, `Uint8Array`, `SQLWrapper`, `null` или `{ kind: "default" }`.

## doBlock

```ts
import { doBlock } from "ydb-drizzle-adapter";

doBlock([
  sql`UPSERT INTO users (id, name) VALUES (1, "Ada");`,
  sql`SELECT * FROM users;`,
]);
```

`doBlock()` требует минимум один statement.

## intoResult

```ts
import { intoResult } from "ydb-drizzle-adapter";

await db.execute(yqlScript(
  intoResult(sql`SELECT * FROM users`, "users_result"),
));
```

`resultName` не может быть пустой строкой и рендерится как identifier.
