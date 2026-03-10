import test, { after, before, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { TransactionRollbackError } from "drizzle-orm/errors";
import { eq, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  bytes,
  date,
  datetime,
  double,
  drizzle,
  float,
  integer,
  json,
  jsonDocument,
  text,
  timestamp,
  uint32,
  uint64,
  uuid,
  ydbTable,
  yson,
  YdbDriver,
  type YdbDrizzleDatabase,
} from "../src/index.js";

function getSafeTableName(envName: string, fallback: string): string {
  const tableName = process.env[envName] ?? fallback;

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
    throw new Error(`Invalid YDB table name in ${envName}: ${tableName}`);
  }

  return tableName;
}

const ydbUrl = process.env.YDB_CONNECTION_STRING ?? "grpc://localhost:2136/local";
const usersTableName = getSafeTableName("YDB_TEST_TABLE", "adapter_test_users");
const typesTableName = getSafeTableName("YDB_TYPES_TEST_TABLE", "adapter_test_column_types");
const keepData = process.env.YDB_TEST_KEEP_DATA === "1";
const verbose = process.env.YDB_TEST_VERBOSE === "1";

const users = ydbTable(usersTableName, {
  id: integer("id").notNull(),
  name: text("name").notNull(),
});

const typesTable = ydbTable(typesTableName, {
  id: uint64("id").notNull(),
  flag: boolean("flag"),
  signed64: bigint("signed64"),
  u32: uint32("u32"),
  f32: float("f32"),
  f64: double("f64"),
  bytesValue: bytes("bytes_value"),
  dateValue: date("date_value"),
  datetimeValue: datetime("datetime_value"),
  timestampValue: timestamp("timestamp_value"),
  jsonValue: json("json_value"),
  jsonDocumentValue: jsonDocument("json_document_value"),
  uuidValue: uuid("uuid_value"),
  ysonValue: yson("yson_value"),
});

let driver: YdbDriver;
const baseIntId = Math.floor(Date.now() % 1_000_000_000);
const baseUint64Id = 2_000_000_000n + BigInt(Date.now() % 1_000_000);
const liveSchema = { users, typesTable };
let db: YdbDrizzleDatabase<typeof liveSchema>;
const liveQueryLog: Array<{ query: string; params: unknown[] }> = [];
let liveDbUnavailableReason: string | undefined;

function log(...args: unknown[]): void {
  if (!verbose) {
    return;
  }

  console.log("[test]", ...args);
}

function sortById<T extends { id: number | bigint }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    if (left.id < right.id) {
      return -1;
    }

    if (left.id > right.id) {
      return 1;
    }

    return 0;
  });
}

