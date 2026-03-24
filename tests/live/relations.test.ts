import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { createLiveContext } from "./helpers/context.js";
import { users, usersTableName } from "./helpers/schema.js";

const live = createLiveContext();

test("schema query", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(t, "insert one user, resolve it through schema-aware query API, then delete it again");
  const id = live.baseIntId + 201;

  live.liveQueryLog.length = 0;
  live.log("schema", id);
  await live.deleteUserRows([id]);

  try {
    await live.db.insert(users).values({ id, name: "twilight sparkle" });

    const inserted = await (live.db as any).query.users.findFirst({
      where: (fields: typeof users, { eq }: { eq: (left: unknown, right: unknown) => unknown }) => eq(fields.id, id),
    });

    assert.deepEqual(inserted, { id, name: "twilight sparkle" });
    assert.ok((live.db as any)._.schema?.users);
    assert.ok(live.liveQueryLog.some(({ query }) => query.includes(`insert into \`${usersTableName}\``)));
    assert.ok(live.liveQueryLog.some(({ query }) => query.includes(`from \`${usersTableName}\``)));
  } finally {
    await live.deleteUserRows([id]);
  }
});

test("findMany", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(t, "insert two users, read them through schema-aware findMany with order/limit, then clean both rows");
  const firstId = live.baseIntId + 221;
  const secondId = live.baseIntId + 222;

  live.log("many", firstId, secondId);
  await live.deleteUserRows([firstId, secondId]);

  try {
    await live.db.insert(users).values([
      { id: firstId, name: "apple bloom" },
      { id: secondId, name: "sweetie belle" },
    ]);

    const rows = await (live.db as any).query.users.findMany({
      columns: { id: true, name: true },
      where: (fields: typeof users, { inArray }: { inArray: (left: unknown, right: unknown[]) => unknown }) => inArray(fields.id, [firstId, secondId]),
      orderBy: (fields: typeof users, { desc }: { desc: (value: unknown) => unknown }) => desc(fields.id),
      limit: 2,
    });

    assert.deepEqual(rows, [
      { id: secondId, name: "sweetie belle" },
      { id: firstId, name: "apple bloom" },
    ]);
  } finally {
    await live.deleteUserRows([firstId, secondId]);
  }
});
