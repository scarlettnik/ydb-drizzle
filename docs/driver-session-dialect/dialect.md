---
title: YdbDialect
description: Сегментированная справка по YdbDialect rendering methods, migration execution and sqlToQuery.
---

# YdbDialect

`YdbDialect` is the SQL renderer and migration executor used by higher-level builders.

Обзор раздела: [Driver, Session и Dialect](../driver-session-dialect.md).

Direct use is intended for extensions, tests and adapter-level integrations.

## Escaping and typing

```ts
const dialect = new YdbDialect({ casing: "snake_case" });

dialect.escapeName("users");
dialect.escapeParam(0);
dialect.escapeString("Ada");
dialect.prepareTyping(users.createdAt);
```

`prepareTyping()` maps YDB column encoders to Drizzle query typing categories.

## Select rendering

Public rendering helpers include:

- `buildWithCTE(queries)`
- `getSelectionAliases(fields)`
- `mapExpressionsToSelectionAliases(...)`
- `buildSelection(fields, aliases?)`
- `buildReturningSelection(fields)`
- `buildFromTable(table)`
- `buildJoins(joins)`
- `buildOrderBy(orderBy)`
- `buildLimit(limit)`
- `buildOffset(offset)`
- `buildSetOperationQuery(...)`
- `buildSetOperations(...)`
- `buildSelectQuery(config)`

## Mutation rendering

```ts
dialect.buildInsertQuery(config);
dialect.buildUpdateSet(table, set);
dialect.buildUpdateQuery(config);
dialect.buildDeleteQuery(config);
```

These methods are used by mutation builders and expose normalized SQL rendering for tests and integrations.

## Relational rendering

```ts
dialect.buildRelationalQueryWithoutPK(config);
```

The method returns SQL and selection metadata for schema-aware relational queries.

## Migrations

```ts
await dialect.migrate(migrations, session, {
  migrationsTable: "__drizzle_migrations",
  migrationLock: true,
});
```

`migrate()` handles:

- migration table bootstrap
- lock acquisition and release
- applied hash detection
- failed and running migration recovery rules
- statement progress tracking

## sqlToQuery

```ts
const query = dialect.sqlToQuery(sql`SELECT 1 AS value`);
```

`sqlToQuery()` returns SQL text, positional parameters and Drizzle typings metadata.
