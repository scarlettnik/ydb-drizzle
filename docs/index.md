---
title: YDB Drizzle Adapter
description: Документация по подключению YDB к Drizzle ORM, описанию схемы, запросам, миграциям и проверкам перед релизом.
---

`ydb-drizzle-adapter` добавляет поддержку YDB в Drizzle ORM: типизированное описание схемы, построение YQL-запросов, выполнение операций через YDB SDK и инструменты для миграций.

## Возможности

Адаптер закрывает основные сценарии работы приложения с YDB:

- описание таблиц, колонок, ключей, индексов, TTL и настроек таблицы;
- типизированные построители запросов для `select`, `insert`, `upsert`, `replace`, `update` и `delete`;
- расширения SELECT, специфичные для YDB: `WITHOUT`, `FLATTEN`, `SAMPLE`, `TABLESAMPLE`, `MATCH_RECOGNIZE`, `WINDOW`, `ASSUME ORDER BY` и операторы объединения;
- API связей через `db.query.*`;
- выполнение YQL через `YdbDriver`, `YdbSession` и методы `db.execute()`, `db.all()`, `db.get()`, `db.values()`;
- инструменты DDL и миграции с таблицей истории, блокировкой и восстановлением после сбоя;
- отдельный набор интеграционных тестов для проверки поведения на реальном YDB.

<div class="landing-grid">
  <a class="landing-card" href="getting-started/">
    <h3>Быстрый старт</h3>
    <p>Установка, подключение, первая схема, CRUD, транзакции и проверка соединения.</p>
  </a>
  <a class="landing-card" href="schema/tables/">
    <h3>Схема и индексы</h3>
    <p>Таблицы, типы колонок, ключи, вторичные индексы, TTL и настройки хранения.</p>
  </a>
  <a class="landing-card" href="query-builders/select/">
    <h3>Запросы</h3>
    <p>SELECT, joins, операторы объединения, мутации и дополнительные возможности YQL.</p>
  </a>
  <a class="landing-card" href="migrations-ddl/migrate/">
    <h3>Миграции и DDL</h3>
    <p>Генерация DDL, inline-миграции, таблица истории, блокировки и восстановление.</p>
  </a>
</div>

## Основные разделы

<div class="quick-links">
  <a href="database-api/connection/">Подключение</a>
  <a href="database-api/methods/">Методы базы</a>
  <a href="ydb-yql-helpers/select-sources/">YQL helpers</a>
  <a href="driver-session-dialect/driver/">Драйвер</a>
  <a href="testing-release/">Тестирование</a>
  <a href="api-index/">Публичный API</a>
</div>

## Минимальный пример

```ts
import { eq } from "drizzle-orm";
import {
  createDrizzle,
  integer,
  text,
  ydbTable,
} from "ydb-drizzle-adapter";

export const users = ydbTable("users", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

const db = createDrizzle({
  connectionString: process.env.YDB_CONNECTION_STRING!,
  schema: { users },
});

await db.insert(users).values({ id: 1, name: "Ada" }).execute();

const rows = await db
  .select({ id: users.id, name: users.name })
  .from(users)
  .where(eq(users.id, 1))
  .execute();
```

## Рекомендации

- Импортируйте публичные сущности из корня пакета: `ydb-drizzle-adapter`.
- SQL/YQL-фрагменты собирайте через `sql` из `drizzle-orm`, а не строковой конкатенацией.
- Для прикладного кода используйте `createDrizzle()` или `drizzle()`.
- Для прямого выполнения YQL используйте `db.execute()`, `db.all()`, `db.get()`, `db.values()` или `YdbSession`.
- Для миграций в боевом окружении включайте `migrationLock`.
- Для CI с реальным YDB включайте `YDB_TEST_REQUIRE_LIVE=1`, чтобы недоступная база считалась ошибкой.

## Проверка перед эксплуатацией

- `npm run verify` проходит локально и в CI.
- `npm run test:live` проходит с реальным `YDB_CONNECTION_STRING`.
- Процесс релиза запускает интеграционные тесты перед публикацией.
- Миграции используют стратегию блокировок и восстановления.
- DDL и расширения YQL проверены на целевой версии YDB.
- Документация в `docs/` обновлена при изменении публичного API.
