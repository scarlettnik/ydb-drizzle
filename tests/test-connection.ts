import { sql } from "drizzle-orm";
import { YdbDriver, drizzle } from "../src/index.js";

async function main() {
  const connectionString = process.env.YDB_CONNECTION_STRING ?? "grpc://localhost:2136/local";
  const driver = new YdbDriver(connectionString);
  await driver.ready();

  const db = drizzle(driver);

  try {
    console.log(`[ydb] connected to ${connectionString}`);

    // NOTE: DDL is intentionally raw here: schema/migrations support for YDB is out of scope for the initial adapter.
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS demo_users (
        id Int32,
        name Utf8,
        PRIMARY KEY (id)
      )
    `));

    await db.transaction(async (tx) => {
      await tx.execute(sql`INSERT INTO ${sql.identifier("demo_users")} (id, name) VALUES (${1}, ${"Alice"})`);
      await tx.execute(sql`INSERT INTO ${sql.identifier("demo_users")} (id, name) VALUES (${2}, ${"Bob"})`);
      await tx.execute(sql`UPDATE ${sql.identifier("demo_users")} SET name = ${"Alice Updated"} WHERE id = ${1}`);
    });

    const one = await db.execute(sql`SELECT id, name FROM ${sql.identifier("demo_users")} WHERE id = ${1}`);
    console.log("row id=1:", one);

    await db.execute(sql`DELETE FROM ${sql.identifier("demo_users")} WHERE id = ${2}`);
    const all = await db.execute(sql`SELECT id, name FROM ${sql.identifier("demo_users")}`);
    console.log("all rows:", all);
  } finally {
    driver.close();
  }
}

main().catch((error) => {
  console.error("[ydb] smoke test failed:", error);
  process.exitCode = 1;
});
