---
title: Миграции и DDL
description: migrate(), inline migrations, migration lock/recovery, DDL helpers и YdbMigrationOperation.
---

Адаптер поддерживает два уровня:

- `migrate(db, config)` - применение миграций с history table, lock и recovery;
- DDL helpers - генерация YDB DDL строк из schema objects или typed operation objects.

## migrate

Drizzle folder migrations:

```ts
import { migrate } from "ydb-drizzle-adapter";
import { db } from "./db";

await migrate(db, {
  migrationsFolder: "./drizzle",
  migrationLock: true,
});
```

Inline migrations:

```ts
import { migrate } from "ydb-drizzle-adapter";

await migrate(db, {
  migrations: [
    {
      name: "create_users",
      operations: [
        { kind: "create_table", table: users, ifNotExists: true },
      ],
    },
    {
      name: "seed_admin",
      sql: [
        "UPSERT INTO `users` (`id`, `name`) VALUES (1, 'admin')",
      ],
    },
  ],
  migrationLock: {
    leaseMs: 10 * 60 * 1000,
    acquireTimeoutMs: 60 * 1000,
    retryIntervalMs: 1000,
  },
  migrationRecovery: {
    mode: "retry",
    staleRunningAfterMs: 60 * 60 * 1000,
  },
});
```

## YdbMigrateConfig

`YdbMigrateConfig` принимает один из вариантов:

```ts
{
  migrationsFolder: string;
  migrationsTable?: string;
  migrationsSchema?: string;
  migrationsLockTable?: string;
  migrationLock?: boolean | YdbMigrationLockConfig;
  migrationRecovery?: YdbMigrationRecoveryConfig;
}
```

или:

```ts
{
  migrations: readonly YdbInlineMigration[];
  migrationsTable?: string;
  migrationsSchema?: string;
  migrationsLockTable?: string;
  migrationLock?: boolean | YdbMigrationLockConfig;
  migrationRecovery?: YdbMigrationRecoveryConfig;
}
```

## YdbInlineMigration

```ts
{
  name?: string;
  folderMillis?: number;
  hash?: string;
  breakpoints?: boolean;
  sql?: readonly string[];
  operations?: readonly YdbMigrationOperation[];
}
```

Правила:

- если `sql` не передан, но есть `operations`, адаптер вызывает `buildMigrationSql(operations)`;
- если `sql` и `operations` отсутствуют или дают пустой список, будет ошибка;
- `name` по умолчанию: `inline_0001`, `inline_0002`, ...;
- `folderMillis` по умолчанию: индекс миграции + 1;
- `hash` по умолчанию считается через `sha256` от statements;
- `breakpoints` по умолчанию `false`.

## History table

По умолчанию используется таблица `__drizzle_migrations`.

Поля history record:

- `hash`;
- `folderMillis`;
- `name`;
- `status`: `"running"`, `"applied"` или `"failed"`;
- `startedAt`;
- `finishedAt`;
- `error`;
- `ownerId`;
- `statementsTotal`;
- `statementsApplied`.

Если задан `migrationsSchema`, итоговое имя будет `${migrationsSchema}/${migrationsTable}`.

## Migration lock

`migrationLock: true` включает lock table с настройками по умолчанию.

```ts
await migrate(db, {
  migrationsFolder: "./drizzle",
  migrationsTable: "__drizzle_migrations",
  migrationsLockTable: "__drizzle_migrations_lock",
  migrationLock: {
    key: "default",
    ownerId: process.env.HOSTNAME,
    leaseMs: 600_000,
    acquireTimeoutMs: 60_000,
    retryIntervalMs: 1_000,
  },
});
```

Поля `YdbMigrationLockConfig`:

- `table` - legacy alias для lock table name, если `migrationsLockTable` не задан;
- `key` - ключ lock row;
- `ownerId` - идентификатор процесса-владельца;
- `leaseMs` - TTL lease;
- `acquireTimeoutMs` - сколько ждать lock;
- `retryIntervalMs` - пауза между попытками.

