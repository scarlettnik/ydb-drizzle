---
title: Таблицы
description: Сегментированная справка по ydbTable, ydbTableCreator и структуре table extra config.
---

# Таблицы

`ydbTable()` объявляет таблицу YDB для схемы, построителей запросов и DDL helpers.

Обзор раздела: [Таблицы, колонки и индексы](../schema.md).

## ydbTable

```ts
import { integer, primaryKey, text, ydbTable } from "ydb-drizzle-adapter";

export const users = ydbTable(
  "users",
  {
    id: integer("id").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    primaryKey(table.id),
  ],
);
```

`extraConfig` принимает массив или объект metadata builders:

- `primaryKey`
- `unique`
- `index`
- `uniqueIndex`
- `vectorIndex`
- `tableOptions`
- `partitionByHash`
- `ttl`
- `columnFamily`

## Builder callback

```ts
export const users = ydbTable("users", (t) => ({
  id: t.integer("id").notNull(),
  name: t.text("name").notNull(),
}));
```

Callback получает registry YDB column builders. Такой стиль полезен, когда требуется централизовать imports.

## ydbTableCreator

```ts
import { ydbTableCreator } from "ydb-drizzle-adapter";

const prefixedTable = ydbTableCreator((name) => `app_${name}`);

export const users = prefixedTable("users", (t) => ({
  id: t.integer().notNull(),
}));
```

`ydbTableCreator()` сохраняет logical table name для type-level schema metadata и применяет physical name к DDL/query rendering.

## Naming rules

- Если column builder создан без имени, имя выводится из property key.
- Physical table name используется в generated SQL.
- Table-level metadata должна ссылаться на колонки этой же таблицы.
