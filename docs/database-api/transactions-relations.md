---
title: Транзакции и relations
description: Сегментированная справка по transaction, rollback и schema-aware relational query API.
---

# Транзакции и relations

Этот раздел описывает API, зависящий от schema metadata и transactional executor.

Обзор раздела: [Database API](../database-api.md).

## transaction

```ts
await db.transaction(async (tx) => {
  await tx.insert(users).values({ id: 1, name: "Ada" });
});
```

Configuration:

```ts
await db.transaction(
  async (tx) => {
    await tx.update(users).set({ name: "Ada" });
  },
  {
    accessMode: "read write",
    isolationLevel: "serializableReadWrite",
    idempotent: false,
  },
);
```

`tx` предоставляет тот же database API, кроме вложенных transactions.

## rollback

```ts
await db.transaction(async (tx) => {
  await tx.insert(users).values({ id: 1, name: "Ada" });
  tx.rollback();
});
```

`rollback()` выбрасывает Drizzle `TransactionRollbackError`. Вложенные transactions отклоняются явно.

## Relations

Relations доступны через `db.query.*`, если schema передана в `createDrizzle()`.

```ts
const user = await db.query.users.findFirst({
  where: (users, { eq }) => eq(users.id, 1),
  with: {
    posts: true,
  },
});
```

Supported query methods:

- `findMany(config?)`
- `findFirst(config?)`

Supported config fields:

- `columns`
- `where`
- `orderBy`
- `limit`
- `offset`
- `extras`
- `with`

Relations выполняются через schema-aware hydration. Для `Many` relations limit и offset применяются после группировки связанных строк.