## Recovery

```ts
await migrate(db, {
  migrationsFolder: "./drizzle",
  migrationRecovery: {
    mode: "fail",
    staleRunningAfterMs: 3_600_000,
  },
});
```

`mode`:

- `"fail"` - упасть, если есть running migration;
- `"retry"` - попытаться продолжить stale running migration.

## DDL: таблицы

### buildCreateTableSql

```ts
const statement = buildCreateTableSql(users, {
  ifNotExists: true,
  temporary: false,
});
```

Таблица должна иметь primary key. Generated columns не поддерживаются.

### buildDropTableSql

```ts
buildDropTableSql(users, { ifExists: true });
buildDropTableSql("users", { ifExists: true });
```

### buildAnalyzeSql

```ts
buildAnalyzeSql(users);
buildAnalyzeSql(users, [users.email, "name"]);
```

`ANALYZE` зависит от версии/режима YDB, проверяйте на целевом окружении.

### buildRenameTableSql

```ts
buildRenameTableSql(users, "users_v2");
```

## DDL: ALTER TABLE

### buildAddColumnsSql

```ts
const statements = buildAddColumnsSql(users, [newColumn]);
```

Возвращает массив statements: YDB добавляет каждую колонку отдельным `ALTER TABLE`.

### buildDropColumnsSql

```ts
buildDropColumnsSql(users, ["old_column"]);
```

### buildAddIndexSql

```ts
buildAddIndexSql(users, index("users_email_idx").on(users.email).build(users));
```

В обычном `extraConfig` вы чаще пишете `index(...).on(...)`, но DDL builder принимает уже построенный `YdbIndex` или `YdbUniqueConstraint`.

### buildDropIndexSql

```ts
buildDropIndexSql(users, "users_email_idx");
```

### buildAlterTableSetOptionsSql

```ts
buildAlterTableSetOptionsSql(users, {
  AUTO_PARTITIONING_BY_LOAD: "ENABLED",
});
```

Options не могут быть пустыми.

### buildAlterTableResetOptionsSql

```ts
buildAlterTableResetOptionsSql(users, ["AUTO_PARTITIONING_BY_LOAD"]);
```

### buildAddColumnFamilySql

```ts
buildAddColumnFamilySql(users, {
  name: "cold",
  options: { data: "rot", compression: "zstd" },
});
```

### buildAlterColumnFamilySql

```ts
buildAlterColumnFamilySql(users, "cold", {
  compression: "lz4",
  compressionLevel: 3,
});
```

Options не могут быть пустыми.

### buildAlterColumnSetFamilySql

```ts
buildAlterColumnSetFamilySql(users, [users.name], "cold");
buildAlterColumnSetFamilySql(users, ["name"], "cold");
```

Возвращает массив statements.

### buildAddChangefeedSql

```ts
buildAddChangefeedSql(users, "users_updates", {
  mode: "NEW_AND_OLD_IMAGES",
  format: "JSON",
  retentionPeriod: "PT24H",
});
```

### buildDropChangefeedSql

```ts
buildDropChangefeedSql(users, "users_updates");
```

### buildAlterTableSql

```ts
buildAlterTableSql(users, [
  { kind: "add_column", column: users.name },
  { kind: "drop_index", name: "old_idx" },
]);
```

`buildAlterTableSql` принимает непустой массив `YdbAlterTableAction`. Поддержка multi-action `ALTER TABLE` зависит от версии и конфигурации YDB; перед использованием в боевом окружении проверьте этот сценарий на целевом кластере.

## DDL: views

### buildCreateViewSql

```ts
buildCreateViewSql(
  "active_users",
  "SELECT * FROM `users` WHERE `status` = 'active'",
  {
    ifNotExists: true,
    securityInvoker: true,
    options: { check_option: "CASCADED" },
  },
);
```

