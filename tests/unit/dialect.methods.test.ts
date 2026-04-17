import test from "node:test";
import assert from "node:assert/strict";
import { aliasedTable } from "drizzle-orm/alias";
import { createTableRelationsHelpers, extractTablesRelationalConfig } from "drizzle-orm/relations";
import { eq, sql as yql } from "drizzle-orm";
import { WithSubquery } from "drizzle-orm/subquery";
import {
  date,
  datetime,
  decimal,
  json,
  text,
  timestamp,
  uuid,
  YdbDialect,
  ydbTable,
} from "../../src/index.js";
import { YdbSelectBuilder } from "../../src/ydb-core/query-builders/index.js";
import { orderSelectedFields } from "../../src/ydb-core/result-mapping.js";
import { posts, session, users } from "../helpers/unit-basic.js";

const dialect = new YdbDialect();

const typedTable = ydbTable("typed_values", {
  name: text("name"),
  dateValue: date("date_value"),
  datetimeValue: datetime("datetime_value"),
  timestampValue: timestamp("timestamp_value"),
  jsonValue: json("json_value"),
  uuidValue: uuid("uuid_value"),
  decimalValue: decimal("decimal_value", 22, 9),
});

test("prepareTyping maps YDB column encoders to Drizzle typings", () => {
  assert.equal(dialect.prepareTyping(), "none");
  assert.equal(dialect.prepareTyping(typedTable.name), "none");
  assert.equal(dialect.prepareTyping(typedTable.dateValue), "date");
  assert.equal(dialect.prepareTyping(typedTable.datetimeValue), "timestamp");
  assert.equal(dialect.prepareTyping(typedTable.timestampValue), "timestamp");
  assert.equal(dialect.prepareTyping(typedTable.jsonValue), "json");
  assert.equal(dialect.prepareTyping(typedTable.uuidValue), "uuid");
  assert.equal(dialect.prepareTyping(typedTable.decimalValue), "decimal");
});

test("direct dialect fragment helpers build selection, table, join and tail clauses", () => {
  const aliasedUsers = aliasedTable(users, "u");
  const fields = orderSelectedFields({ userId: users.id, postTitle: posts.title });
  const selectionAliases = ["user_id_alias", "post_title_alias"];
  const mappedOrderBy = dialect.mapExpressionsToSelectionAliases(
    [users.id, yql`${posts.title} desc`],
    fields,
    selectionAliases,
    "orderBy()",
  );

  const built = dialect.sqlToQuery(yql`select ${
    dialect.buildSelection(fields, selectionAliases)
  } from ${
    dialect.buildFromTable(users)
  }${
    dialect.buildJoins([{ table: posts, joinType: "left", on: eq(users.id, posts.userId) }])
  }${
    dialect.buildOrderBy(mappedOrderBy)
  }${
    dialect.buildLimit(3)
  }${
    dialect.buildOffset(2)
  }`);

  assert.equal(
    built.sql,
    "select `users`.`id` as `user_id_alias`, `posts`.`title` as `post_title_alias` from `users` left join `posts` on `users`.`id` = `posts`.`user_id` order by `user_id_alias`, `post_title_alias` desc limit $p0 offset $p1",
  );
  assert.deepEqual(built.params, [3, 2]);

  assert.equal(
    dialect.sqlToQuery(yql`${dialect.buildFromTable(aliasedUsers)}`).sql,
    "`users` `u`",
  );
  assert.equal(
    dialect.sqlToQuery(yql`${dialect.buildOrderBy(mappedOrderBy)}`).sql,
    " order by `user_id_alias`, `post_title_alias` desc",
  );

  assert.throws(
    () => dialect.mapExpressionsToSelectionAliases([posts.userId], fields, selectionAliases, "orderBy()"),
    /can only reference selected fields/,
  );
});

