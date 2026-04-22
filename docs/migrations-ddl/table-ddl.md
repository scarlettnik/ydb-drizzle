---
title: DDL таблиц
description: Сегментированная справка по buildCreateTableSql, table ALTER builders, indexes, column families, changefeeds and rename.
---

# DDL таблиц

DDL helpers для таблиц преобразуют schema metadata и операции над таблицами в YDB SQL statements.

Обзор раздела: [Миграции и DDL](../migrations-ddl.md).

## CREATE, DROP, ANALYZE and RENAME

```ts
buildCreateTableSql(users, { ifNotExists: true });
buildDropTableSql(users, { ifExists: true });
buildAnalyzeSql(users, [users.id, users.name]);
buildRenameTableSql(users, "users_archive");
```

`buildCreateTableSql()` includes:

- column definitions
- primary key
- indexes
- unique constraints
- partitioning
- TTL
- table options
- column families

## Columns

```ts
buildAddColumnsSql(users, [users.name]);
buildDropColumnsSql(users, ["legacy_name"]);
```

The functions return arrays because each column operation is rendered as a separate `ALTER TABLE` statement.

## Indexes

```ts
const idx = index("users_name_idx").on(users.name).build(users);

buildAddIndexSql(users, idx);
buildDropIndexSql(users, "users_name_idx");
```

The same function accepts `YdbIndex` and `YdbUniqueConstraint` metadata.

## Table options

```ts
buildAlterTableSetOptionsSql(users, {
  auto_partitioning_by_size: true,
});

buildAlterTableResetOptionsSql(users, [
  "auto_partitioning_by_size",
]);
```

Option values can be scalar values or `rawTableOption()`.

## Column families

```ts
buildAddColumnFamilySql(users, {
  name: "hot",
  options: { data: "ssd", compression: "lz4" },
});

buildAlterColumnFamilySql(users, "hot", {
  compression: "zstd",
});

buildAlterColumnSetFamilySql(users, [users.name], "hot");
```

## Changefeeds

```ts
buildAddChangefeedSql(users, "updates", {
  mode: "updates",
  format: "json",
});

buildDropChangefeedSql(users, "updates");
```

## Multi-action ALTER TABLE

```ts
buildAlterTableSql(users, [
  { kind: "add_index", index: idx },
  { kind: "set_table_options", options: { key_bloom_filter: true } },
]);
```

`buildAlterTableSql()` flattens table action descriptors into one YDB `ALTER TABLE` statement.
