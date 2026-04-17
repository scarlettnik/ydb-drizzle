import test from "node:test";
import assert from "node:assert/strict";
import { desc, eq, sql as yql } from "drizzle-orm";
import { except, indexView, intersect, unionAll } from "../../src/index.js";
import { YdbSelectBuilder } from "../../src/ydb-core/query-builders/index.js";
import { dialect, posts, session, users } from "../helpers/unit-basic.js";

function toQuery(builder: { getSQL(): any }) {
  return dialect.sqlToQuery(builder.getSQL());
}

test("select sql", () => {
  const query = toQuery(new YdbSelectBuilder(session).from(users).where(eq(users.id, 7)));

  assert.equal(
    query.sql,
    "select `users`.`id`, `users`.`name`, `users`.`created_at`, `users`.`updated_at` from `users` where `users`.`id` = $p0",
  );
  assert.deepEqual(query.params, [7]);
});

test("select without from sql", () => {
  const query = toQuery(new YdbSelectBuilder(session, { value: yql<number>`${1}` }));

  assert.equal(query.sql, "select $p0");
  assert.deepEqual(query.params, [1]);
});

test("select advanced clauses sql", () => {
  const query = toQuery(
    new YdbSelectBuilder(session)
      .from(users)
      .distinct()
      .groupBy(users.id, users.name, users.createdAt, users.updatedAt)
      .having(yql`count(*) > ${1}`)
      .orderBy(desc(users.name), users.id)
      .limit(5)
      .offset(2),
  );

  assert.equal(
    query.sql,
    "select distinct `users`.`id`, `users`.`name`, `users`.`created_at`, `users`.`updated_at` from `users` group by `users`.`id`, `users`.`name`, `users`.`created_at`, `users`.`updated_at` having count(*) > $p0 order by `users`.`name` desc, `users`.`id` limit $p1 offset $p2",
  );
  assert.deepEqual(query.params, [1, 5, 2]);
});

test("join sql", () => {
  const leftJoinQuery = toQuery(
    new YdbSelectBuilder(session, { userId: users.id, postId: posts.id })
      .from(users)
      .leftJoin(posts, eq(users.id, posts.userId))
      .orderBy(users.id, posts.id),
  );
  const innerJoinQuery = toQuery(
    new YdbSelectBuilder(session, { userId: users.id, postId: posts.id })
      .from(users)
      .innerJoin(posts, eq(users.id, posts.userId)),
  );
  const rightJoinQuery = toQuery(
    new YdbSelectBuilder(session, { userId: users.id, postId: posts.id })
      .from(users)
      .rightJoin(posts, eq(users.id, posts.userId)),
  );
  const fullJoinQuery = toQuery(
    new YdbSelectBuilder(session, { userId: users.id, postId: posts.id })
      .from(users)
      .fullJoin(posts, eq(users.id, posts.userId)),
  );
  const crossJoinQuery = toQuery(
    new YdbSelectBuilder(session, { userId: users.id, postId: posts.id })
      .from(users)
      .crossJoin(posts),
  );
  const leftSemiJoinQuery = toQuery(
    new YdbSelectBuilder(session, { userId: users.id })
      .from(users)
      .leftSemiJoin(posts, eq(users.id, posts.userId)),
  );
  const rightOnlyJoinQuery = toQuery(
    new YdbSelectBuilder(session, { userId: users.id })
      .from(users)
      .rightOnlyJoin(posts, eq(users.id, posts.userId)),
  );
  const exclusionJoinQuery = toQuery(
    new YdbSelectBuilder(session, { userId: users.id })
      .from(users)
      .exclusionJoin(posts, eq(users.id, posts.userId)),
  );

  assert.equal(
    leftJoinQuery.sql,
    "select `users`.`id` as `__ydb_f0`, `posts`.`id` as `__ydb_f1` from `users` left join `posts` on `users`.`id` = `posts`.`user_id` order by `users`.`id`, `posts`.`id`",
  );
  assert.equal(
    innerJoinQuery.sql,
    "select `users`.`id` as `__ydb_f0`, `posts`.`id` as `__ydb_f1` from `users` inner join `posts` on `users`.`id` = `posts`.`user_id`",
  );
  assert.equal(
    rightJoinQuery.sql,
    "select `users`.`id` as `__ydb_f0`, `posts`.`id` as `__ydb_f1` from `users` right join `posts` on `users`.`id` = `posts`.`user_id`",
  );
  assert.equal(
    fullJoinQuery.sql,
    "select `users`.`id` as `__ydb_f0`, `posts`.`id` as `__ydb_f1` from `users` full join `posts` on `users`.`id` = `posts`.`user_id`",
  );
  assert.equal(
    crossJoinQuery.sql,
    "select `users`.`id` as `__ydb_f0`, `posts`.`id` as `__ydb_f1` from `users` cross join `posts`",
  );
  assert.equal(
    leftSemiJoinQuery.sql,
    "select `users`.`id` as `__ydb_f0` from `users` left semi join `posts` on `users`.`id` = `posts`.`user_id`",
  );
  assert.equal(
    rightOnlyJoinQuery.sql,
    "select `users`.`id` as `__ydb_f0` from `users` right only join `posts` on `users`.`id` = `posts`.`user_id`",
  );
  assert.equal(
    exclusionJoinQuery.sql,
    "select `users`.`id` as `__ydb_f0` from `users` exclusion join `posts` on `users`.`id` = `posts`.`user_id`",
  );
});