test("direct dialect set-operation helpers build single and chained set queries", () => {
  const leftSelectBuilder = new YdbSelectBuilder(session, { value: users.name })
    .from(users)
    .where(eq(users.id, 1));
  const rightUnionBuilder = new YdbSelectBuilder(session, { value: posts.title })
    .from(posts)
    .where(eq(posts.userId, 1));
  const rightExceptBuilder = new YdbSelectBuilder(session, { value: users.name })
    .from(users)
    .where(eq(users.id, 2));

  const fields = orderSelectedFields(leftSelectBuilder.getSelectedFields());
  const selectionAliases = dialect.getSelectionAliases(fields);
  const leftSelect = leftSelectBuilder.getSQL(selectionAliases);

  const single = dialect.sqlToQuery(dialect.buildSetOperationQuery(leftSelect, fields, selectionAliases, {
    type: "union",
    isAll: true,
    rightSelect: rightUnionBuilder,
    orderBy: [users.name],
    limit: 2,
    offset: 1,
  }));

  assert.equal(
    single.sql,
    "select `users`.`name` as `__ydb_f0` from `users` where `users`.`id` = $p0 union all select `posts`.`title` as `__ydb_f0` from `posts` where `posts`.`user_id` = $p1 order by `__ydb_f0` limit $p2 offset $p3",
  );
  assert.deepEqual(single.params, [1, 1, 2, 1]);

  const chained = dialect.sqlToQuery(dialect.buildSetOperations(leftSelect, fields, selectionAliases, [
    {
      type: "union",
      isAll: true,
      rightSelect: rightUnionBuilder,
    },
    {
      type: "except",
      isAll: false,
      rightSelect: rightExceptBuilder,
    },
  ]));

  assert.equal(
    chained.sql,
    "select distinct `__ydb_left`.`__ydb_f0` as `__ydb_f0` from (select `users`.`name` as `__ydb_f0` from `users` where `users`.`id` = $p0 union all select `posts`.`title` as `__ydb_f0` from `posts` where `posts`.`user_id` = $p1) as `__ydb_left` left join (select `__ydb_right_input`.`__ydb_f0` as `__ydb_f0`, 1 as `__ydb_match` from (select `users`.`name` as `__ydb_f0` from `users` where `users`.`id` = $p2) as `__ydb_right_input`) as `__ydb_right` on (`__ydb_left`.`__ydb_f0` = `__ydb_right`.`__ydb_f0` or (`__ydb_left`.`__ydb_f0` is null and `__ydb_right`.`__ydb_f0` is null)) where `__ydb_right`.`__ydb_match` is null",
  );
  assert.deepEqual(chained.params, [1, 1, 2]);
});

test("buildWithCTE, buildInsertQuery, buildUpdateSet, buildUpdateQuery and buildDeleteQuery", () => {
  const ponyCte = new WithSubquery(
    yql`select ${1} as ${yql.identifier("id")}`,
    { id: users.id } as any,
    "pony_cte",
  );
  const withQuery = dialect.sqlToQuery(yql`${dialect.buildWithCTE([ponyCte])}select * from ${yql.identifier("pony_cte")}`);

  assert.equal(withQuery.sql, "with `pony_cte` as (select $p0 as `id`) select * from `pony_cte`");
  assert.deepEqual(withQuery.params, [1]);

  const insertQuery = dialect.sqlToQuery(dialect.buildInsertQuery({
    table: users,
    values: [{ id: 1, name: "Twilight Sparkle" }],
  }));
  assert.equal(
    insertQuery.sql,
    "insert into `users` (`id`, `name`, `created_at`, `updated_at`) values ($p0, $p1, $p2, $p3)",
  );
  assert.deepEqual(insertQuery.params, [1, "Twilight Sparkle", 100, 200]);

  const insertSelectQuery = dialect.sqlToQuery(dialect.buildInsertQuery({
    table: users,
    select: true,
    values: yql`select ${2}, ${"Pinkie Pie"}, ${100}, ${200}`,
  }));
  assert.equal(
    insertSelectQuery.sql,
    "insert into `users` (`id`, `name`, `created_at`, `updated_at`) select $p0, $p1, $p2, $p3",
  );
  assert.deepEqual(insertSelectQuery.params, [2, "Pinkie Pie", 100, 200]);

  const upsertReturningQuery = dialect.sqlToQuery(dialect.buildInsertQuery({
    table: users,
    command: "upsert",
    values: [{ id: 3, name: "Rarity" }],
    returning: orderSelectedFields({ id: users.id, name: users.name }),
  }));
  assert.equal(
    upsertReturningQuery.sql,
    "upsert into `users` (`id`, `name`, `created_at`, `updated_at`) values ($p0, $p1, $p2, $p3) returning `id`, `name`",
  );
  assert.deepEqual(upsertReturningQuery.params, [3, "Rarity", 100, 200]);

  const setQuery = dialect.sqlToQuery(yql`${dialect.buildUpdateSet(users, { name: "Fluttershy" })}`);
  assert.equal(setQuery.sql, "`name` = $p0, `updated_at` = $p1");
  assert.deepEqual(setQuery.params, ["Fluttershy", 200]);

  const updateQuery = dialect.sqlToQuery(dialect.buildUpdateQuery({
    table: users,
    set: { name: "Fluttershy" },
    where: eq(users.id, 5),
  }));
  assert.equal(
    updateQuery.sql,
    "update `users` set `name` = $p0, `updated_at` = $p1 where `users`.`id` = $p2",
  );
  assert.deepEqual(updateQuery.params, ["Fluttershy", 200, 5]);

  const updateReturningQuery = dialect.sqlToQuery(dialect.buildUpdateQuery({
    table: users,
    set: { name: "Fluttershy" },
    where: eq(users.id, 5),
    returning: orderSelectedFields({ id: users.id, name: users.name }),
  }));
  assert.equal(
    updateReturningQuery.sql,
    "update `users` set `name` = $p0, `updated_at` = $p1 where `users`.`id` = $p2 returning `id`, `name`",
  );
  assert.deepEqual(updateReturningQuery.params, ["Fluttershy", 200, 5]);

  const updateOnQuery = dialect.sqlToQuery(dialect.buildUpdateQuery({
    table: users,
    on: yql`select ${1} as ${yql.identifier("id")}, ${"Twilight"} as ${yql.identifier("name")}`,
  }));
  assert.equal(
    updateOnQuery.sql,
    "update `users` on select $p0 as `id`, $p1 as `name`",
  );
  assert.deepEqual(updateOnQuery.params, [1, "Twilight"]);

  const deleteQuery = dialect.sqlToQuery(dialect.buildDeleteQuery({
    table: users,
    where: eq(users.id, 7),
  }));
  assert.equal(deleteQuery.sql, "delete from `users` where `users`.`id` = $p0");
  assert.deepEqual(deleteQuery.params, [7]);

  const deleteReturningQuery = dialect.sqlToQuery(dialect.buildDeleteQuery({
    table: users,
    where: eq(users.id, 7),
    returning: orderSelectedFields({ id: users.id, name: users.name }),
  }));
  assert.equal(
    deleteReturningQuery.sql,
    "delete from `users` where `users`.`id` = $p0 returning `id`, `name`",
  );
  assert.deepEqual(deleteReturningQuery.params, [7]);

  const deleteOnQuery = dialect.sqlToQuery(dialect.buildDeleteQuery({
    table: users,
    on: yql`select ${1} as ${yql.identifier("id")}`,
  }));
  assert.equal(
    deleteOnQuery.sql,
    "delete from `users` on select $p0 as `id`",
  );
  assert.deepEqual(deleteOnQuery.params, [1]);
});

