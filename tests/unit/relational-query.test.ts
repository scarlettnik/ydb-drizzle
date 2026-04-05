import test from "node:test";
import assert from "node:assert/strict";
import { desc } from "drizzle-orm";
import { YdbRelationalQueryBuilder } from "../../src/ydb-core/query-builders/index.js";
import { dialect, users } from "../helpers/unit-basic.js";

test("relational builder", async () => {
  const executedSql: string[] = [];
  const relationalSession = {
    prepareQuery(query: any, fields: unknown, name?: string, isResponseInArrayMode = false, customResultMapper?: (rows: unknown[][]) => unknown) {
      const built = "sql" in query && Array.isArray(query.params) ? query : dialect.sqlToQuery(query);
      executedSql.push(built.sql);

      return {
        getQuery() {
          return built;
        },
        async execute() {
          const rows = built.sql.includes("offset")
            ? [[1, "Pinkie Pie"], [2, "Rainbow Dash"]]
            : [[1, "Pinkie Pie"]];
          if (customResultMapper) {
            return customResultMapper(rows);
          }

          return rows.map((row) => ({ id: row[0], name: row[1] }));
        },
      };
    },
  } as any;

  const tableConfig = {
    tsName: "users",
    dbName: "users",
    columns: { id: users.id, name: users.name, createdAt: users.createdAt, updatedAt: users.updatedAt },
    relations: {},
    primaryKey: [users.id],
  } as any;
  const relational = new YdbRelationalQueryBuilder(
    { users },
    { users: tableConfig },
    { users: "users" },
    users,
    tableConfig,
    relationalSession,
  );

  const many = await relational.findMany({
    columns: { id: true, name: true },
    where: (fields, { eq }) => eq(fields.id, 1),
    orderBy: (fields, { desc }) => desc(fields.name),
    limit: 5,
    offset: 2,
  }).execute();
  const first = await relational.findFirst({
    where: (fields, { eq }) => eq(fields.id, 1),
  }).execute();

  assert.deepEqual(many, [{ id: 1, name: "Pinkie Pie" }, { id: 2, name: "Rainbow Dash" }]);
  assert.deepEqual(first, {
    id: 1,
    name: "Pinkie Pie",
    createdAt: undefined,
    updatedAt: undefined,
  });
  assert.match(executedSql[0] ?? "", /^select `users`\.`id`, `users`\.`name` from `users` where `users`\.`id` = \$p0 order by `users`\.`name` desc limit \$p1 offset \$p2$/);
  assert.match(executedSql[1] ?? "", /^select `users`\.`id`, `users`\.`name`, `users`\.`created_at`, `users`\.`updated_at` from `users` where `users`\.`id` = \$p0 limit \$p1$/);
});
