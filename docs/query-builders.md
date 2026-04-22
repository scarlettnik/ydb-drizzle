---
title: Построители запросов
description: SELECT, joins, CTE, set operators, INSERT, UPSERT, REPLACE, UPDATE, DELETE и YDB-specific clauses.
---

Построители запросов следуют подходу Drizzle, но рендерят YQL и поддерживают синтаксис, специфичный для YDB.

## Общая модель

```ts
const query = db
  .select({ id: users.id, name: users.name })
  .from(users)
  .where(eq(users.id, 1));

const sqlObject = query.toSQL();
const rows = await query.execute();
```

Для builders, созданных через `new YdbQueryBuilder()` без session/db, `.execute()` недоступен. Используйте `db.select()`, `db.insert()` и другие методы `YdbDatabase`, если запрос должен выполняться.

## SELECT

### select

```ts
await db.select().from(users).execute();

await db
  .select({
    id: users.id,
    label: sql<string>`Upper(${users.name})`,
  })
  .from(users)
  .execute();
```

### selectDistinct

```ts
await db
  .selectDistinct({ tenantId: users.tenantId })
  .from(users)
  .execute();
```

### selectDistinctOn

```ts
await db
  .selectDistinctOn([users.tenantId], {
    tenantId: users.tenantId,
    createdAt: users.createdAt,
  })
  .from(users)
  .orderBy(users.tenantId, desc(users.createdAt))
  .execute();
```

### from

```ts
await db.select().from(users).execute();
```

`from()` принимает таблицу, subquery, CTE или SQL source, который поддерживает Drizzle.

### fromAsTable

`fromAsTable(binding, alias?)` строит источник `AS_TABLE($binding)`.

```ts
const query = db
  .select()
  .fromAsTable("rows", "r")
  .toSQL();
```

Имя binding должно выглядеть как `$name` или `name`. Alias должен быть простым identifier.
Значение `$rows` необходимо объявить или передать на уровне окружающего YQL/executor; builder только рендерит `AS_TABLE($rows)`.

### fromValues

`fromValues(rows, options?)` строит inline `VALUES` source.

```ts
await db
  .select()
  .fromValues([
    { id: 1, name: "Ada" },
    { id: 2, name: "Grace" },
  ], { alias: "v" })
  .execute();
```

Для object rows все строки должны иметь одинаковые ключи в одинаковом порядке. Для array rows все строки должны иметь одинаковую длину.

### getSelectedFields

`getSelectedFields()` возвращает selection object builder-а. Эти данные используются для композиции, subqueries и utility-кода.

```ts
const q = db.select({ id: users.id }).from(users);
const fields = q.getSelectedFields();
```

### where

```ts
await db
  .select()
  .from(users)
  .where(and(eq(users.tenantId, "acme"), isNotNull(users.email)))
  .execute();
```

### having

```ts
await db
  .select({
    tenantId: users.tenantId,
    total: sql<number>`count(*)`,
  })
  .from(users)
  .groupBy(users.tenantId)
  .having(sql`count(*) > 10`)
  .execute();
```

### groupBy

```ts
await db
  .select({ tenantId: users.tenantId, total: sql<number>`count(*)` })
  .from(users)
  .groupBy(users.tenantId)
  .execute();
```

`groupBy` также принимает callback:

```ts
await db
  .select({ tenantId: users.tenantId })
  .from(users)
  .groupBy(({ tenantId }) => [tenantId])
  .execute();
```

### groupCompactBy

`groupCompactBy()` рендерит YDB `GROUP COMPACT BY`.

```ts
await db
  .select({ tenantId: users.tenantId, total: sql<number>`count(*)` })
  .from(users)
  .groupCompactBy(users.tenantId)
  .execute();
```

### orderBy

```ts
await db
  .select()
  .from(users)
  .orderBy(asc(users.name), desc(users.createdAt))
  .execute();
```

`orderBy()` нельзя комбинировать с `assumeOrderBy()`.

### assumeOrderBy

`assumeOrderBy()` рендерит YDB `ASSUME ORDER BY`.

```ts
await db
  .select()
  .from(users)
  .assumeOrderBy(users.createdAt)
  .execute();
```

Нужно передать минимум одно выражение.

### limit и offset

```ts
await db
  .select()
  .from(users)
  .orderBy(users.id)
  .limit(50)
  .offset(100)
  .execute();
```

### without

`without(...columns)` рендерит YDB `WITHOUT`.

```ts
await db
  .select()
  .from(users)
  .without(users.internalComment)
  .execute();
```

Ограничения:

