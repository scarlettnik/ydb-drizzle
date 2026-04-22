---
title: Быстрый старт
description: Установка, подключение к YDB, первая схема, CRUD, транзакции и проверка соединения.
---

## Установка

```sh
npm install ydb-drizzle-adapter drizzle-orm
```

Для разработки и тестов в этом репозитории используется Node.js 20+.

## Что нужно заранее

Минимальный набор для приложения:

- Node.js 20 или новее;
- `drizzle-orm` рядом с адаптером;
- строка подключения к YDB в `YDB_CONNECTION_STRING`;
- таблицы, созданные через DDL helpers или процесс миграций.

Для локального smoke test достаточно:

```sh
export YDB_CONNECTION_STRING="grpc://localhost:2136/local"
npm run test:smoke
```

Если YDB недоступен, интеграционные тесты по умолчанию могут быть пропущены. Для CI используйте `YDB_TEST_REQUIRE_LIVE=1`, чтобы отсутствие базы считалось ошибкой.

## Подключение

Рекомендуемый способ подключения - передать строку подключения:

```ts
import { createDrizzle } from "ydb-drizzle-adapter";

export const db = createDrizzle({
  connectionString: process.env.YDB_CONNECTION_STRING!,
});
```

`drizzle` является алиасом `createDrizzle`:

```ts
import { drizzle } from "ydb-drizzle-adapter";

const db = drizzle({
  connectionString: process.env.YDB_CONNECTION_STRING!,
});
```

Если приложение уже создает YDB client/driver самостоятельно, его можно передать через `client`:

```ts
import { createDrizzle } from "ydb-drizzle-adapter";

const db = createDrizzle({
  client: existingYdbClient,
});
```

Для тестов и интеграций можно передать callback или executor:

```ts
import { createDrizzle } from "ydb-drizzle-adapter";

const db = createDrizzle(async (query, params, method) => {
  return executeSomewhere(query.sql, params, method);
});
```

Callback/executor удобен для тестов, serverless-прокси или собственного транспортного слоя. В обычном приложении проще использовать `connectionString` или готовый YDB client.

## Первая схема

```ts
import {
  integer,
  text,
  timestamp,
  ydbTable,
} from "ydb-drizzle-adapter";

export const users = ydbTable("users", {
  id: integer("id").primaryKey(),
  email: text("email").notNull().unique("users_email_unique"),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull(),
});
```

Схему можно передать при создании `db`. Это включает `db.query.*` для relations API.

```ts
import { createDrizzle } from "ydb-drizzle-adapter";
import * as schema from "./schema";

export const db = createDrizzle({
  connectionString: process.env.YDB_CONNECTION_STRING!,
  schema,
});
```

Рекомендуемая структура приложения:

```text
src/db/schema.ts
src/db/client.ts
src/db/migrate.ts
```

В `schema.ts` держите объявления таблиц и связей. В `client.ts` создавайте `db`. В `migrate.ts` запускайте DDL и миграции отдельно от обработчиков пользовательских запросов.

## CREATE TABLE через DDL helper

```ts
import { buildCreateTableSql } from "ydb-drizzle-adapter";
import { users } from "./schema";

const sql = buildCreateTableSql(users, { ifNotExists: true });
await db.execute(sql);
```

`buildCreateTableSql()` генерирует строку DDL. Выполнение остается на вашей стороне через `db.execute()` или `migrate()`. В боевом окружении предпочтительнее использовать `migrate()` с таблицей истории и блокировкой, чтобы повторные deploy не создавали гонки.

## Insert

```ts
await db.insert(users).values({
  id: 1,
  email: "ada@example.com",
  name: "Ada",
  createdAt: new Date(),
}).execute();
```

Несколько строк:

```ts
await db.insert(users).values([
  { id: 1, email: "ada@example.com", name: "Ada", createdAt: new Date() },
  { id: 2, email: "grace@example.com", name: "Grace", createdAt: new Date() },
]).execute();
```

## Select

```ts
import { eq } from "drizzle-orm";

const rows = await db
  .select({
    id: users.id,
    email: users.email,
    name: users.name,
  })
  .from(users)
  .where(eq(users.email, "ada@example.com"))
  .limit(1)
  .execute();
```

`get()` возвращает первую строку или `undefined`:

```ts
const user = await db
  .select()
  .from(users)
  .where(eq(users.id, 1))
  .prepare()
  .get();
```

## Update

```ts
import { eq } from "drizzle-orm";

await db
  .update(users)
  .set({ name: "Ada Lovelace" })
  .where(eq(users.id, 1))
  .execute();
```

## Delete

```ts
import { eq } from "drizzle-orm";

await db
  .delete(users)
  .where(eq(users.id, 1))
  .execute();
```

## Транзакция

```ts
await db.transaction(async (tx) => {
  await tx.insert(users).values({
    id: 3,
    email: "linus@example.com",
    name: "Linus",
    createdAt: new Date(),
  }).execute();

  return tx
    .select()
    .from(users)
    .where(eq(users.id, 3))
    .execute();
}, {
  accessMode: "read write",
  isolationLevel: "serializableReadWrite",
  idempotent: true,
});
```

## Закрытие соединения

Если приложение создает адаптер через строку подключения, закрывайте клиент при остановке процесса:

```ts
await db.$client.close();
```

Если вы передали существующий YDB client/driver через `client`, его жизненный цикл остается у вашего приложения. Адаптер не закрывает такой driver автоматически.

## Частые первые ошибки

| Симптом | Что проверить |
| --- | --- |
| `Must include either client or connectionString` | В `createDrizzle()` передан options object без `client` и без `connectionString` |
| `Cannot execute a query on a query builder` | Builder создан через `new YdbQueryBuilder()` без сессии; используйте `db.select()` или `db.insert()` |
| Интеграционные тесты пропущены | Не задан `YDB_CONNECTION_STRING` или база недоступна |
| Интеграционные тесты должны падать, но проходят со skip | Добавьте `YDB_TEST_REQUIRE_LIVE=1` |
| Ошибка синтаксиса YDB на расширенном SELECT/DDL | Проверьте возможность на целевой версии YDB; часть YQL-функций зависит от backend |

## Live проверка подключения

```sh
YDB_CONNECTION_STRING="grpc://localhost:2136/local" npm run test:smoke
```

Жесткий режим для CI:

```sh
YDB_TEST_REQUIRE_LIVE=1 YDB_CONNECTION_STRING="grpc://localhost:2136/local" npm run test:live
```