async function ensureTables(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${usersTableName} (
      id Int32,
      name Utf8,
      PRIMARY KEY (id)
    )
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${typesTableName} (
      id Uint64,
      flag Bool,
      signed64 Int64,
      u32 Uint32,
      f32 Float,
      f64 Double,
      bytes_value String,
      date_value Date,
      datetime_value Datetime,
      timestamp_value Timestamp,
      json_value Json,
      json_document_value JsonDocument,
      uuid_value Uuid,
      yson_value Yson,
      PRIMARY KEY (id)
    )
  `));
}

async function deleteUserRows(ids: number[]): Promise<void> {
  if (keepData) {
    return;
  }

  for (const id of ids) {
    await db.delete(users).where(eq(users.id, id));
  }
}

async function deleteTypeRows(ids: bigint[]): Promise<void> {
  if (keepData) {
    return;
  }

  for (const id of ids) {
    await db.delete(typesTable).where(eq(typesTable.id, id));
  }
}

function normalizeTypeRow(row: Record<string, unknown>) {
  assert.ok(row.bytesValue instanceof Uint8Array);
  assert.ok(row.ysonValue instanceof Uint8Array);
  assert.ok(row.dateValue instanceof Date);
  assert.ok(row.datetimeValue instanceof Date);
  assert.ok(row.timestampValue instanceof Date);

  return {
    id: row.id,
    flag: row.flag,
    signed64: row.signed64,
    u32: row.u32,
    f32: row.f32,
    f64: row.f64,
    bytesValue: Array.from(row.bytesValue),
    dateValue: row.dateValue.toISOString(),
    datetimeValue: row.datetimeValue.toISOString(),
    timestampValue: row.timestampValue.toISOString(),
    jsonValue: row.jsonValue,
    jsonDocumentValue: row.jsonDocumentValue,
    uuidValue: row.uuidValue,
    ysonValue: Array.from(row.ysonValue),
  };
}

before(async () => {
  try {
    driver = new YdbDriver(ydbUrl);
    await driver.ready();
    db = drizzle(driver, {
      schema: liveSchema,
      logger: {
        logQuery(query, params) {
          liveQueryLog.push({ query, params: [...params] });

          if (verbose) {
            console.log("[sql]", query, params);
          }
        },
      },
    });

    await ensureTables();
    log("up", usersTableName, typesTableName, keepData ? "keep" : "clean");
  } catch (error) {
    liveDbUnavailableReason = error instanceof Error ? error.message : String(error);
  }
});

after(async () => {
  driver?.close();
});

function requireLiveYdb(t: TestContext): void {
  if (liveDbUnavailableReason) {
    t.skip(`YDB unavailable: ${liveDbUnavailableReason}`);
  }
}

test("raw sql", async (t) => {
  requireLiveYdb(t);
  const id = baseIntId + 1;

  log("raw", id);
  await deleteUserRows([id]);

  try {
    await db.execute(sql`insert into ${sql.identifier(usersTableName)} (id, name) values (${id}, ${"pinky"})`);

    const inserted = await db.execute<Array<{ id: number; name: string }>>(
      sql`select id, name from ${sql.identifier(usersTableName)} where id = ${id}`,
    );

    assert.deepEqual(inserted, [{ id, name: "pinky" }]);

    await db.execute(sql`delete from ${sql.identifier(usersTableName)} where id = ${id}`);

    const remaining = await db.execute<Array<{ id: number; name: string }>>(
      sql`select id, name from ${sql.identifier(usersTableName)} where id = ${id}`,
    );

    assert.deepEqual(remaining, []);
  } finally {
    //await deleteUserRows([id]);
  }
});

test("createDrizzle inputs", async (t) => {
  requireLiveYdb(t);
  const connectionDb = drizzle({ connectionString: ydbUrl, schema: liveSchema });
  const callbackCalls: Array<{ query: string; method: string; params: unknown[] }> = [];
  const callbackDb = drizzle(async (query, params, method, options) => {
    callbackCalls.push({ query, method, params: [...params] });
    return driver.execute(query, params, method, options);
  }, { schema: liveSchema });

  try {
    await (connectionDb.$client as YdbDriver).ready?.();

    const connectionRows = await connectionDb.execute<Array<{ value: number }>>(
      sql`select ${1} as ${sql.identifier("value")}`,
    );
    const callbackRows = await callbackDb.execute<Array<{ value: number }>>(
      sql`select ${2} as ${sql.identifier("value")}`,
    );

    assert.deepEqual(connectionRows, [{ value: 1 }]);
    assert.deepEqual(callbackRows, [{ value: 2 }]);
    assert.equal(callbackCalls.length, 1);
    assert.equal(callbackCalls[0]?.method, "execute");
    assert.equal(callbackCalls[0]?.query, "select $p0 as `value`");
  } finally {
    (connectionDb.$client as YdbDriver).close();
  }
});

test("builder CRUD", async (t) => {
  requireLiveYdb(t);
  const firstId = baseIntId + 101;
  const secondId = baseIntId + 102;

  log("crud", firstId, secondId);
  //await deleteUserRows([firstId, secondId]);

  try {
    await db.insert(users).values([{ id: firstId, name: "rarity" }, { id: secondId, name: "applejack" }]);

    const inserted = sortById(
      (await db.select().from(users).where(sql`${users.id} IN (${firstId}, ${secondId})`)) as Array<{
        id: number;
        name: string;
      }>,
    );

    assert.deepEqual(inserted, [
      { id: firstId, name: "rarity" },
      { id: secondId, name: "applejack" },
    ]);

    await db.update(users).set({ name: "rarity updated" }).where(eq(users.id, firstId));
    await db.delete(users).where(eq(users.id, secondId));

    const remaining = (await db.select().from(users).where(sql`${users.id} IN (${firstId}, ${secondId})`)) as Array<{
      id: number;
      name: string;
    }>;

    assert.deepEqual(remaining, [{ id: firstId, name: "rarity updated" }]);
  } finally {
   // await deleteUserRows([firstId, secondId]);
  }
});

test("db helpers", async (t) => {
  requireLiveYdb(t);
  const id = baseIntId + 151;

  liveQueryLog.length = 0;
  log("helpers", id);
  //await deleteUserRows([id]);

  try {
    await db.execute(db.insert(users).values({ id, name: "sunset shimmer" }));

    const selectQuery = db.select().from(users).where(eq(users.id, id));
    const selectedRows = await selectQuery.prepare("select_user_prepared").execute() as Array<{
      id: number;
      name: string;
    }>;
    const executeRows = await db.execute<Array<{ id: number; name: string }>>(selectQuery);
    const allRows = await db.all<{ id: number; name: string }>(selectQuery);
    const oneRow = await db.get<{ id: number; name: string }>(selectQuery);
    const valueRows = await db.values<[number, string]>(selectQuery);

    assert.deepEqual(selectedRows, [{ id, name: "sunset shimmer" }]);
    assert.deepEqual(executeRows, [{ id, name: "sunset shimmer" }]);
    assert.deepEqual(allRows, [{ id, name: "sunset shimmer" }]);
    assert.deepEqual(oneRow, { id, name: "sunset shimmer" });
    assert.deepEqual(valueRows, [[id, "sunset shimmer"]]);

    await db.execute(db.update(users).set({ name: "sunset updated" }).where(eq(users.id, id)));
    await db.execute(db.delete(users).where(eq(users.id, id)));

    const remainingRows = await db.select().from(users).where(eq(users.id, id));
    assert.deepEqual(remainingRows, []);
    assert.ok(liveQueryLog.some(({ query }) => query.includes(`insert into \`${usersTableName}\``)));
    assert.ok(liveQueryLog.some(({ query }) => query.includes(`update \`${usersTableName}\``)));
    assert.ok(liveQueryLog.some(({ query }) => query.includes(`delete from \`${usersTableName}\``)));
  } finally {
    //await deleteUserRows([id]);
  }
});

