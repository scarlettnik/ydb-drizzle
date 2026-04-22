import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { TransactionRollbackError } from "drizzle-orm/errors";
import { createLiveContext } from "./helpers/context.js";
import { users, usersTableName } from "./helpers/schema.js";

const live = createLiveContext();

test("transaction", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(t, "commit one inserted row inside a transaction, then execute a rollback path and verify only committed data remains");
  const committedId = live.baseIntId + 301;
  const rolledBackId = live.baseIntId + 302;

  live.liveQueryLog.length = 0;
  live.log("tx", committedId, rolledBackId);
  await live.deleteUserRows([committedId, rolledBackId]);

  try {
    await live.db.transaction(async (tx) => {
      await tx.insert(users).values({ id: committedId, name: "starlight glimmer" });

      const insideTxRow = await (tx as any).query.users.findFirst({
        where: (fields: typeof users, { eq }: { eq: (left: unknown, right: unknown) => unknown }) => eq(fields.id, committedId),
      });

      assert.deepEqual(insideTxRow, { id: committedId, name: "starlight glimmer" });
    }, { accessMode: "read write", idempotent: false });

    const committedRow = await (live.db as any).query.users.findFirst({
      where: (fields: typeof users, { eq }: { eq: (left: unknown, right: unknown) => unknown }) => eq(fields.id, committedId),
    });

    assert.deepEqual(committedRow, { id: committedId, name: "starlight glimmer" });

    await assert.rejects(
      async () => live.db.transaction(async (tx) => {
        await tx.insert(users).values({ id: rolledBackId, name: "tempest shadow" });
        tx.rollback();
      }, { accessMode: "read write" }),
      TransactionRollbackError,
    );

    const rolledBackRows = await live.db.select().from(users).where(eq(users.id, rolledBackId)) as Array<{
      id: number;
      name: string;
    }>;

    assert.deepEqual(rolledBackRows, []);
    assert.ok(live.liveQueryLog.some(({ query }) => query.includes(`insert into \`${usersTableName}\``)));
    assert.ok(live.liveQueryLog.some(({ query }) => query.includes(`from \`${usersTableName}\``)));
  } finally {
    await live.deleteUserRows([committedId, rolledBackId]);
  }
});
