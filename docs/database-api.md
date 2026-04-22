---
title: Database API, транзакции и relations
description: createDrizzle, YdbDatabase, прямое выполнение YQL, prepared queries, transactions и relational query API.
---

## createDrizzle и drizzle

`createDrizzle()` создает `YdbDatabase`. `drizzle` экспортируется как алиас.

```ts
import { createDrizzle, drizzle } from "ydb-drizzle-adapter";

const db1 = createDrizzle({ connectionString: process.env.YDB_CONNECTION_STRING! });
const db2 = drizzle({ connectionString: process.env.YDB_CONNECTION_STRING! });
```

Поддерживаемые варианты:

```ts
createDrizzle({
  connectionString: "...",
  schema,
  casing: "snake_case",
  logger: true,
});

createDrizzle({
  client: existingClient,
  schema,
});

createDrizzle(executorOrCallback, {
  schema,
  logger: false,
});
```

Возвращаемый объект содержит `$client`: YDB driver/client, через который выполняются запросы.

```ts
await db.$client.close();
```

## YdbDatabase методы

### execute

`db.execute(query)` выполняет SQL/YQL без требования вернуть строки.

```ts
import { sql } from "drizzle-orm";

await db.execute(sql`DROP TABLE IF EXISTS ${sql.identifier("tmp_users")}`);
```

### all

`db.all(query)` возвращает массив строк.

```ts
const rows = await db.all(sql`SELECT 1 AS value`);
```

### get

`db.get(query)` возвращает первую строку или `undefined`.

```ts
const row = await db.get(sql`SELECT 1 AS value`);
```

### values

`db.values(query)` возвращает строки в array mode.

```ts
const values = await db.values(sql`SELECT 1, 2`);
```

### select

```ts
const rows = await db.select().from(users).execute();

const projected = await db
  .select({ id: users.id, email: users.email })
  .from(users)
  .execute();
```

### selectDistinct

```ts
const tenants = await db
  .selectDistinct({ tenantId: users.tenantId })
  .from(users)
  .execute();
```

### selectDistinctOn

```ts
const rows = await db
  .selectDistinctOn([users.tenantId], {
    tenantId: users.tenantId,
    email: users.email,
  })
  .from(users)
  .execute();
```

`distinct()` и `distinctOn()` нельзя комбинировать в одном select builder.

### insert

```ts
await db.insert(users).values({ id: 1, email: "a@example.com" }).execute();
```

### upsert

```ts
await db.upsert(users).values({ id: 1, email: "a@example.com" }).execute();
```

`upsert` генерирует YDB UPSERT и использует режим provided columns.

### replace

```ts
await db.replace(users).values({ id: 1, email: "a@example.com" }).execute();
```

`replace` генерирует YDB REPLACE и использует all-columns semantics. `returning()` для `replace` не поддерживается и выбрасывает ошибку.

### update

```ts
await db.update(users)
  .set({ email: "new@example.com" })
  .where(eq(users.id, 1))
  .execute();
```

### batchUpdate

```ts
await db.batchUpdate(users)
  .set({ status: "archived" })
  .where(eq(users.tenantId, "acme"))
  .execute();
```

`batchUpdate` не поддерживает `returning()` и `on()`.

### delete

```ts
await db.delete(users)
  .where(eq(users.id, 1))
  .execute();
```

### batchDelete

```ts
await db.batchDelete(users)
  .where(eq(users.tenantId, "acme"))
  .execute();
```

`batchDelete` не поддерживает `using()`, `on()` и `returning()`.

### $count

```ts
const count = await db.$count(users, eq(users.tenantId, "acme"));
```

### $with и with

```ts
const activeUsers = db.$with("active_users").as(
  db.select().from(users).where(eq(users.status, "active")),
);

const rows = await db
  .with(activeUsers)
  .select()
  .from(activeUsers)
  .execute();
```

`with(...queries)` возвращает builder factory с `select`, `selectDistinct`, `selectDistinctOn`, `insert`, `upsert`, `replace`, `update`, `delete`.

## Prepared queries

Большинство builders поддерживает `.prepare()`.

```ts
const byId = db
  .select()
  .from(users)
  .where(eq(users.id, 1))
  .prepare();

const row = await byId.get();
```

Доступные методы prepared query:

- `.execute(params?)`
- `.all(params?)`
- `.get(params?)`
- `.values(params?)`
- `.getQuery()`
- `.isResponseInArrayMode()`
- `.mapResult(result, isFromBatch?)`

Текущий prepared query API не принимает placeholder values в `.execute()`/`.all()`/`.get()`/`.values()`. Значения должны быть частью SQL или builder до вызова `.prepare()`.

## Транзакции

```ts
await db.transaction(async (tx) => {
  await tx.insert(users).values({ id: 1, email: "a@example.com" }).execute();
  await tx.insert(profiles).values({ userId: 1, displayName: "Ada" }).execute();
});
```

Конфигурация:

```ts
await db.transaction(callback, {
  accessMode: "read write",
  isolationLevel: "serializableReadWrite",
  idempotent: true,
});
```

Поля `YdbTransactionConfig`:

- `accessMode`: `"read only"` или `"read write"`;
- `isolationLevel`: `"serializableReadWrite"` или `"snapshotReadOnly"`;
- `idempotent`: boolean, прокидывается в YDB transaction execution.

`YdbTransaction` предоставляет тот же query API, что и `YdbDatabase`, но выполняет запросы внутри transaction context.

## Relations

Адаптер реэкспортирует `relations`, `one`, `many` из Drizzle.

```ts
import {
  integer,
  many,
  one,
  relations,
  text,
  ydbTable,
} from "ydb-drizzle-adapter";

export const users = ydbTable("users", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

export const posts = ydbTable("posts", {
  id: integer("id").primaryKey(),
  authorId: integer("author_id").notNull(),
  title: text("title").notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
}));
```

Создание db со схемой:

```ts
import * as schema from "./schema";

const db = createDrizzle({
  connectionString: process.env.YDB_CONNECTION_STRING!,
  schema,
});
```

Запросы:

```ts
const usersWithPosts = await db.query.users.findMany({
  columns: {
    id: true,
    name: true,
  },
  with: {
    posts: {
      columns: {
        id: true,
        title: true,
      },
      orderBy: (posts, { asc }) => [asc(posts.id)],
      limit: 10,
    },
  },
});

const firstUser = await db.query.users.findFirst({
  where: (users, { eq }) => eq(users.id, 1),
});
```

Поддерживаемые опции relational config:

- `columns` - включение/исключение колонок;
- `where` - predicate;
- `orderBy` - сортировка;
- `limit`;
- `offset`;
- `extras` - дополнительные выражения;
- `with` - вложенные `one`/`many` relations.

Гидрация relations выполняется через дополнительные запросы адаптера, а не через один большой join с JSON aggregation. Это важно учитывать для latency и количества запросов.

## Raw YQL

Для YDB-специфичного YQL используйте `sql` из Drizzle и helpers адаптера.

```ts
import { sql } from "drizzle-orm";
import { declareParam, yqlScript } from "ydb-drizzle-adapter";

await db.execute(yqlScript(
  declareParam("$id", "Int32"),
  sql`SELECT * FROM ${users} WHERE id = 1;`,
));
```
