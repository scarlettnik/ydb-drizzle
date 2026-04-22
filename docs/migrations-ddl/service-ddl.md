---
title: DDL сервисных объектов
description: Справка по views, topics, async replication, transfer и access-control DDL helpers.
---

# DDL сервисных объектов

Эти DDL helpers покрывают объекты YDB за пределами описания таблиц.

Обзор раздела: [Миграции и DDL](../migrations-ddl.md).

## Views

```ts
buildCreateViewSql(
  "active_users",
  "SELECT * FROM users WHERE active = true",
  { ifNotExists: true },
);

buildDropViewSql("active_users", { ifExists: true });
```

`buildCreateViewSql()` renders `security_invoker` by default and accepts additional view options.

## Topics

```ts
buildCreateTopicSql("events", {
  consumers: [
    { name: "analytics" },
  ],
  settings: {
    retention_period: rawTableOption("Interval(\"PT24H\")"),
  },
});

buildAlterTopicSql("events", [
  { kind: "set_settings", settings: { min_active_partitions: 2 } },
]);

buildDropTopicSql("events");
```

## Async replication

```ts
buildCreateAsyncReplicationSql(
  "replication",
  [{ remote: "remote/users", local: "users_copy" }],
  {
    connectionString: "grpcs://example:2135",
    database: "/db",
    tokenSecretName: "token",
    consistencyLevel: "global",
  },
);

buildAlterAsyncReplicationSql("replication", {
  state: "paused",
});

buildDropAsyncReplicationSql("replication", { cascade: true });
```

## Transfer

```ts
buildCreateTransferSql(
  "transfer",
  "source",
  "target",
  "USING $config",
  { flushInterval: "PT1M" },
);

buildAlterTransferSql("transfer", {
  options: { flushInterval: "PT5M" },
});

buildDropTransferSql("transfer");
```

## Access control

```ts
buildCreateSecretSql("api_token", "secret-value");
buildCreateUserSql("app_user", { password: "password" });
buildAlterUserSql("app_user", { password: "new-password" });
buildDropUserSql(["app_user"], { ifExists: true });

buildCreateGroupSql("app_group", { users: ["app_user"] });
buildAlterGroupSql("app_group", "add_user", ["reader"]);
buildDropGroupSql(["app_group"], { ifExists: true });

buildGrantSql({
  permissions: ["SELECT"],
  on: ["users"],
  to: ["app_user"],
});

buildRevokeSql({
  permissions: ["SELECT"],
  on: ["users"],
  from: ["app_user"],
});
```

## Introspection

```ts
buildShowCreateSql("table", "users");
```

`buildShowCreateSql()` renders YDB `SHOW CREATE`.