test("schema query", async (t) => {
  requireLiveYdb(t);
  const id = baseIntId + 201;

  liveQueryLog.length = 0;
  log("schema", id);
  await deleteUserRows([id]);

  try {
    await db.insert(users).values({ id, name: "twilight sparkle" });

    const inserted = await (db as any).query.users.findFirst({
      where: (fields: typeof users, { eq }: { eq: (left: unknown, right: unknown) => unknown }) => eq(fields.id, id),
    });

    assert.deepEqual(inserted, { id, name: "twilight sparkle" });
    assert.ok((db as any)._.schema?.users);
    assert.ok(liveQueryLog.some(({ query }) => query.includes(`insert into \`${usersTableName}\``)));
    assert.ok(liveQueryLog.some(({ query }) => query.includes(`from \`${usersTableName}\``)));
  } finally {
    await deleteUserRows([id]);
  }
});

test("findMany", async (t) => {
  requireLiveYdb(t);
  const firstId = baseIntId + 221;
  const secondId = baseIntId + 222;

  log("many", firstId, secondId);
  await deleteUserRows([firstId, secondId]);

  try {
    await db.insert(users).values([
      { id: firstId, name: "apple bloom" },
      { id: secondId, name: "sweetie belle" },
    ]);

    const rows = await (db as any).query.users.findMany({
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
    //await deleteUserRows([firstId, secondId]);
  }
});

test("transaction", async (t) => {
  requireLiveYdb(t);
  const committedId = baseIntId + 301;
  const rolledBackId = baseIntId + 302;

  liveQueryLog.length = 0;
  log("tx", committedId, rolledBackId);
  await deleteUserRows([committedId, rolledBackId]);

  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values({ id: committedId, name: "starlight glimmer" });

      const insideTxRow = await (tx as any).query.users.findFirst({
        where: (fields: typeof users, { eq }: { eq: (left: unknown, right: unknown) => unknown }) => eq(fields.id, committedId),
      });

      assert.deepEqual(insideTxRow, { id: committedId, name: "starlight glimmer" });
    }, { accessMode: "read write", idempotent: false });

    const committedRow = await (db as any).query.users.findFirst({
      where: (fields: typeof users, { eq }: { eq: (left: unknown, right: unknown) => unknown }) => eq(fields.id, committedId),
    });

    assert.deepEqual(committedRow, { id: committedId, name: "starlight glimmer" });

    await assert.rejects(
      async () => db.transaction(async (tx) => {
        await tx.insert(users).values({ id: rolledBackId, name: "tempest shadow" });
        tx.rollback();
      }, { accessMode: "read write" }),
      TransactionRollbackError,
    );

    const rolledBackRows = await db.select().from(users).where(eq(users.id, rolledBackId)) as Array<{
      id: number;
      name: string;
    }>;

    assert.deepEqual(rolledBackRows, []);
    assert.ok(liveQueryLog.some(({ query }) => query.includes(`insert into \`${usersTableName}\``)));
    assert.ok(liveQueryLog.some(({ query }) => query.includes(`from \`${usersTableName}\``)));
  } finally {
    //await deleteUserRows([committedId, rolledBackId]);
  }
});

