import test from "node:test";
import assert from "node:assert/strict";
import { and, eq, sql as yql } from "drizzle-orm";
import {
  buildCreateTableSql,
  columnFamily,
  integer,
  partitionByHash,
  tableOptions,
  text,
  ttl,
  uint32,
  ydbTable,
} from "../../src/index.js";
import { createLiveContext } from "./helpers/context.js";
import { posts, users } from "./helpers/schema.js";

const live = createLiveContext();

test("cte helpers and count builder", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(t, "insert one user, query it through a CTE, and verify db.$count() against the live table");
  const userId = live.baseIntId + 401;
  const userName = "cte pony";

  live.liveQueryLog.length = 0;
  await live.deleteUserRows([userId]);

  try {
    await live.db.insert(users).values({ id: userId, name: userName });

    const count = await live.db.$count(users, eq(users.id, userId));
    const sq = live.db.$with("sq_users").as(
      live.db.select({
        id: users.id,
        name: users.name,
      }).from(users).where(eq(users.id, userId)),
    );
    const rows = await live.db.with(sq).select().from(sq);

    assert.equal(count, 1);
    assert.deepEqual(rows, [{ id: userId, name: userName }]);
    assert.ok(live.liveQueryLog.some(({ query }) => query.startsWith("with `sq_users` as")));
    assert.ok(live.liveQueryLog.some(({ query }) => query.includes("select count(*) as count")));
  } finally {
    await live.deleteUserRows([userId]);
  }
});

test("insert select", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(t, "insert one source row, then insert a second row via insert().select(...) and verify both exist");
  const sourceId = live.baseIntId + 402;
  const copiedId = live.baseIntId + 403;

  await live.deleteUserRows([sourceId, copiedId]);

  try {
    await live.db.insert(users).values({ id: sourceId, name: "insert select source" });

    await live.db.insert(users).select((qb) => qb.select({
      id: yql<number>`${copiedId}`.as("id"),
      name: users.name,
    }).from(users).where(eq(users.id, sourceId)));

    const rows = await live.db.select().from(users).where(
      yql`${users.id} in (${sourceId}, ${copiedId})`,
    ) as Array<{ id: number; name: string }>;

    assert.deepEqual(live.sortById(rows), [
      { id: sourceId, name: "insert select source" },
      { id: copiedId, name: "insert select source" },
    ]);
  } finally {
    await live.deleteUserRows([sourceId, copiedId]);
  }
});

test("onDuplicateKeyUpdate", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(t, "exercise onDuplicateKeyUpdate() for both conflict and insert paths on the live users table");
  const existingId = live.baseIntId + 407;
  const newId = live.baseIntId + 408;

  await live.deleteUserRows([existingId, newId]);

  try {
    await live.db.insert(users).values({ id: existingId, name: "existing value" });

    await live.db.insert(users)
      .values({ id: existingId, name: "insert path" })
      .onDuplicateKeyUpdate({ set: { name: "updated value" } });

    await live.db.insert(users)
      .values({ id: newId, name: "fresh value" })
      .onDuplicateKeyUpdate({ set: { name: "should not win on insert" } });

    const rows = await live.db.select().from(users).where(
      yql`${users.id} in (${existingId}, ${newId})`,
    ) as Array<{ id: number; name: string }>;

    assert.deepEqual(live.sortById(rows), [
      { id: existingId, name: "updated value" },
      { id: newId, name: "fresh value" },
    ]);
    assert.ok(live.liveQueryLog.some(({ query }) => query.startsWith("with `__ydb_incoming` as")));
    assert.ok(live.liveQueryLog.some(({ query }) => query.includes("upsert into")));
  } finally {
    await live.deleteUserRows([existingId, newId]);
  }
});

test("mutation returning", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(t, "exercise INSERT/UPSERT/UPDATE/DELETE RETURNING against the live users table");
  const insertId = live.baseIntId + 421;
  const upsertId = live.baseIntId + 422;
  const deleteId = live.baseIntId + 423;

  await live.deleteUserRows([insertId, upsertId, deleteId]);

  try {
    const inserted = await live.db.insert(users)
      .values({ id: insertId, name: "returning insert" })
      .returning({ id: users.id, name: users.name });
    const upserted = await live.db.upsert(users)
      .values({ id: upsertId, name: "returning upsert" })
      .returning({ id: users.id, name: users.name });
    const updated = await live.db.update(users)
      .set({ name: "returning updated" })
      .where(eq(users.id, insertId))
      .returning({ id: users.id, name: users.name });

    await live.db.insert(users).values({ id: deleteId, name: "returning delete" });
    const deleted = await live.db.delete(users)
      .where(eq(users.id, deleteId))
      .returning({ id: users.id, name: users.name });

    assert.deepEqual(inserted, [{ id: insertId, name: "returning insert" }]);
    assert.deepEqual(upserted, [{ id: upsertId, name: "returning upsert" }]);
    assert.deepEqual(updated, [{ id: insertId, name: "returning updated" }]);
    assert.deepEqual(deleted, [{ id: deleteId, name: "returning delete" }]);
  } finally {
    await live.deleteUserRows([insertId, upsertId, deleteId]);
  }
});