- вызывать после `.from()`;
- работает только для whole-source select;
- нельзя использовать вместе с joins;
- нельзя использовать вместе с `distinctOn()`.

### flattenBy

```ts
await db
  .select()
  .from(events)
  .flattenBy(events.items)
  .execute();
```

### flattenListBy

```ts
await db.select().from(events).flattenListBy(events.items).execute();
```

### flattenDictBy

```ts
await db.select().from(events).flattenDictBy(events.attrs).execute();
```

### flattenOptionalBy

```ts
await db.select().from(events).flattenOptionalBy(events.maybeItem).execute();
```

### flattenColumns

```ts
await db.select().from(events).flattenColumns().execute();
```

### sample

`sample(ratio)` рендерит YDB `SAMPLE`.

```ts
await db.select().from(events).sample(0.1).execute();
```

### tableSample

`tableSample(method, size, repeatable?)` рендерит `TABLESAMPLE`.

```ts
await db
  .select()
  .from(events)
  .tableSample("bernoulli", 10, 42)
  .execute();
```

`method` должен быть простым identifier.

### matchRecognize

```ts
await db
  .select()
  .from(events)
  .matchRecognize({
    partitionBy: [events.userId],
    orderBy: [events.createdAt],
    pattern: sql`(A B+)`,
    define: {
      A: sql`${events.kind} = 'start'`,
      B: sql`${events.kind} = 'step'`,
    },
  })
  .execute();
```

Можно передать готовый `SQLWrapper`, если нужен полный контроль над YQL.

### window

```ts
import { windowDefinition } from "ydb-drizzle-adapter";

await db
  .select({
    id: users.id,
    rn: sql<number>`row_number() OVER w`,
  })
  .from(users)
  .window("w", windowDefinition({
    partitionBy: [users.tenantId],
    orderBy: [users.createdAt],
  }))
  .execute();
```

Имя window должно быть простым identifier и не должно повторяться в одном query.

### intoResult

`intoResult(name)` рендерит `INTO RESULT`.

```ts
await db.select().from(users).intoResult("users_result").execute();
```

### uniqueDistinct

```ts
import { distinctHint, uniqueHint } from "ydb-drizzle-adapter";

await db
  .select()
  .from(users)
  .uniqueDistinct(uniqueHint("id"), distinctHint("email"))
  .execute();
```

### distinct и distinctOn

Для композиции запросов builder поддерживает `.distinct()` и `.distinctOn(...)`. Эти методы нельзя комбинировать.

```ts
await db.select().from(users).distinct().execute();
```

## Joins

Доступные join methods:

- `innerJoin(table, on)`
- `leftJoin(table, on)`
- `rightJoin(table, on)`
- `fullJoin(table, on)`
- `crossJoin(table)`
- `leftSemiJoin(table, on)`
- `rightSemiJoin(table, on)`
- `leftOnlyJoin(table, on)`
- `rightOnlyJoin(table, on)`
- `exclusionJoin(table, on)`

Пример:

```ts
await db
  .select({
    userId: users.id,
    title: posts.title,
  })
  .from(users)
  .innerJoin(posts, eq(posts.authorId, users.id))
  .execute();
```

YDB-specific joins:

```ts
await db
  .select()
  .from(users)
  .leftSemiJoin(posts, eq(posts.authorId, users.id))
  .execute();

await db
  .select()
  .from(users)
  .leftOnlyJoin(posts, eq(posts.authorId, users.id))
  .execute();
```

## Set operators

Функции:

- `union(left, right, ...rest)`
- `unionAll(left, right, ...rest)`
- `intersect(left, right, ...rest)`
- `except(left, right, ...rest)`

Builder methods:

- `.union(query)`
- `.unionAll(query)`
- `.intersect(query)`
- `.except(query)`
- `.addSetOperators(operators)`

Пример:

```ts
const active = db.select({ id: users.id }).from(users).where(eq(users.status, "active"));
const invited = db.select({ id: invites.userId }).from(invites);

const ids = await active.union(invited).execute();
```

Все set operands должны иметь одинаковые selected field keys в одинаковом порядке. Адаптер валидирует это до выполнения.

## CTE

```ts
const adults = db.$with("adults").as(
  db.select().from(users).where(gte(users.age, 18)),
);

const rows = await db
  .with(adults)
  .select()
  .from(adults)
  .execute();
```

`$with(alias).as(query)` принимает готовый query или callback.

```ts
const adults = db.$with("adults").as((qb) =>
  qb.select().from(users).where(gte(users.age, 18)),
);
```

## INSERT

### values

