import test from "node:test";
import assert from "node:assert/strict";
import { TransactionRollbackError } from "drizzle-orm/errors";
import { sql } from "drizzle-orm";
import { drizzle, integer, text, YdbDialect, YdbSession, ydbTable } from "../../src/index.js";
import { orderSelectedFields } from "../../src/ydb-core/result-mapping.js";

const dialect = new YdbDialect();
const users = ydbTable("users", {
  id: integer("id").notNull(),
  name: text("name").notNull(),
});

test("prepareQuery", () => {
  const logs: Array<{ query: string; params: unknown[] }> = [];
  const session = new YdbSession({
    async execute() {
      return { rows: [] };
    },
  }, dialect, {
    logger: {
      logQuery(query, params) {
        logs.push({ query, params: [...params] });
      },
    },
  });

  const fields = orderSelectedFields({ id: users.id, name: users.name });
  const prepared = session.prepareQuery(
    sql`select ${1} as ${sql.identifier("id")}`,
    fields,
    "select_users",
    true,
    (rows) => rows.length,
  );

  assert.equal(prepared.getQuery().sql, "select $p0 as `id`");
  assert.deepEqual(prepared.getQuery().params, [1]);
  assert.equal(prepared.isResponseInArrayMode(), true);
  assert.equal(prepared.mapResult([[1, "Twilight"]]), 1);
  assert.deepEqual(logs, []);
});

test("prepared rows", async () => {
  const logs: Array<{ query: string; params: unknown[] }> = [];
  const calls: Array<{ method: string; options: unknown }> = [];
  const fields = orderSelectedFields({ id: users.id, name: users.name });
  const session = new YdbSession({
    async execute(_query, _params, method, options) {
      calls.push({ method, options });
      return { rows: [[1, "Twilight Sparkle"]] };
    },
  }, dialect, {
    logger: {
      logQuery(query, params) {
        logs.push({ query, params: [...params] });
      },
    },
  });

  const prepared = session.prepareQuery(sql`select ${1} as id, ${"Twilight Sparkle"} as name`, fields, undefined, false);

  const allRows = await prepared.all();
  const oneRow = await prepared.get();
  const valueRows = await prepared.values();

  assert.deepEqual(allRows, [{ id: 1, name: "Twilight Sparkle" }]);
  assert.deepEqual(oneRow, { id: 1, name: "Twilight Sparkle" });
  assert.deepEqual(valueRows, [[1, "Twilight Sparkle"]]);
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["all", "all", "all"],
  );
  assert.equal(logs.length, 3);
  assert.ok(logs.every(({ query }) => query === "select $p0 as id, $p1 as name"));
});

test("prepared execute", async () => {
  const session = new YdbSession({
    async execute(_query, _params, _method, options) {
      return { rows: options?.arrayMode ? [[1, "Rarity"]] : [{ id: 1, name: "Rarity" }] };
    },
  }, dialect);

  const rawPrepared = session.prepareQuery(sql`select ${1}`, undefined, undefined, false);
  const arrayPrepared = session.prepareQuery(sql`select ${1}`, undefined, undefined, true);

  assert.deepEqual(await rawPrepared.execute(), [{ id: 1, name: "Rarity" }]);
  assert.deepEqual(await arrayPrepared.execute(), [[1, "Rarity"]]);

  await assert.rejects(
    () => rawPrepared.execute({ id: 1 }),
    /Prepared query placeholders are not supported yet/,
  );
});

test("prepared get", async () => {
  const session = new YdbSession({
    async execute() {
      return { rows: [[1, "Pinkie Pie"]] };
    },
  }, dialect);

  const prepared = session.prepareQuery(
    sql`select ${1} as id, ${"Pinkie Pie"} as name`,
    orderSelectedFields({ id: users.id, name: users.name }),
    undefined,
    true,
    (rows) => ({ id: rows[0]?.[0], name: rows[0]?.[1] }),
  );

  assert.deepEqual(await prepared.get(), { id: 1, name: "Pinkie Pie" });
});

