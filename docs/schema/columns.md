---
title: Колонки и типы
description: Сегментированная справка по YDB column builders, scalar types, JSON, YSON, Decimal и customType.
---

# Колонки и типы

Колонки строятся через YDB-specific column builders. Все builders совместимы с Drizzle column modifiers, включая `notNull()`, `default()`, `$defaultFn()` и `$onUpdateFn()`.

Обзор раздела: [Таблицы, колонки и индексы](../schema.md).

## Scalar builders

| Builder | YDB type | TypeScript data |
|---------|----------|-----------------|
| `boolean` | `Bool` | `boolean` |
| `integer`, `int` | `Int32` | `number` |
| `int8` | `Int8` | `number` |
| `int16` | `Int16` | `number` |
| `bigint` | `Int64` | `bigint` |
| `uint8` | `Uint8` | `number` |
| `uint16` | `Uint16` | `number` |
| `uint32` | `Uint32` | `number` |
| `uint64` | `Uint64` | `bigint` |
| `float` | `Float` | `number` |
| `double` | `Double` | `number` |
| `dyNumber` | `DyNumber` | `string` |
| `text` | `Utf8` | `string` |
| `bytes`, `binary` | `String` | `Uint8Array` |
| `uuid` | `Uuid` | `string` |

```ts
export const users = ydbTable("users", {
  id: integer("id").notNull(),
  externalId: uuid("external_id"),
  name: text("name").notNull(),
});
```

## Date and time builders

| Builder | YDB type | TypeScript data |
|---------|----------|-----------------|
| `date` | `Date` | `Date` |
| `date32` | `Date32` | `Date` |
| `datetime` | `Datetime` | `Date` |
| `datetime64` | `Datetime64` | `Date` |
| `timestamp` | `Timestamp` | `Date` |
| `timestamp64` | `Timestamp64` | `Date` |
| `interval` | `Interval` | `number` |
| `interval64` | `Interval64` | `bigint | number` |

## JSON, YSON and Decimal

```ts
export const events = ydbTable("events", {
  id: integer("id").notNull(),
  payload: json<Record<string, unknown>>("payload"),
  document: jsonDocument<Record<string, unknown>>("document"),
  raw: yson("raw"),
  amount: decimal("amount", 22, 9),
});
```

`decimal()` принимает строковые значения и формирует YDB `Decimal("value", precision, scale)` expression.

## customType

```ts
const vector = customType<{
  data: number[];
  driverData: string;
}>({
  dataType() {
    return "List<Float>";
  },
  toDriver(value) {
    return JSON.stringify(value);
  },
  fromDriver(value) {
    return JSON.parse(String(value));
  },
});

export const embeddings = ydbTable("embeddings", {
  id: integer("id").notNull(),
  embedding: vector("embedding"),
});
```

`customType()` предназначен для YDB типов, которые не покрыты built-in builders.
