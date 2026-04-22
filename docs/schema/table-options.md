---
title: Table options, partitioning, TTL и column families
description: Сегментированная справка по tableOptions, partitionByHash, ttl, columnFamily и rawTableOption.
---

# Table options, partitioning, TTL и column families

Table-level metadata используется DDL helpers при генерации `CREATE TABLE` и `ALTER TABLE`.

Обзор раздела: [Таблицы, колонки и индексы](../schema.md).

## tableOptions

```ts
export const users = ydbTable(
  "users",
  {
    id: integer("id").notNull(),
  },
  (table) => [
    primaryKey(table.id),
    tableOptions({
      auto_partitioning_by_size: true,
      partition_size_mb: 2048,
    }),
  ],
);
```

Raw values:

```ts
tableOptions({
  key_bloom_filter: rawTableOption("ENABLED"),
})
```

## partitionByHash

```ts
partitionByHash(table.tenantId, table.id)
```

All partitioning columns must belong to the declaring table.

## ttl

Single action form:

```ts
ttl(table.createdAt, "P30D", { unit: "SECONDS" })
```

Multiple action form:

```ts
ttl(table.createdAt, [
  { interval: "P30D", delete: true },
  { interval: "P7D", externalDataSource: "cold_storage" },
])
```

`ttl()` validates that at least one action exists.

## columnFamily

```ts
columnFamily("hot", {
  data: "ssd",
  compression: "lz4",
}).columns(table.name, table.email)
```

Column families support:

- `data`
- `compression`
- `compressionLevel`

All assigned columns must belong to the declaring table.
