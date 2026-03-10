import { sql } from "drizzle-orm";
import { integer, text, YdbDriver, drizzle, ydbTable } from "../src/index.js";

const demoUsers = ydbTable("demo_users", {
  id: integer("id").notNull(),
  name: text("name").notNull(),
});

async function main() {
  const connectionString = process.env.YDB_CONNECTION_STRING ?? "grpc://localhost:2136/local";
  const driver = new YdbDriver(connectionString);
  await driver.ready();

  const db = drizzle(driver);

  try {
    console.log("[test]", connectionString);

    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS demo_users (
        id Int32,
        name Utf8,
        PRIMARY KEY (id)
      )
    `));

    await db.transaction(async (tx) => {
      await tx.insert(demoUsers).values({ id: 1, name: "Alice" });
      await tx.insert(demoUsers).values({ id: 2, name: "Bob" });
      await tx.update(demoUsers).set({ name: "Alice Updated" }).where(sql`${demoUsers.id} = ${1}`);
    });

    const one = await db.select().from(demoUsers).where(sql`${demoUsers.id} = ${1}`);
    console.log("[one]", one);

    await db.delete(demoUsers).where(sql`${demoUsers.id} = ${2}`);
    const all = await db.select().from(demoUsers);
    console.log("[all]", all);
  } finally {
    driver.close();
  }
}

main().catch((error) => {
  console.error("[fail]", error);
  process.exitCode = 1;
});
