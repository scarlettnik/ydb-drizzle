---
title: Joins и set operators
description: Сегментированная справка по join methods, union, unionAll, intersect, except и set operator validation.
---

# Joins и set operators

Этот раздел описывает объединение источников в SELECT queries.

Обзор раздела: [Построители запросов](../query-builders.md).

## Join methods

```ts
await db
  .select({
    userId: users.id,
    postId: posts.id,
  })
  .from(users)
  .leftJoin(posts, eq(posts.authorId, users.id));
```

Supported joins:

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

When a non-partial select joins another table, the builder nests selected fields by table alias to preserve result shape.

## Join alias validation

```ts
await db
  .select()
  .from(users)
  .leftJoin(alias(posts, "p"), eq(sql`p.author_id`, users.id));
```

Aliases must be unique inside one SELECT query.

## Set operators

```ts
const activeUsers = db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.active, true));

const invitedUsers = db
  .select({ id: invitations.userId })
  .from(invitations);

const result = await activeUsers.union(invitedUsers);
```

Builder methods:

- `union(select)`
- `unionAll(select)`
- `intersect(select)`
- `except(select)`
- `addSetOperators(operators)`

Top-level helper functions:

```ts
import { union, unionAll, intersect, except } from "ydb-drizzle-adapter";

const query = union(activeUsers, invitedUsers);
```

## Validation

Set operators require identical selected field keys in the same order. The adapter checks selection compatibility before rendering SQL.

```ts
const left = db.select({ id: users.id }).from(users);
const right = db.select({ value: posts.id }).from(posts);

left.union(right); // throws
```

Use explicit aliases to make both sides compatible.
