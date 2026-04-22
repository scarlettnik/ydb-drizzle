---
title: YQL script helpers
description: Сегментированная справка по yqlScript, pragma, declareParam, commit, defineAction, doAction, doBlock and intoResult.
---

# YQL script helpers

Script helpers render YQL statements that are commonly used around DML and DDL.

Обзор раздела: [YDB/YQL helpers](../ydb-yql-helpers.md).

## yqlScript

```ts
const script = yqlScript(
  pragma("TablePathPrefix", "/local"),
  declareParam("$id", "Int32"),
  sql`SELECT $id AS id;`,
);
```

`yqlScript()` requires at least one statement.

## pragma

```ts
pragma("TablePathPrefix", "/local");
pragma("ydb.KMeansTreeSearchTopSize", "100");
kMeansTreeSearchTopSize(100);
```

Pragma names must be dotted identifiers.

## declareParam

```ts
declareParam("$id", "Int32");
declareParam("name", "Utf8");
```

Parameter names may be passed with or without the `$` prefix.

## commit

```ts
commit();
```

Renders `COMMIT;`.

## ACTION helpers

```ts
const action = defineAction("$upsert_user", ["id", "name"], [
  `UPSERT INTO users (id, name) VALUES ($id, $name);`,
]);

const call = doAction("$upsert_user", [1, "Ada"]);
```

Optional parameters:

```ts
defineAction("$action", [
  { name: "id" },
  { name: "name", optional: true },
], [
  `SELECT $id, $name;`,
]);
```

## doBlock

```ts
doBlock([
  declareParam("$id", "Int32"),
  sql`SELECT $id AS id;`,
]);
```

`doBlock()` requires at least one statement.

## intoResult

```ts
intoResult(sql`SELECT 1 AS value`, "result");
```

`intoResult()` appends `INTO RESULT` to a query or statement.