test("index view table source sql", () => {
  const query = toQuery(
    new YdbSelectBuilder(session, { id: yql`${yql.identifier("u")}.${yql.identifier("id")}` })
      .from(indexView(users, "users_name_idx", "u")),
  );

  assert.equal(
    query.sql,
    "select `u`.`id` from `users` view `users_name_idx` as `u`",
  );
});

test("distinctOn and set operators sql", () => {
  const distinctOnQuery = toQuery(
    new YdbSelectBuilder(session, { userId: posts.userId, title: posts.title })
      .from(posts)
      .distinctOn(posts.userId)
      .orderBy(posts.userId, desc(posts.title)),
  );
  const variadicDistinctOnQuery = toQuery(
    new YdbSelectBuilder(session, { userId: posts.userId, title: posts.title })
      .from(posts)
      .distinctOn(posts.userId, posts.title),
  );

  const unionQuery = toQuery(
    unionAll(
      new YdbSelectBuilder(session, { value: users.name }).from(users).where(eq(users.id, 1)),
      new YdbSelectBuilder(session, { value: posts.title }).from(posts).where(eq(posts.userId, 1)),
    )
      .orderBy((fields: { value: unknown }) => fields.value as any)
      .limit(3),
  );

  const intersectQuery = toQuery(
    intersect(
      new YdbSelectBuilder(session, { value: users.name }).from(users).where(eq(users.id, 1)),
      new YdbSelectBuilder(session, { value: posts.title }).from(posts).where(eq(posts.userId, 1)),
    ),
  );

  const exceptQuery = toQuery(
    except(
      new YdbSelectBuilder(session, { value: users.name }).from(users).where(eq(users.id, 1)),
      new YdbSelectBuilder(session, { value: posts.title }).from(posts).where(eq(posts.userId, 1)),
    ),
  );

  assert.match(
    distinctOnQuery.sql,
    /^select `__ydb_f0`, `__ydb_f1` from \(select `posts`\.`user_id` as `__ydb_f0`, `posts`\.`title` as `__ydb_f1`, row_number\(\) over \(\s+partition by `posts`\.`user_id`\s+ order by `posts`\.`user_id`, `posts`\.`title` desc\s+\) as `__ydb_row_number` from `posts`\) as `__ydb_distinct_on` where `__ydb_distinct_on`\.`__ydb_row_number` = 1 order by `__ydb_f0`, `__ydb_f1` desc$/,
  );
  assert.ok(variadicDistinctOnQuery.sql.includes("partition by `posts`.`user_id`, `posts`.`title`"));
  assert.equal(
    unionQuery.sql,
    "select `users`.`name` as `__ydb_f0` from `users` where `users`.`id` = $p0 union all select `posts`.`title` as `__ydb_f0` from `posts` where `posts`.`user_id` = $p1 order by `__ydb_f0` limit $p2",
  );
  assert.equal(
    intersectQuery.sql,
    "select distinct `__ydb_left`.`__ydb_f0` as `__ydb_f0` from (select `users`.`name` as `__ydb_f0` from `users` where `users`.`id` = $p0) as `__ydb_left` inner join (select `__ydb_right_input`.`__ydb_f0` as `__ydb_f0`, 1 as `__ydb_match` from (select `posts`.`title` as `__ydb_f0` from `posts` where `posts`.`user_id` = $p1) as `__ydb_right_input`) as `__ydb_right` on (`__ydb_left`.`__ydb_f0` = `__ydb_right`.`__ydb_f0` or (`__ydb_left`.`__ydb_f0` is null and `__ydb_right`.`__ydb_f0` is null))",
  );
  assert.equal(
    exceptQuery.sql,
    "select distinct `__ydb_left`.`__ydb_f0` as `__ydb_f0` from (select `users`.`name` as `__ydb_f0` from `users` where `users`.`id` = $p0) as `__ydb_left` left join (select `__ydb_right_input`.`__ydb_f0` as `__ydb_f0`, 1 as `__ydb_match` from (select `posts`.`title` as `__ydb_f0` from `posts` where `posts`.`user_id` = $p1) as `__ydb_right_input`) as `__ydb_right` on (`__ydb_left`.`__ydb_f0` = `__ydb_right`.`__ydb_f0` or (`__ydb_left`.`__ydb_f0` is null and `__ydb_right`.`__ydb_f0` is null)) where `__ydb_right`.`__ydb_match` is null",
  );
  assert.deepEqual(unionQuery.params, [1, 1, 3]);
  assert.deepEqual(intersectQuery.params, [1, 1]);
  assert.deepEqual(exceptQuery.params, [1, 1]);
});