```ts
await db.insert(users).values({ id: 1, name: "Ada" }).execute();

await db.insert(users).values([
  { id: 1, name: "Ada" },
  { id: 2, name: "Grace" },
]).execute();
```

### select

```ts
await db.insert(archiveUsers)
  .select(db.select({
    id: users.id,
    name: users.name,
  }).from(users))
  .execute();
```

### returning

```ts
const rows = await db.insert(users)
  .values({ id: 1, name: "Ada" })
  .returning({ id: users.id })
  .execute();
```

### onDuplicateKeyUpdate

```ts
await db.insert(users)
  .values({ id: 1, name: "Ada" })
  .onDuplicateKeyUpdate({
    set: { name: "Ada" },
  })
  .execute();
```

`onDuplicateKeyUpdate` не поддерживает `insert().select(...)`.

### toSQL, prepare, execute

```ts
const builder = db.insert(users).values({ id: 1, name: "Ada" });

const rendered = builder.toSQL();
const prepared = builder.prepare();
await prepared.execute();
await builder.execute();
```

## UPSERT

```ts
await db.upsert(users)
  .values({ id: 1, name: "Ada" })
  .execute();
```

`upsert().select(...)`:

```ts
await db.upsert(archiveUsers)
  .select(db.select({ id: users.id, name: users.name }).from(users))
  .execute();
```

`returning()` поддерживается:

```ts
const rows = await db.upsert(users)
  .values({ id: 1, name: "Ada" })
  .returning({ id: users.id })
  .execute();
```

## REPLACE

```ts
await db.replace(users)
  .values({ id: 1, name: "Ada" })
  .execute();
```

`replace().select(...)`:

```ts
await db.replace(archiveUsers)
  .select(db.select({ id: users.id, name: users.name }).from(users))
  .execute();
```

`replace().returning()` не поддерживается.

## UPDATE

```ts
await db.update(users)
  .set({ name: "Ada Lovelace" })
  .where(eq(users.id, 1))
  .execute();
```

`returning()`:

```ts
const rows = await db.update(users)
  .set({ name: "Ada Lovelace" })
  .where(eq(users.id, 1))
  .returning({ id: users.id, name: users.name })
  .execute();
```

`on()` для YDB update:

```ts
await db.update(users)
  .on((qb) => qb
    .select({
      id: users.id,
      name: sql<string>`"Ada Lovelace"`.as("name"),
    })
    .from(users)
    .where(eq(users.id, 1)))
  .execute();
```

`on()` нельзя комбинировать с `where()`.

## BATCH UPDATE

```ts
await db.batchUpdate(users)
  .set({ status: "archived" })
  .where(eq(users.tenantId, "acme"))
  .execute();
```

`batchUpdate` имеет только `set`, `where`, `toSQL`, `prepare`, `execute`.

## DELETE

```ts
await db.delete(users)
  .where(eq(users.id, 1))
  .execute();
```

`using()`:

```ts
await db.delete(users)
  .using(posts)
  .where(and(
    eq(users.id, posts.userId),
    eq(posts.id, 10),
  ))
  .execute();
```

`using()` добавляет дополнительный source для `DELETE ... USING`. Для YDB `delete().on((qb) => select...)` есть отдельная форма, которая удаляет строки по primary key из select source:

```ts
await db.delete(users)
  .on((qb) => qb
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, 1)))
  .execute();
```

`delete().on(...)` нельзя комбинировать с `where()` или `using()`.

`returning()`:

```ts
const deleted = await db.delete(users)
  .where(eq(users.id, 1))
  .returning({ id: users.id })
  .execute();
```

## BATCH DELETE

```ts
await db.batchDelete(users)
  .where(eq(users.tenantId, "acme"))
  .execute();
```

`batchDelete` имеет только `where`, `toSQL`, `prepare`, `execute`.

## Rendering methods

Каждый builder, где это имеет смысл, поддерживает:

- `getSQL()` - возвращает Drizzle `SQL`;
- `toSQL()` - возвращает prepared query object с SQL string и params;
- `prepare()` - создает prepared query;
- `execute()` - выполняет через session/db/transaction.

## Возможности, зависящие от версии YDB

Часть YQL-возможностей зависит от версии и конфигурации YDB. В интеграционных тестах проекта отдельные проверки могут быть пропущены для:

- `SAMPLE`;
- `TABLESAMPLE`;
- `SessionWindow`;
- `ANALYZE`;
- multi-action `ALTER TABLE`;
- некоторых `ALTER TOPIC` сценариев.

Если прикладной код зависит от этих возможностей, проверяйте их на той же версии YDB, на которую деплоится приложение.
