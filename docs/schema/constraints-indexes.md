---
title: Constraints и индексы
description: Сегментированная справка по primaryKey, unique, index, uniqueIndex, vectorIndex и index views.
---

# Constraints и индексы

Этот раздел описывает table-level constraints и secondary indexes.

Обзор раздела: [Таблицы, колонки и индексы](../schema.md).

## Primary key

```ts
export const users = ydbTable(
  "users",
  {
    id: integer("id").notNull(),
    tenantId: integer("tenant_id").notNull(),
  },
  (table) => [
    primaryKey(table.tenantId, table.id),
  ],
);
```

`primaryKey()` принимает одну или несколько колонок таблицы. `buildCreateTableSql()` требует primary key для `CREATE TABLE`.

## Unique constraints

```ts
export const users = ydbTable(
  "users",
  {
    id: integer("id").notNull(),
    email: text("email").notNull(),
  },
  (table) => [
    primaryKey(table.id),
    unique("users_email_unique").on(table.email),
  ],
);
```

Column-level unique constraint:

```ts
email: text("email").notNull().unique()
```

Если имя не задано, adapter строит deterministic name через `uniqueKeyName(table, columns)`.

## Secondary indexes

```ts
export const users = ydbTable(
  "users",
  {
    id: integer("id").notNull(),
    email: text("email").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    primaryKey(table.id),
    index("users_email_idx").on(table.email).global().sync().cover(table.name),
    uniqueIndex("users_email_unique_idx").on(table.email),
  ],
);
```

Index builder methods:

- `.global()`
- `.local()`
- `.sync()`
- `.async()`
- `.using(indexType)`
- `.cover(...columns)`
- `.with(options)`

## Vector indexes

```ts
export const embeddings = ydbTable(
  "embeddings",
  {
    id: integer("id").notNull(),
    embedding: bytes("embedding").notNull(),
  },
  (table) => [
    primaryKey(table.id),
    vectorIndex("embeddings_vector_idx", {
      vectorDimension: 1536,
      vectorType: "float",
      distance: "cosine",
      clusters: 128,
      levels: 2,
    }).on(table.embedding),
  ],
);
```

Vector indexes validate YDB limits and require exactly one of `distance` or `similarity`.

## indexView

```ts
const rows = await db
  .select()
  .from(indexView(users, "users_email_idx", "u"));
```

`indexView()` and `vectorIndexView()` return SQL fragments suitable for `from()`.
