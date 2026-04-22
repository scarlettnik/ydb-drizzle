---
title: Методы YdbDatabase
description: Сегментированная справка по execute, all, get, values, select, insert, update, delete и count.
---

# Методы YdbDatabase

`YdbDatabase` предоставляет основной пользовательский API для выполнения YQL, построения запросов и запуска mutations.

Обзор раздела: [Database API](../database-api.md).

## Raw execution

| Метод | Назначение |
|-------|------------|
| `execute(query)` | Выполняет YQL или builder и возвращает executor-specific result. |
| `all(query)` | Возвращает все строки как массив объектов. |
| `get(query)` | Возвращает первую строку. |
| `values(query)` | Возвращает positional rows в array mode. |

```ts
import { sql } from "drizzle-orm";

await db.execute(sql`UPSERT INTO users (id, name) VALUES (1, "Ada")`);

const rows = await db.all(sql`SELECT id, name FROM users`);
const first = await db.get(sql`SELECT id, name FROM users LIMIT 1`);
const values = await db.values<[number, string]>(sql`SELECT id, name FROM users`);
```

## SELECT entrypoints

```ts
const rows = await db
  .select({
    id: users.id,
    name: users.name,
  })
  .from(users)
  .where(eq(users.id, 1));
```

Available methods:

- `select(fields?)`
- `selectDistinct(fields?)`
- `selectDistinctOn(on, fields?)`
- `$with(alias)`
- `with(...queries)`

Подробная справка: [SELECT builder](../query-builders/select.md).

## Mutation entrypoints

```ts
await db.insert(users).values({ id: 1, name: "Ada" });
await db.upsert(users).values({ id: 1, name: "Ada Lovelace" });
await db.update(users).set({ name: "Ada" }).where(eq(users.id, 1));
await db.delete(users).where(eq(users.id, 1));
```

Available methods:

- `insert(table)`
- `upsert(table)`
- `replace(table)`
- `update(table)`
- `batchUpdate(table)`
- `delete(table)`
- `batchDelete(table)`

Подробная справка: [изменение данных](../query-builders/mutations.md).

## Count

```ts
const total = await db.$count(users, eq(users.active, true));
```

`$count(source, filters?)` возвращает promise-like builder и может использоваться как scalar SQL expression.
