import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { integer, text, ydbTable } from "../src/index.js";
import {
  YdbDeleteBuilder,
  YdbInsertBuilder,
  YdbRelationalQueryBuilder,
  YdbSelectBuilder,
  YdbUpdateBuilder,
} from "../src/ydb-core/query-builders/index.js";
import { YdbDialect } from "../src/ydb/dialect.js";

const dialect = new YdbDialect();
const users = ydbTable("users", {
  id: integer("id").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at").$defaultFn(() => 100),
  updatedAt: integer("updated_at").$onUpdateFn(() => 200),
});

function createMockSession() {
  const prepareCalls: Array<{
    name?: string;
    isResponseInArrayMode: boolean;
    query: { sql: string; params: unknown[]; typings?: unknown[] };
    fields: unknown;
  }> = [];

  return {
    prepareCalls,
    session: {
      prepareQuery(query: any, fields: unknown, name?: string, isResponseInArrayMode = false) {
        const built = "sql" in query && Array.isArray(query.params) ? query : dialect.sqlToQuery(query);
        prepareCalls.push({ name, isResponseInArrayMode, query: built, fields });

        return {
          getQuery() {
            return built;
          },
          async execute() {
            return { prepared: built.sql, params: built.params, name, fields };
          },
        };
      },
    } as any,
  };
}

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
});

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

  await assert.rejects(
    async () => relational.findMany({ with: {} as any }).execute(),
    /YDB relational query `with` is not supported yet/,
  );
  await assert.rejects(
    async () => relational.findMany({ extras: {} as any }).execute(),
    /YDB relational query `extras` is not supported yet/,
  );
  assert.throws(
    () => relational.findMany({ limit: "1" as any }).getSQL(),
    /limit placeholders are not supported yet/,
  );
  assert.throws(
    () => relational.findMany({ offset: "2" as any }).getSQL(),
    /offset placeholders are not supported yet/,
  );
});
