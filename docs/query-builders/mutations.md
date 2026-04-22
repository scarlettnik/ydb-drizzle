---
title: Изменение данных
description: Сегментированная справка по INSERT, UPSERT, REPLACE, UPDATE, BATCH UPDATE, DELETE и BATCH DELETE builders.
---

# Изменение данных

Эти builders формируют YDB DML statements и выполняют их через связанный `YdbSession`.

Обзор раздела: [Построители запросов](../query-builders.md).

## INSERT

```ts
await db.insert(users).values({
  id: 1,
  name: "Ada",
});
```

Multiple rows:

```ts
await db.insert(users).values([
  { id: 1, name: "Ada" },
  { id: 2, name: "Grace" },
]);
```

Insert from SELECT:

```ts
await db.insert(users).select(
  db.select({
    id: sourceUsers.id,
    name: sourceUsers.name,
  }).from(sourceUsers),
);
```

Conflict handling:

```ts
await db.insert(users)
  .values({ id: 1, name: "Ada" })
  .onDuplicateKeyUpdate({
    set: { name: "Ada Lovelace" },
  });
```

## UPSERT

```ts
await db.upsert(users).values({
  id: 1,
  name: "Ada",
});
```

`upsert()` uses only provided columns for values-based statements.

## REPLACE

```ts
await db.replace(users).values({
  id: 1,
  name: "Ada",
});
```

`replace().returning()` is explicitly unsupported by this adapter.

## UPDATE

```ts
await db.update(users)
  .set({ name: "Ada Lovelace" })
  .where(eq(users.id, 1));
```

Set-based update:

```ts
await db.update(users).on((qb) =>
  qb.select({
    id: sourceUsers.id,
    name: sourceUsers.name,
  }).from(sourceUsers)
);
```

## BATCH UPDATE

```ts
await db.batchUpdate(users)
  .set({ active: false })
  .where(eq(users.deleted, true));
```

YDB `BATCH UPDATE` does not support `WITH`, `ON` or `RETURNING`.

## DELETE

```ts
await db.delete(users).where(eq(users.id, 1));
```

Delete with using:

```ts
await db.delete(users)
  .using(posts)
  .where(eq(posts.authorId, users.id));
```

Set-based delete:

```ts
await db.delete(users).on((qb) =>
  qb.select({ id: sourceUsers.id }).from(sourceUsers)
);
```

## BATCH DELETE

```ts
await db.batchDelete(users).where(eq(users.deleted, true));
```

YDB `BATCH DELETE` does not support `USING`, `ON` or `RETURNING`.

## RETURNING

```ts
const rows = await db
  .update(users)
  .set({ name: "Ada" })
  .where(eq(users.id, 1))
  .returning({
    id: users.id,
    name: users.name,
  });
```

`returning()` switches prepared query execution to array mode and maps rows through selected fields.
