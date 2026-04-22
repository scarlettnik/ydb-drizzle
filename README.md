# YDB Drizzle Adapter

YDB adapter for Drizzle ORM. The package provides typed schema declarations, YDB-aware query builders, direct YQL execution helpers, DDL helpers, and a migration runner with history and optional locking.

## Install

```sh
npm install ydb-drizzle-adapter drizzle-orm
```

Requires Node.js 20 or newer.

## Quick Start

```ts
import { eq } from "drizzle-orm";
import {
  createDrizzle,
  integer,
  text,
  timestamp,
  ydbTable,
} from "ydb-drizzle-adapter";

export const users = ydbTable("users", {
  id: integer("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

const db = createDrizzle({
  connectionString: process.env.YDB_CONNECTION_STRING!,
  schema: { users },
});

await db.insert(users).values({
  id: 1,
  email: "ada@example.com",
  createdAt: new Date(),
}).execute();

const row = await db
  .select({ id: users.id, email: users.email })
  .from(users)
  .where(eq(users.id, 1))
  .prepare()
  .get();

await db.$client.close();
```

## Main Capabilities

- Schema declarations with YDB column helpers, primary keys, unique constraints, secondary/vector indexes, table options, TTL, and column families.
- SELECT builders with joins, CTEs, set operators, `WITHOUT`, `FLATTEN`, `SAMPLE`, `TABLESAMPLE`, `MATCH_RECOGNIZE`, window helpers, and YDB optimizer hints.
- Mutation helpers for `insert`, `upsert`, `replace`, `update`, `batchUpdate`, `delete`, and `batchDelete`.
- `db.query.*` relations API using Drizzle relation metadata.
- `YdbDriver`, `YdbSession`, prepared queries, raw YQL helpers, and transaction support.
- DDL helpers and `migrate()` with migration history, lock table, and recovery options.

## Repository Checks

```sh
npm run typecheck
npm run test:unit
npm run build
npm run docs:build
npm run pack:dry-run
```

`npm run verify` runs the full release-oriented gate: production dependency audit, typecheck, unit tests, build, documentation setup/build, and package dry run.

Live tests require a reachable YDB instance:

```sh
YDB_CONNECTION_STRING="grpc://localhost:2136/local" npm run test:live
```

Use strict live mode for CI/release gates:

```sh
YDB_TEST_REQUIRE_LIVE=1 \
YDB_CONNECTION_STRING="grpc://localhost:2136/local" \
npm run test:live
```

## Documentation

Source documentation lives in `docs/` and is built with MkDocs:

```sh
npm run docs:setup
npm run docs:build
npm run docs:dev
```