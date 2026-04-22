---
title: Migrator
description: Сегментированная справка по migrate, YdbMigrateConfig, inline migrations, migration history, locks and recovery.
---

# Migrator

`migrate()` применяет migrations через `YdbDatabase` and `YdbDialect`.

Обзор раздела: [Миграции и DDL](../migrations-ddl.md).

## Folder migrations

```ts
import { migrate } from "ydb-drizzle-adapter";

await migrate(db, {
  migrationsFolder: "drizzle",
});
```

Folder mode reads Drizzle migration journal and SQL files.

## Inline migrations

```ts
await migrate(db, {
  migrations: [
    {
      name: "create_users",
      sql: [
        buildCreateTableSql(users, { ifNotExists: true }),
      ],
    },
  ],
});
```

Inline migrations accept either explicit `sql` or structured `operations`.

## Migration history

The adapter creates a migration history table with:

- `hash`
- `created_at`
- `name`
- `status`
- `started_at`
- `finished_at`
- `error`
- `owner_id`
- `statements_total`
- `statements_applied`

Applied migrations are skipped by hash.

## Migration lock

```ts
await migrate(db, {
  migrations,
  migrationLock: {
    key: "deploy",
    leaseMs: 10 * 60 * 1000,
    acquireTimeoutMs: 60 * 1000,
    retryIntervalMs: 1000,
  },
});
```

Set `migrationLock: false` only when an external deployment system guarantees exclusivity.

## Recovery

```ts
await migrate(db, {
  migrations,
  migrationRecovery: {
    mode: "retry",
    staleRunningAfterMs: 60 * 60 * 1000,
  },
});
```

Default behavior is fail-fast for `failed` or active `running` migrations. `retry` should be enabled only after operational verification.