test("session helpers", async () => {
  const calls: Array<{ method: string; arrayMode?: boolean; query: string }> = [];
  const rowsQuery = sql`select ${7} as ${sql.identifier("id")}, ${"Applejack"} as ${sql.identifier("name")}`;
  const countQuery = sql`select count(*) as ${sql.identifier("count")} from ${sql.identifier("users")}`;
  const session = new YdbSession({
    async execute(query, _params, method, options) {
      calls.push({ method, arrayMode: options?.arrayMode, query });

      if (query.includes("count")) {
        return { rows: [[3]] };
      }

      if (options?.arrayMode) {
        return { rows: [[7, "Applejack"]] };
      }

      return { rows: [{ id: 7, name: "Applejack" }] };
    },
  }, dialect);

  const executeResult = await session.execute(rowsQuery);
  const allResult = await session.all(rowsQuery);
  const getResult = await session.get(rowsQuery);
  const valuesResult = await session.values(rowsQuery);
  const countResult = await session.count(countQuery);

  assert.deepEqual(executeResult, [{ id: 7, name: "Applejack" }]);
  assert.deepEqual(allResult, [{ id: 7, name: "Applejack" }]);
  assert.deepEqual(getResult, { id: 7, name: "Applejack" });
  assert.deepEqual(valuesResult, [[7, "Applejack"]]);
  assert.equal(countResult, 3);
  assert.deepEqual(
    calls.map(({ method, arrayMode }) => ({ method, arrayMode })),
    [
      { method: "execute", arrayMode: false },
      { method: "all", arrayMode: false },
      { method: "all", arrayMode: false },
      { method: "all", arrayMode: true },
      { method: "all", arrayMode: true },
    ],
  );
});

test("session helpers with builders", async () => {
  const db = drizzle({
    async execute(query, _params, _method, options) {
      if (query.startsWith("insert into `users`")) {
        return { rows: [] };
      }

      if (options?.arrayMode) {
        return { rows: [[1, "Rainbow Dash"]] };
      }

      return { rows: [[1, "Rainbow Dash"]] };
    },
  });

  const selectBuilder = db.select().from(users).where(sql`${users.id} = ${1}`);
  const insertBuilder = db.insert(users).values({ id: 1, name: "Rainbow Dash" });

  assert.deepEqual(
    await db.execute<Array<{ id: number; name: string }>>(selectBuilder),
    [{ id: 1, name: "Rainbow Dash" }],
  );
  assert.deepEqual(
    await db.all<{ id: number; name: string }>(selectBuilder),
    [{ id: 1, name: "Rainbow Dash" }],
  );
  assert.deepEqual(
    await db.get<{ id: number; name: string }>(selectBuilder),
    { id: 1, name: "Rainbow Dash" },
  );
  assert.deepEqual(
    await db.values<[number, string]>(selectBuilder),
    [[1, "Rainbow Dash"]],
  );
  assert.deepEqual(await db.execute(insertBuilder), []);
});

test("session transaction", async () => {
  const transactionConfigs: unknown[] = [];
  const sessionWithoutTransactions = new YdbSession({
    async execute() {
      return { rows: [] };
    },
  }, dialect);

  await assert.rejects(
    () => sessionWithoutTransactions.transaction(async () => "nope"),
    /Transactions are not supported/,
  );

  const session = new YdbSession({
    async execute() {
      return { rows: [] };
    },
    async transaction(callback, config) {
      transactionConfigs.push(config);

      try {
        return await callback({
          async execute() {
            return { rows: [] };
          },
          async transaction() {
            throw new Error("Nested transactions are not supported by YDB");
          },
        });
      } catch (error) {
        throw new Error("wrapped", { cause: error });
      }
    },
  }, dialect);

  const committed = await session.transaction(async (tx) => {
    await tx.execute(sql`select ${1}`);
    return "ok";
  }, { accessMode: "read only" });

  assert.equal(committed, "ok");
  assert.deepEqual(transactionConfigs, [{ accessMode: "read only" }]);

  await assert.rejects(
    () => session.transaction(async (tx) => {
      tx.rollback();
    }),
    TransactionRollbackError,
  );
});