`securityInvoker` по умолчанию `true`, потому что YDB требует `security_invoker = TRUE` для исполняемых views.

### buildDropViewSql

```ts
buildDropViewSql("active_users", { ifExists: true });
```

## DDL: topics

### buildCreateTopicSql

```ts
buildCreateTopicSql("events", {
  consumers: [
    { name: "analytics", settings: { important: true } },
  ],
  settings: {
    retention_period: "PT24H",
  },
});
```

### buildAlterTopicSql

```ts
buildAlterTopicSql("events", [
  { kind: "add_consumer", consumer: { name: "billing" } },
  { kind: "set_options", settings: { retention_period: "PT48H" } },
]);
```

Actions:

- `{ kind: "add_consumer"; consumer }`;
- `{ kind: "drop_consumer"; name }`;
- `{ kind: "alter_consumer_set"; name; settings }`;
- `{ kind: "set_options"; settings }`.

### buildDropTopicSql

```ts
buildDropTopicSql("events");
```

## DDL: async replication

### buildCreateAsyncReplicationSql

```ts
buildCreateAsyncReplicationSql(
  "replication_to_analytics",
  [{ remote: "/remote/users", local: "/local/users" }],
  {
    connectionString: "grpc://remote:2136/remote",
    tokenSecretName: "replication_token",
    consistencyLevel: "ROW",
    commitInterval: "PT1S",
  },
);
```

Options:

- `connectionString`;
- `caCert`;
- `tokenSecretName`;
- `user`;
- `passwordSecretName`;
- `serviceAccountId`;
- `initialTokenSecretName`;
- `consistencyLevel`: `"ROW"` или `"GLOBAL"`;
- `commitInterval`;
- `options`.

### buildAlterAsyncReplicationSql

```ts
buildAlterAsyncReplicationSql("replication_to_analytics", {
  state: "DONE",
  failoverMode: "FORCE",
});
```

### buildDropAsyncReplicationSql

```ts
buildDropAsyncReplicationSql("replication_to_analytics", { cascade: true });
```

## DDL: transfer

### buildCreateTransferSql

```ts
buildCreateTransferSql(
  "events_transfer",
  "source_topic",
  "target_table",
  "TOPIC",
  {
    consumer: "analytics",
    batchSizeBytes: 1_048_576,
    flushInterval: "PT1S",
  },
);
```

Options:

- `connectionString`;
- `tokenSecretName`;
- `user`;
- `passwordSecretName`;
- `serviceAccountId`;
- `initialTokenSecretName`;
- `consumer`;
- `batchSizeBytes`;
- `flushInterval`;
- `options`.

### buildAlterTransferSql

```ts
buildAlterTransferSql("events_transfer", {
  options: {
    state: "PAUSED",
    batchSizeBytes: 524_288,
  },
});

buildAlterTransferSql("events_transfer", {
  using: "TOPIC",
});
```

Нельзя одновременно передать `using` и `options`. Нужно передать хотя бы одно из них.

### buildDropTransferSql

```ts
buildDropTransferSql("events_transfer");
```

## DDL: access control

### buildCreateSecretSql

```ts
buildCreateSecretSql("replication_token", process.env.REPLICATION_TOKEN!);
```

### buildCreateUserSql

```ts
buildCreateUserSql("app_user", {
  password: "secret",
  login: true,
});
```

### buildAlterUserSql

```ts
buildAlterUserSql("app_user", {
  password: "new-secret",
  withKeyword: true,
});
```

Нужно передать минимум одну опцию.

### buildDropUserSql

```ts
buildDropUserSql(["app_user"], { ifExists: true });
```

### buildCreateGroupSql

```ts
buildCreateGroupSql("app_group", {
  users: ["app_user"],
});
```

### buildAlterGroupSql

```ts
buildAlterGroupSql("app_group", "add_user", ["another_user"]);
buildAlterGroupSql("app_group", "drop_user", ["old_user"]);
```

