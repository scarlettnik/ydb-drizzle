import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  YdbDeleteBuilder,
  YdbInsertBuilder,
  YdbSelectBuilder,
  YdbUpdateBuilder,
} from "../../src/ydb-core/query-builders/index.js";
import { createMockSession, users } from "../helpers/unit-basic.js";

test("builders", async () => {
  const { session, prepareCalls } = createMockSession();

  const selectBuilder = new YdbSelectBuilder(session).from(users).where(eq(users.id, 7));
  const insertBuilder = new YdbInsertBuilder(users, session).values({ id: 1, name: "Twilight" });
  const updateBuilder = new YdbUpdateBuilder(users, session).set({ name: "Rainbow" }).where(eq(users.id, 1));
  const deleteBuilder = new YdbDeleteBuilder(users, session).where(eq(users.id, 1));

  assert.equal(
    selectBuilder.toSQL().sql,
    "select `users`.`id`, `users`.`name`, `users`.`created_at`, `users`.`updated_at` from `users` where `users`.`id` = $p0",
  );
  assert.equal(insertBuilder.toSQL().sql, "insert into `users` (`id`, `name`, `created_at`, `updated_at`) values ($p0, $p1, $p2, $p3)");
  assert.equal(updateBuilder.toSQL().sql, "update `users` set `name` = $p0, `updated_at` = $p1 where `users`.`id` = $p2");
  assert.equal(deleteBuilder.toSQL().sql, "delete from `users` where `users`.`id` = $p0");

  await selectBuilder.prepare("sel_users").execute();
  await insertBuilder.prepare("ins_users").execute();
  await updateBuilder.prepare("upd_users").execute();
  await deleteBuilder.prepare("del_users").execute();

  assert.deepEqual(
    prepareCalls.map(({ name, isResponseInArrayMode }) => ({ name, isResponseInArrayMode })),
    [
      { name: undefined, isResponseInArrayMode: false },
      { name: undefined, isResponseInArrayMode: false },
      { name: undefined, isResponseInArrayMode: false },
      { name: undefined, isResponseInArrayMode: false },
      { name: "sel_users", isResponseInArrayMode: true },
      { name: "ins_users", isResponseInArrayMode: false },
      { name: "upd_users", isResponseInArrayMode: false },
      { name: "del_users", isResponseInArrayMode: false },
    ],
  );

  const executedSelect = await selectBuilder.execute() as unknown as { prepared: string };
  const executedInsert = await insertBuilder.execute() as unknown as { prepared: string };
  const executedUpdate = await updateBuilder.execute() as unknown as { prepared: string };
  const executedDelete = await deleteBuilder.execute() as unknown as { prepared: string };

  assert.match(executedSelect.prepared, /^select /);
  assert.match(executedInsert.prepared, /^insert into /);
  assert.match(executedUpdate.prepared, /^update /);
  assert.match(executedDelete.prepared, /^delete from /);
});

test("builders reject invalid state", () => {
  const { session } = createMockSession();

  assert.throws(
    () => new YdbSelectBuilder(session).getSQL(),
    /Missing table in select\(\)\.from\(\)/,
  );
  assert.throws(
    () => new YdbInsertBuilder(users, session).getSQL(),
    /Insert values are missing/,
  );
  assert.throws(
    () => new YdbInsertBuilder(users, session).values([]).getSQL(),
    /Insert values are empty/,
  );
  assert.throws(
    () => new YdbUpdateBuilder(users, session).getSQL(),
    /Update values are missing/,
  );
  assert.throws(
    () => new YdbSelectBuilder(session).from(users).limit(-1),
    /YDB limit\(\) expects a non-negative finite number/,
  );
  assert.throws(
    () => new YdbSelectBuilder(session).from(users).offset(-1),
    /YDB offset\(\) expects a non-negative finite number/,
  );
  assert.throws(
    () => new YdbSelectBuilder(session).distinct().distinctOn(users.id),
    /cannot combine distinct\(\) and distinctOn\(\)/,
  );
  assert.throws(
    () => new YdbSelectBuilder(session).distinctOn(users.id).distinct(),
    /cannot combine distinct\(\) and distinctOn\(\)/,
  );
});