test("native set and batch mutations", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(t, "create a keyed temp table and exercise UPDATE ON, DELETE ON, BATCH UPDATE and BATCH DELETE");
  const suffix = live.baseIntId + 431;
  const tableName = `set_mutations_${suffix}`;
  const keyedUsers = ydbTable(tableName, {
    id: integer("id").notNull().primaryKey(),
    name: text("name").notNull(),
  });

  await live.db.execute(yql.raw(`DROP TABLE IF EXISTS \`${tableName}\``));

  try {
    await live.db.execute(yql.raw(buildCreateTableSql(keyedUsers, { ifNotExists: true })));
    await live.db.insert(keyedUsers).values([
      { id: 1, name: "update target" },
      { id: 2, name: "delete target" },
      { id: 3, name: "batch target" },
    ]);

    const updated = await live.db.update(keyedUsers)
      .on((qb) => qb.select({
        id: keyedUsers.id,
        name: yql<string>`${"set updated"}`.as("name"),
      }).from(keyedUsers).where(eq(keyedUsers.id, 1)))
      .returning({ id: keyedUsers.id, name: keyedUsers.name });
    const deleted = await live.db.delete(keyedUsers)
      .on((qb) => qb.select({ id: keyedUsers.id }).from(keyedUsers).where(eq(keyedUsers.id, 2)))
      .returning({ id: keyedUsers.id });

    await live.db.batchUpdate(keyedUsers).set({ name: "batch updated" }).where(eq(keyedUsers.id, 3));
    const batchUpdated = await live.db.select().from(keyedUsers).where(eq(keyedUsers.id, 3));
    await live.db.batchDelete(keyedUsers).where(eq(keyedUsers.id, 3));
    const batchDeleted = await live.db.select().from(keyedUsers).where(eq(keyedUsers.id, 3));

    assert.deepEqual(updated, [{ id: 1, name: "set updated" }]);
    assert.deepEqual(deleted, [{ id: 2 }]);
    assert.deepEqual(batchUpdated, [{ id: 3, name: "batch updated" }]);
    assert.deepEqual(batchDeleted, []);
  } finally {
    await live.db.execute(yql.raw(`DROP TABLE IF EXISTS \`${tableName}\``));
  }
});

test("advanced table DDL", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(t, "create a temp table with table options, partitioning, TTL and column-family DDL, then verify it accepts rows");
  const suffix = live.baseIntId + 441;
  const tableName = `advanced_ddl_${suffix}`;
  const events = ydbTable(tableName, {
    id: integer("id").notNull().primaryKey(),
    payload: text("payload"),
    expiresAt: uint32("expires_at").notNull(),
  }, (table) => [
    columnFamily("cold", { data: "rot", compression: "lz4" }).columns(table.payload),
    partitionByHash(table.id),
    ttl(table.expiresAt, "P1D", { unit: "SECONDS" }),
    tableOptions({
      AUTO_PARTITIONING_BY_SIZE: "ENABLED",
      AUTO_PARTITIONING_PARTITION_SIZE_MB: 512,
    }),
  ]);

  await live.db.execute(yql.raw(`DROP TABLE IF EXISTS \`${tableName}\``));

  try {
    await live.db.execute(yql.raw(buildCreateTableSql(events, { ifNotExists: true })));
    await live.db.insert(events).values({ id: 1, payload: "advanced ddl", expiresAt: 4_102_444_800 });

    const rows = await live.db.select().from(events).where(eq(events.id, 1));
    assert.deepEqual(rows, [{ id: 1, payload: "advanced ddl", expiresAt: 4_102_444_800 }]);
  } finally {
    await live.db.execute(yql.raw(`DROP TABLE IF EXISTS \`${tableName}\``));
  }
});

test("delete using", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(t, "delete a user row through delete().using(posts) with a correlated EXISTS-based condition");
  const userId = live.baseIntId + 404;
  const postId = live.baseIntId + 405;

  await live.deletePostRows([postId]);
  await live.deleteUserRows([userId]);

  try {
    await live.db.insert(users).values({ id: userId, name: "delete using target" });
    await live.db.insert(posts).values({ id: postId, userId, title: "delete using post" });

    await live.db.delete(users)
      .using(posts)
      .where(and(
        eq(users.id, posts.userId),
        eq(users.id, userId),
        eq(posts.id, postId),
      ));

    const remainingUsers = await live.db.select().from(users).where(eq(users.id, userId)) as Array<{ id: number; name: string }>;
    const remainingPosts = await live.db.select().from(posts).where(eq(posts.id, postId)) as Array<{
      id: number;
      userId: number;
      title: string;
    }>;

    assert.deepEqual(remainingUsers, []);
    assert.deepEqual(remainingPosts, [{ id: postId, userId, title: "delete using post" }]);
    assert.ok(live.liveQueryLog.some(({ query }) => query.includes("where exists (select 1 from")));
  } finally {
    await live.deletePostRows([postId]);
    await live.deleteUserRows([userId]);
  }
});

test("session batch", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(t, "execute an insert and a follow-up select through session.batch() against the live database");
  const userId = live.baseIntId + 406;

  await live.deleteUserRows([userId]);

  try {
    const results = await live.db._.session.batch([
      live.db.insert(users).values({ id: userId, name: "batch user" }),
      live.db.select().from(users).where(eq(users.id, userId)),
    ] as const);

    assert.deepEqual(results[0], []);
    assert.deepEqual(results[1], [{ id: userId, name: "batch user" }]);
  } finally {
    await live.deleteUserRows([userId]);
  }
});