### buildDropGroupSql

```ts
buildDropGroupSql(["app_group"], { ifExists: true });
```

### buildGrantSql

```ts
buildGrantSql({
  permissions: ["SELECT", "UPDATE"],
  on: ["users"],
  to: ["app_group"],
  withGrantOption: false,
});
```

Permission может быть строкой, `{ kind: "all"; privileges?: boolean }` или `{ kind: "raw"; value: string }`.

### buildRevokeSql

```ts
buildRevokeSql({
  permissions: { kind: "all", privileges: true },
  on: ["users"],
  from: ["app_group"],
  grantOptionFor: true,
});
```

## DDL: introspection

### buildShowCreateSql

```ts
buildShowCreateSql("table", "users");
buildShowCreateSql("view", "active_users");
buildShowCreateSql("topic", "events");
buildShowCreateSql("async replication", "replication_to_analytics");
buildShowCreateSql("transfer", "events_transfer");
```

## buildMigrationSql

`buildMigrationSql(operations)` преобразует typed operations в массив DDL statements.

```ts
const statements = buildMigrationSql([
  { kind: "create_table", table: users, ifNotExists: true },
  { kind: "create_topic", name: "events" },
  { kind: "grant", permissions: "SELECT", on: ["users"], to: ["reader"] },
]);
```

## buildMigrationLockTableBootstrapSql

```ts
const statement = buildMigrationLockTableBootstrapSql({
  migrationsLockTable: "__drizzle_migrations_lock",
});
```

Используется migrator-ом, но экспортирован для пользовательского bootstrap pipeline.

## Operation kinds

`YdbMigrationOperation` поддерживает:

| kind | Builder |
| --- | --- |
| `create_table` | `buildCreateTableSql` |
| `drop_table` | `buildDropTableSql` |
| `analyze` | `buildAnalyzeSql` |
| `create_view` | `buildCreateViewSql` |
| `drop_view` | `buildDropViewSql` |
| `create_topic` | `buildCreateTopicSql` |
| `alter_topic` | `buildAlterTopicSql` |
| `drop_topic` | `buildDropTopicSql` |
| `create_async_replication` | `buildCreateAsyncReplicationSql` |
| `alter_async_replication` | `buildAlterAsyncReplicationSql` |
| `drop_async_replication` | `buildDropAsyncReplicationSql` |
| `create_transfer` | `buildCreateTransferSql` |
| `alter_transfer` | `buildAlterTransferSql` |
| `drop_transfer` | `buildDropTransferSql` |
| `create_secret` | `buildCreateSecretSql` |
| `create_user` | `buildCreateUserSql` |
| `alter_user` | `buildAlterUserSql` |
| `drop_user` | `buildDropUserSql` |
| `create_group` | `buildCreateGroupSql` |
| `alter_group` | `buildAlterGroupSql` |
| `drop_group` | `buildDropGroupSql` |
| `grant` | `buildGrantSql` |
| `revoke` | `buildRevokeSql` |
| `show_create` | `buildShowCreateSql` |
| `add_columns` | `buildAddColumnsSql` |
| `drop_columns` | `buildDropColumnsSql` |
| `add_index` | `buildAddIndexSql` |
| `drop_index` | `buildDropIndexSql` |
| `set_table_options` | `buildAlterTableSetOptionsSql` |
| `reset_table_options` | `buildAlterTableResetOptionsSql` |
| `add_column_family` | `buildAddColumnFamilySql` |
| `alter_column_family` | `buildAlterColumnFamilySql` |
| `set_column_family` | `buildAlterColumnSetFamilySql` |
| `rename_table` | `buildRenameTableSql` |
| `add_changefeed` | `buildAddChangefeedSql` |
| `drop_changefeed` | `buildDropChangefeedSql` |
| `alter_table` | `buildAlterTableSql` |
