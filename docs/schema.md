---
title: Схема, таблицы, колонки и индексы
description: ydbTable, column builders, primary keys, unique constraints, table options, TTL, column families и vector indexes.
---

## ydbTable

`ydbTable(name, columns, extraConfig?)` объявляет YDB-таблицу.

```ts
import {
  columnFamily,
  index,
  integer,
  partitionByHash,
  tableOptions,
  text,
  timestamp,
  ttl,
  unique,
  ydbTable,
} from "ydb-drizzle-adapter";

export const users = ydbTable("users", {
  id: integer("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull(),
}, (table) => [
  unique("users_tenant_email_unique").on(table.tenantId, table.email),
  index("users_tenant_idx").on(table.tenantId),
  partitionByHash(table.tenantId),
  ttl(table.createdAt, "P30D"),
  columnFamily("hot", { data: "ssd", compression: "lz4" }).columns(table.email, table.name),
  tableOptions({
    AUTO_PARTITIONING_BY_LOAD: "ENABLED",
    AUTO_PARTITIONING_MIN_PARTITIONS_COUNT: 4,
  }),
]);
```

`extraConfig` может вернуть массив или record. Все элементы extra config должны относиться к этой же таблице; адаптер валидирует принадлежность колонок для индексов, partitioning, TTL и column families.

## ydbTableCreator

`ydbTableCreator(customizeTableName)` задает собственное правило именования таблиц.

```ts
import { ydbTableCreator, integer, text } from "ydb-drizzle-adapter";

const appTable = ydbTableCreator((name) => `app/${name}`);

export const users = appTable("users", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});
```

## Колонки

Все column builders поддерживают стандартные Drizzle modifiers, включая `.notNull()`, `.default(...)`, `.$defaultFn(...)`, `.$onUpdateFn(...)` там, где это поддерживает базовый Drizzle builder. YDB-адаптер добавляет `.unique(name?)`.

```ts
export const accounts = ydbTable("accounts", {
  id: integer("id").primaryKey(),
  email: text("email").notNull().unique(),
});
```

`generatedAlwaysAs()` намеренно не поддерживается и выбрасывает ошибку, потому что DDL generation для generated columns в YDB-адаптере не реализован.

## Типы колонок

| Builder | YDB type | TypeScript data |
| --- | --- | --- |
| `integer(name)` / `int(name)` | `Int32` | `number` |
| `text(name)` | `Utf8` | `string` |
| `boolean(name)` | `Bool` | `boolean` |
| `int8(name)` | `Int8` | `number` |
| `int16(name)` | `Int16` | `number` |
| `bigint(name)` | `Int64` | `bigint` |
| `uint8(name)` | `Uint8` | `number` |
| `uint16(name)` | `Uint16` | `number` |
| `uint32(name)` | `Uint32` | `number` |
| `uint64(name)` | `Uint64` | `bigint` |
| `float(name)` | `Float` | `number` |
| `double(name)` | `Double` | `number` |
| `dyNumber(name)` | `DyNumber` | `string` |
| `bytes(name)` / `binary(name)` | `String` | `Uint8Array` |
| `date(name)` | `Date` | `Date` |
| `date32(name)` | `Date32` | `Date` |
| `datetime(name)` | `Datetime` | `Date` |
| `datetime64(name)` | `Datetime64` | `Date` |
| `timestamp(name)` | `Timestamp` | `Date` |
| `timestamp64(name)` | `Timestamp64` | `Date` |
| `interval(name)` | `Interval` | `number` |
| `interval64(name)` | `Interval64` | `bigint` или `number` |
| `json<T>(name)` | `Json` | `T` |
| `jsonDocument<T>(name)` | `JsonDocument` | `T` |
| `uuid(name)` | `Uuid` | `string` |
| `yson(name)` | `Yson` | `Uint8Array` |
| `decimal(name, precision, scale)` | `Decimal(precision, scale)` | `string` |

Пример decimal:

```ts
import { decimal, ydbTable, integer } from "ydb-drizzle-adapter";

export const invoices = ydbTable("invoices", {
  id: integer("id").primaryKey(),
  amount: decimal("amount", 22, 9).notNull(),
});
```

## customType

`customType` нужен, когда YDB type есть в проекте, но для него нет встроенного builder.

```ts
import { customType, ydbTable, integer } from "ydb-drizzle-adapter";

const inet = customType<{ data: string; driverData: string }>({
  dataType: () => "Utf8",
  toDriver: (value) => value,
  fromDriver: (value) => value,
});

export const events = ydbTable("events", {
  id: integer("id").primaryKey(),
  ip: inet("ip"),
});
```

