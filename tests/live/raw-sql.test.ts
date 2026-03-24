import test from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { createLiveContext } from "./helpers/context.js";
import { usersTableName } from "./helpers/schema.js";

const live = createLiveContext();

test("raw sql", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(t, "insert one user row via raw SQL, read it back, delete it, then confirm the row is gone");
  const id = live.baseIntId + 1;

  live.log("raw", id);
  await live.deleteUserRows([id]);

  try {
    await live.db.execute(sql`insert into ${sql.identifier(usersTableName)} (id, name) values (${id}, ${"pinky"})`);

    const inserted = await live.db.execute<Array<{ id: number; name: string }>>(
      sql`select id, name from ${sql.identifier(usersTableName)} where id = ${id}`,
    );

    assert.deepEqual(inserted, [{ id, name: "pinky" }]);

    await live.db.execute(sql`delete from ${sql.identifier(usersTableName)} where id = ${id}`);

    const remaining = await live.db.execute<Array<{ id: number; name: string }>>(
      sql`select id, name from ${sql.identifier(usersTableName)} where id = ${id}`,
    );

    assert.deepEqual(remaining, []);
  } finally {
    await live.deleteUserRows([id]);
  }
});
