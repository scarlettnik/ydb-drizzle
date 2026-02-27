import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { YdbDriver, drizzle } from "../src/index.js";

const ydbUrl = process.env.YDB_CONNECTION_STRING ?? "grpc://localhost:2136/local";
const testTable = process.env.YDB_TEST_TABLE ?? "adapter_test_users";
const users = pgTable(testTable, {
  id: integer("id").notNull(),
  name: text("name").notNull(),
});

let driver: YdbDriver;
let db: ReturnType<typeof drizzle>;
const baseId = Math.floor(Date.now() % 1_000_000_000);

before(async () => {
  driver = new YdbDriver(ydbUrl);
  await driver.ready();
  db = drizzle(driver, { logger: true });

  console.log("connected", { url: ydbUrl, table: testTable });
  console.log("create table");

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${testTable} (
      id Int32,
      name Utf8,
      PRIMARY KEY (id)
    )
  `));
});

after(async () => {
  driver?.close();
});

test("CRUD writes data to real YDB table", async () => {
  const firstId = baseId + 1;
  const secondId = baseId + 2;
  console.log("ids", { firstId, secondId });

  console.log("cleanup");
  await db.execute(sql`DELETE FROM ${sql.identifier(testTable)} WHERE id = ${firstId}`);
  await db.execute(sql`DELETE FROM ${sql.identifier(testTable)} WHERE id = ${secondId}`);

  console.log("insert");
  await db.execute(sql`INSERT INTO ${sql.identifier(testTable)} (id, name) VALUES (${firstId}, ${"pinky"})`);
  await db.execute(sql`INSERT INTO ${sql.identifier(testTable)} (id, name) VALUES (${secondId}, ${"flottershie"})`);

  console.log("select");
  const inserted = (await db.execute(
    sql`SELECT id, name FROM ${sql.identifier(testTable)} WHERE id in (${firstId}, ${secondId})`,
  )) as Array<{ id: number; name: string }>;

  assert.equal(inserted.length, 2);

  console.log("update");
  await db.execute(
    sql`UPDATE ${sql.identifier(testTable)} SET name = ${"pinky updated"} WHERE id = ${firstId}`,
  );

  console.log("check");
  const updated = (await db.execute(
    sql`SELECT id, name FROM ${sql.identifier(testTable)} WHERE id = ${firstId}`,
  )) as Array<{ id: number; name: string }>;
  assert.equal(updated.length, 1);
  assert.equal(updated[0]!.name, "pinky updated");
});

test("query builder CRUD works with real YDB table", async () => {
  const firstId = baseId + 101;
  const secondId = baseId + 102;

  await db.delete(users).where(eq(users.id, firstId));
  await db.delete(users).where(eq(users.id, secondId));

  await db.insert(users).values({ id: firstId, name: "rarity" });
  await db.insert(users).values({ id: secondId, name: "applejack" });

  const inserted = await db
    .select()
    .from(users)
    .where(sql`${users.id} in (${firstId}, ${secondId})`);

  assert.equal(inserted.length, 2);

  await db.update(users).set({ name: "rarity updated" }).where(eq(users.id, firstId));

  const updated = await db.select().from(users).where(eq(users.id, firstId));
  assert.equal(updated.length, 1);
  assert.equal(updated[0]!.name, "rarity updated");

  await db.delete(users).where(eq(users.id, firstId));
  await db.delete(users).where(eq(users.id, secondId));
});
