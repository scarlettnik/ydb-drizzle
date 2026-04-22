---
title: CTE, rendering и особенности YDB
description: Справка по $with, with, getSQL, toSQL, prepare, execute и возможностям YQL, зависящим от версии YDB.
---

# CTE, rendering и особенности YDB

Этот раздел описывает API для композиции запросов и методы rendering, общие для SELECT и mutation builders.

Обзор раздела: [Построители запросов](../query-builders.md).

## $with

```ts
const activeUsers = db.$with("active_users").as(
  db.select({
    id: users.id,
    name: users.name,
  }).from(users).where(eq(users.active, true)),
);

const rows = await db
  .with(activeUsers)
  .select()
  .from(activeUsers);
```

Для YDB CTE рендерятся как bindings:

```sql
$active_users = (select ...);
select ... from $active_users
```

## Query builder без сессии

```ts
import { YdbQueryBuilder } from "ydb-drizzle-adapter";

const qb = new YdbQueryBuilder();

const query = qb
  .$with("source")
  .as(qb.select({ id: users.id }).from(users));
```

Такие builders подходят для переиспользуемых SQL-фрагментов и unit tests. Для выполнения запроса используйте builder, созданный через `db`.

## Методы rendering

```ts
const query = db.select().from(users);

query.getSQL(); // Drizzle SQL object
query.toSQL();  // { sql, params }
```

`toSQL()` убирает metadata Drizzle typings и возвращает SQL-текст с позиционными параметрами.

## Prepared queries

```ts
const prepared = db
  .select({ id: users.id })
  .from(users)
  .prepare("select_users");

prepared.getQuery();
await prepared.execute();
await prepared.all();
await prepared.get();
await prepared.values();
```

Prepared query methods:

- `getQuery()`
- `isResponseInArrayMode()`
- `mapResult(rows)`
- `execute()`
- `all()`
- `get()`
- `values()`

## Возможности, зависящие от версии YDB

Некоторые возможности YQL зависят от версии и конфигурации YDB. Unit tests проверяют SQL rendering, а интеграционные тесты проверяют поведение на реальном YDB там, где это возможно.

Examples:

- `SAMPLE`
- `TABLESAMPLE`
- `SessionWindow`
- selected DDL features such as `ANALYZE` and `ALTER TOPIC`

Если интеграционная проверка помечена как optional, это означает ограничение конкретного YDB окружения, а не отсутствие rendering support в адаптере.