test("types round-trip", async (t) => {
  requireLiveYdb(t);
  const id = baseUint64Id + 1n;
  const now = new Date();
  const initialDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const initialDatetime = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const initialTimestamp = new Date(now);
  const initialBytes = Uint8Array.from(Buffer.from("pony-bytes", "utf8"));
  const initialJson = { pony: "Pinkie Pie", level: 7 };
  const initialJsonDocument = ["Twilight", "Sparkle"];
  const initialUuid = "550e8400-e29b-41d4-a716-446655440000";
  const initialYson = Uint8Array.from([60, 97, 61, 49, 62, 91, 51, 59, 37, 102, 97, 108, 115, 101, 93]);

  const updatedBytes = Uint8Array.from(Buffer.from("rainbow-bytes", "utf8"));
  const updatedJson = { pony: "Rainbow Dash", level: 9 };
  const updatedJsonDocument = { team: "Mane Six" };
  const updatedTimestamp = new Date(now.getTime() + 60_000);
  const updatedYson = Uint8Array.from([91, 49, 59, 50, 59, 51, 93]);

  log("types", id.toString());
  //await deleteTypeRows([id]);

  try {
    await db.insert(typesTable).values({
      id,
      flag: true,
      signed64: -123n,
      u32: 42,
      f32: 1.5,
      f64: 2.75,
      bytesValue: initialBytes,
      dateValue: initialDate,
      datetimeValue: initialDatetime,
      timestampValue: initialTimestamp,
      jsonValue: initialJson,
      jsonDocumentValue: initialJsonDocument,
      uuidValue: initialUuid,
      ysonValue: initialYson,
    });

    const insertedRows = await db.select().from(typesTable).where(eq(typesTable.id, id)) as Array<Record<string, unknown>>;

    assert.deepEqual(
      normalizeTypeRow(insertedRows[0]!),
      {
        id,
        flag: true,
        signed64: -123n,
        u32: 42,
        f32: 1.5,
        f64: 2.75,
        bytesValue: Array.from(initialBytes),
        dateValue: initialDate.toISOString(),
        datetimeValue: initialDatetime.toISOString(),
        timestampValue: initialTimestamp.toISOString(),
        jsonValue: initialJson,
        jsonDocumentValue: initialJsonDocument,
        uuidValue: initialUuid,
        ysonValue: Array.from(initialYson),
      },
    );

    await db.update(typesTable).set({
      flag: false,
      signed64: 777n,
      u32: 99,
      f32: 3.25,
      f64: 6.5,
      bytesValue: updatedBytes,
      timestampValue: updatedTimestamp,
      jsonValue: updatedJson,
      jsonDocumentValue: updatedJsonDocument,
      uuidValue: "123e4567-e89b-12d3-a456-426614174000",
      ysonValue: updatedYson,
    }).where(eq(typesTable.id, id));

    const updatedRows = await db.select().from(typesTable).where(eq(typesTable.id, id)) as Array<Record<string, unknown>>;

    assert.deepEqual(
      normalizeTypeRow(updatedRows[0]!),
      {
        id,
        flag: false,
        signed64: 777n,
        u32: 99,
        f32: 3.25,
        f64: 6.5,
        bytesValue: Array.from(updatedBytes),
        dateValue: initialDate.toISOString(),
        datetimeValue: initialDatetime.toISOString(),
        timestampValue: updatedTimestamp.toISOString(),
        jsonValue: updatedJson,
        jsonDocumentValue: updatedJsonDocument,
        uuidValue: "123e4567-e89b-12d3-a456-426614174000",
        ysonValue: Array.from(updatedYson),
      },
    );
  } finally {
    //await deleteTypeRows([id]);
  }
});
