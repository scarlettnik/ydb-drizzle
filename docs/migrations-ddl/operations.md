---
title: Операции миграций
description: Сегментированная справка по buildMigrationSql, operation kinds and migration bootstrap SQL builders.
---

# Операции миграций

`buildMigrationSql()` converts structured operations into executable SQL statements.

Обзор раздела: [Миграции и DDL](../migrations-ddl.md).

## buildMigrationSql

```ts
const statements = buildMigrationSql([
  {
    kind: "create_table",
    table: users,
    ifNotExists: true,
  },
  {
    kind: "add_index",
    table: users,
    index: index("users_name_idx").on(users.name).build(users),
  },
]);
```

The function preserves operation order and returns one or more statements per operation.

## Operation groups

Table operations:

- `create_table`
- `drop_table`
- `analyze`
- `rename_table`
- `add_columns`
- `drop_columns`
- `add_index`
- `drop_index`
- `set_table_options`
- `reset_table_options`
- `add_column_family`
- `alter_column_family`
- `set_column_family`
- `add_changefeed`
- `drop_changefeed`
- `alter_table`

Service operations:

- `create_view`
- `drop_view`
- `create_topic`
- `alter_topic`
- `drop_topic`
- `create_async_replication`
- `alter_async_replication`
- `drop_async_replication`
- `create_transfer`
- `alter_transfer`
- `drop_transfer`
- `create_secret`
- `create_user`
- `alter_user`
- `drop_user`
- `create_group`
- `alter_group`
- `drop_group`
- `grant`
- `revoke`
- `show_create`

## Migration bootstrap builders

```ts
buildMigrationTableBootstrapSql();
buildMigrationHistoryMetadataProbeSql();
buildMigrationHistoryMetadataColumnSql();
buildMigrationLockTableBootstrapSql();
```

These functions are exported for custom bootstrap pipelines and operational diagnostics.

## Migration history SQL

```ts
buildMigrationHistorySelectSql();
buildMigrationHistoryInsertSql({
  hash: "hash",
  folderMillis: Date.now(),
  name: "migration",
  status: "applied",
});
```

## Migration lock SQL

```ts
buildMigrationLockSelectSql({}, "migrate");
buildMigrationLockUpsertSql({}, {
  key: "migrate",
  ownerId: "deploy-1",
  acquiredAt: Date.now(),
  heartbeatAt: Date.now(),
  expiresAt: Date.now() + 60_000,
});
buildMigrationLockRefreshSql({}, {
  key: "migrate",
  ownerId: "deploy-1",
  heartbeatAt: Date.now(),
  expiresAt: Date.now() + 60_000,
});
buildMigrationLockReleaseSql({}, {
  key: "migrate",
  ownerId: "deploy-1",
});
```