## Primary keys

Inline primary key:

```ts
export const users = ydbTable("users", {
  id: integer("id").primaryKey(),
});
```

Table-level primary key:

```ts
import { primaryKey } from "ydb-drizzle-adapter";

export const memberships = ydbTable("memberships", {
  userId: integer("user_id").notNull(),
  orgId: integer("org_id").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.orgId] }),
]);
```

Для DDL generation нельзя смешивать inline primary keys и table-level primary key в одной таблице.

## Unique constraints

Inline unique:

```ts
email: text("email").notNull().unique("users_email_unique")
```

Table-level unique:

```ts
unique("users_email_unique").on(users.email)
```

## Индексы

```ts
import { index, uniqueIndex } from "ydb-drizzle-adapter";

export const users = ydbTable("users", {
  id: integer("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
}, (table) => [
  index("users_tenant_idx").on(table.tenantId),
  index("users_tenant_email_cover_idx")
    .on(table.tenantId, table.email)
    .global()
    .sync()
    .cover(table.name),
  uniqueIndex("users_email_idx").on(table.email),
]);
```

Методы `YdbIndexBuilder`:

- `.global()` / `.local()` - locality индекса.
- `.sync()` / `.async()` - режим построения.
- `.using(indexType)` - пользовательский YDB index type.
- `.vectorKMeansTree(options)` - vector k-means tree index.
- `.cover(...columns)` - cover columns.
- `.with(options)` - raw index options.

## Vector indexes

```ts
import { bytes, integer, vectorIndex, ydbTable } from "ydb-drizzle-adapter";

export const embeddings = ydbTable("embeddings", {
  id: integer("id").primaryKey(),
  embedding: bytes("embedding").notNull(),
}, (table) => [
  vectorIndex("embeddings_vector_idx", {
    vectorDimension: 384,
    vectorType: "float",
    distance: "cosine",
    clusters: 128,
    levels: 2,
  }).on(table.embedding),
]);
```

Ограничения vector index:

- `vectorDimension` от `1` до `16384`;
- `clusters` от `2` до `2048`;
- `levels` от `1` до `16`;
- должен быть ровно один параметр: `distance` или `similarity`;
- `distance`: `"cosine"`, `"manhattan"`, `"euclidean"`;
- `similarity`: `"inner_product"`, `"cosine"`;
- `clusters ** levels <= 1073741824`;
- `vectorDimension * clusters <= 4194304`;
- vector index не может быть `UNIQUE`;
- vector index поддерживает только `GLOBAL` и `SYNC`.

## indexView и vectorIndexView

YDB позволяет читать таблицу через index view.

```ts
import { eq } from "drizzle-orm";
import { indexView } from "ydb-drizzle-adapter";

const rows = await db
  .select()
  .from(indexView(users, "users_tenant_idx", "u"))
  .where(eq(users.tenantId, "acme"))
  .execute();
```

`vectorIndexView(table, indexName, alias?)` является специализированным алиасом `indexView` для vector search запросов.

## Table options

```ts
import { rawTableOption, tableOptions } from "ydb-drizzle-adapter";

tableOptions({
  AUTO_PARTITIONING_BY_LOAD: "ENABLED",
  AUTO_PARTITIONING_PARTITION_SIZE_MB: 2048,
  READ_REPLICAS_SETTINGS: rawTableOption("PER_AZ:2"),
});
```

`rawTableOption(value)` вставляет значение как YQL expression без quoting. Используйте его только для YDB options, которые нельзя выразить строкой, числом или boolean.

## Partitioning

```ts
partitionByHash(users.tenantId)
```

Все колонки partition key должны принадлежать той же таблице.

## TTL

Простой TTL:

```ts
ttl(users.createdAt, "P30D")
```

TTL с unit:

```ts
ttl(users.createdAt, "3600", { unit: "SECONDS" })
```

Несколько TTL actions:

```ts
ttl(users.createdAt, [
  { interval: "P30D", delete: true },
  { interval: "P7D", externalDataSource: "cold_storage" },
], { unit: "SECONDS" })
```

Поддерживаемые units: `"SECONDS"`, `"MILLISECONDS"`, `"MICROSECONDS"`, `"NANOSECONDS"`.

## Column families

```ts
columnFamily("cold", {
  data: "rot",
  compression: "zstd",
  compressionLevel: 5,
}).columns(users.name)
```

Поддерживаемые поля:

- `data`: `"ssd"`, `"rot"` или backend-specific строка.
- `compression`: `"off"`, `"lz4"`, `"zstd"` или backend-specific строка.
- `compressionLevel`: число.
