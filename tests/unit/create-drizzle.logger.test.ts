import test from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { drizzle, integer, text, ydbTable } from "../../src/index.js";

const users = ydbTable("users", {
  id: integer("id").notNull(),
  name: text("name").notNull(),
});

test("logger", async () => {
  const logs: Array<{ query: string; params: unknown[] }> = [];

  const db = drizzle({
    async execute(query, params) {
      return {
        rows: query.startsWith("select")
          ? [{ value: params[0] }]
          : [],
      };
    },
  }, {
    logger: {
      logQuery(query, params) {
        logs.push({ query, params: [...params] });
      },
    },
  });

  await db.execute<{ value: number }[]>(sql`select ${123} as value`);
  await db.insert(users).values({ id: 1, name: "Pinkie Pie" });

  assert.equal(logs.length, 2);
  assert.equal(logs[0]?.query, "select $p0 as value");
  assert.deepEqual(logs[0]?.params, [123]);
  assert.equal(logs[1]?.query, "insert into `users` (`id`, `name`) values ($p0, $p1)");
  assert.deepEqual(logs[1]?.params, [1, "Pinkie Pie"]);
});
