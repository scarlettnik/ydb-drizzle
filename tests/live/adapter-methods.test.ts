import test from "node:test";
import assert from "node:assert/strict";
import { and, eq, sql } from "drizzle-orm";
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
      id: sql<number>`${copiedId}`.as("id"),
      name: users.name,
    }).from(users).where(eq(users.id, sourceId)));

    const rows = await live.db.select().from(users).where(
      sql`${users.id} in (${sourceId}, ${copiedId})`,
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
      sql`${users.id} in (${existingId}, ${newId})`,
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