test("buildRelationalQueryWithoutPK builds flat schema-aware queries", () => {
  const schema = { users };
  const tablesConfig = extractTablesRelationalConfig(schema, createTableRelationsHelpers);
  const relationalQuery = dialect.buildRelationalQueryWithoutPK({
    fullSchema: schema,
    schema: tablesConfig.tables as any,
    tableNamesMap: tablesConfig.tableNamesMap,
    table: users,
    tableConfig: (tablesConfig.tables as any).users,
    queryConfig: {
      columns: { id: true, name: true },
      where: (fields, operators) => operators.eq(fields["id"], 7),
      orderBy: (fields, operators) => operators.desc(fields["id"]),
      limit: 1,
      offset: 2,
    },
    tableAlias: "users_rel",
  });

  const query = dialect.sqlToQuery(relationalQuery.sql as any);

  assert.equal(
    query.sql,
    "select `users_rel`.`id`, `users_rel`.`name` from `users` `users_rel` where `users_rel`.`id` = $p0 order by `users_rel`.`id` desc limit $p1 offset $p2",
  );
  assert.deepEqual(query.params, [7, 1, 2]);
  assert.deepEqual(
    relationalQuery.selection.map(({ tsKey, dbKey }) => ({ tsKey, dbKey })),
    [
      { tsKey: "id", dbKey: "id" },
      { tsKey: "name", dbKey: "name" },
    ],
  );
});

test("dialect.migrate bootstraps bookkeeping, skips applied hashes and records migration names", async () => {
  const calls: string[] = [];
  const rows: Array<[string, number, string]> = [["hash_1", 1, "0001_existing"]];

  const session = {
    async execute(query: any) {
      const built = dialect.sqlToQuery(query);
      calls.push(built.sql);

      const upsertMatch = built.sql.match(/UPSERT INTO .* VALUES \('([^']+)', ([0-9]+), '([^']+)'\)$/u);
      if (upsertMatch) {
        rows.unshift([upsertMatch[1]!, Number(upsertMatch[2]), upsertMatch[3]!]);
      }

      return { rows: [] };
    },
    async values(query: any) {
      const built = dialect.sqlToQuery(query);
      calls.push(built.sql);
      return rows.map((row) => [...row]);
    },
  };

  await dialect.migrate([
    {
      name: "0001_existing",
      folderMillis: 1,
      hash: "hash_1",
      bps: false,
      sql: ["select 1"],
    },
    {
      name: "0002_new",
      folderMillis: 2,
      hash: "hash_2",
      bps: false,
      sql: ["select 2", ""],
    },
  ], session as any, { migrationsTable: "__dialect_migrations" });

  assert.ok(calls[0]?.startsWith("CREATE TABLE IF NOT EXISTS `__dialect_migrations`"));
  assert.ok(calls.some((call) => call === "SELECT `hash`, `created_at`, `name` FROM `__dialect_migrations` ORDER BY `created_at` DESC"));
  assert.ok(!calls.includes("select 1"));
  assert.ok(calls.includes("select 2"));
  assert.ok(calls.some((call) => call.endsWith("VALUES ('hash_2', 2, '0002_new')")));
  assert.deepEqual(rows[0], ["hash_2", 2, "0002_new"]);
});
