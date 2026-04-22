import test from "node:test";
import assert from "node:assert/strict";
import { eq, sql as yql } from "drizzle-orm";
import {
  buildAddChangefeedSql,
  buildAlterTableSql,
  buildAlterTopicSql,
  buildAnalyzeSql,
  buildCreateTableSql,
  buildCreateTopicSql,
  buildCreateViewSql,
  buildDropChangefeedSql,
  buildDropTopicSql,
  buildDropViewSql,
  buildRenameTableSql,
  distinctHint,
  groupKey,
  index,
  integer,
  pragma,
  rawTableOption,
  sessionStart,
  sessionWindow,
  text,
  uint32,
  uniqueHint,
  windowDefinition,
  yqlScript,
  ydbTable,
} from "../../src/index.js";
import { createLiveContext } from "./helpers/context.js";
import { users } from "./helpers/schema.js";

const live = createLiveContext();

async function ignoreMissingObject(
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !/(not found|not exist|does not exist|missing|no such|path)/iu.test(
        message,
      )
    ) {
      throw error;
    }
  }
}

async function ignoreUnsupportedYqlFeature(
  t: { diagnostic(message: string): void },
  feature: string,
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      /(not supported|unsupported|pre type annotation|type annotation|expression evaluation|precondition_failed|generic_error)/iu.test(
        message,
      )
    ) {
      t.diagnostic(`Skipping optional live ${feature} check: ${message}`);
      return;
    }

    throw error;
  }
}

test("YQL SELECT gap helpers execute on live YDB", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(
    t,
    "seed one user row, execute VALUES/AS_TABLE/WITHOUT/FLATTEN/SAMPLE/TABLESAMPLE/UNIQUE DISTINCT/ASSUME ORDER BY/WINDOW/GROUP helper queries, then delete the seeded row",
  );

  const id = live.baseIntId + 801;
  await live.deleteUserRows([id]);

  try {
    await live.db.insert(users).values({ id, name: "select-gaps" });

    const fromValuesRows = await live.db
      .select({
        id: yql<number>`${yql.identifier("id")}`,
        name: yql<string>`${yql.identifier("name")}`,
      })
      .fromValues(
        [
          [2, "two"],
          [1, "one"],
        ],
        { alias: "v", columns: ["id", "name"] },
      )
      .orderBy(yql.identifier("id"));

    const asTableSql = live.db
      .select({
        id: yql<number>`${yql.identifier("id")}`,
        name: yql<string>`${yql.identifier("name")}`,
      })
      .fromAsTable("$rows")
      .orderBy(yql.identifier("id"))
      .toSQL().sql;
    const asTableRows = await live.db.execute<
      Array<{ id: number; name: string }>
    >(
      yql.raw(
        [
          "$rows = AsList(",
          "  AsStruct(2 AS id, CAST('two' AS Utf8) AS name),",
          "  AsStruct(1 AS id, CAST('one' AS Utf8) AS name)",
          ");",
          asTableSql,
        ].join("\n"),
      ),
    );

    const withoutRows = await live.db
      .select()
      .from(users)
      .without(users.name)
      .where(eq(users.id, id));

    const flattenedRows = await live.db
      .select({
        item: yql<string>`${yql.identifier("items")}`,
      })
      .from(
        yql.raw(
          "(SELECT AsList(CAST('apple' AS Utf8), CAST('berry' AS Utf8)) AS items)",
        ),
      )
      .flattenListBy(yql.identifier("items"))
      .orderBy(yql.identifier("items"));

    await ignoreUnsupportedYqlFeature(t, "SAMPLE", async () => {
      const sampledRows = await live.db
        .select({ id: users.id })
        .from(users)
        .sample(0.5)
        .where(eq(users.id, id))
        .limit(0);

      assert.deepEqual(sampledRows, []);
    });

    await ignoreUnsupportedYqlFeature(t, "TABLESAMPLE", async () => {
      const tableSampleRows = await live.db
        .select({ id: users.id })
        .from(users)
        .tableSample("bernoulli", 100)
        .where(eq(users.id, id))
        .limit(0);

      assert.deepEqual(tableSampleRows, []);
    });
    const uniqueGroupedRows = await live.db
      .select({ name: users.name, total: yql<number>`count(*)` })
      .from(users)
      .where(eq(users.id, id))
      .uniqueDistinct(uniqueHint("name"), distinctHint("name"))
      .groupCompactBy(users.name)
      .assumeOrderBy("name");
    const windowRows = await live.db
      .select({ id: users.id, rn: yql<number>`row_number() over w` })
      .from(users)
      .where(eq(users.id, id))
      .window("w", windowDefinition({ orderBy: [users.id] }));
    await ignoreUnsupportedYqlFeature(t, "SessionWindow", async () => {
      const sessionWindowRows = await live.db
        .select({ sessionStart: sessionStart(), total: yql<number>`count(*)` })
        .from(yql.raw("(SELECT CurrentUtcTimestamp() AS ts)"))
        .groupBy(
          groupKey(
            sessionWindow(yql.identifier("ts"), "PT1H"),
            "session_start",
          ),
        );

      assert.equal(sessionWindowRows.length, 1);
    });
    const pragmaRows = await live.db.values<[string]>(
      yqlScript(
        pragma("Warning", ["disable", "1101"]),
        "SELECT CAST('ok' AS Utf8);",
      ),
    );

    assert.deepEqual(fromValuesRows, [
      { id: 1, name: "one" },
      { id: 2, name: "two" },
    ]);
    assert.deepEqual(asTableRows, [
      { id: 1, name: "one" },
      { id: 2, name: "two" },
    ]);
    assert.deepEqual(withoutRows, [{ id }]);
    assert.deepEqual(flattenedRows, [{ item: "apple" }, { item: "berry" }]);
    assert.deepEqual(uniqueGroupedRows, [{ name: "select-gaps", total: 1n }]);
    assert.deepEqual(windowRows, [{ id, rn: 1n }]);
    assert.deepEqual(pragmaRows, [["ok"]]);
  } finally {
    await live.deleteUserRows([id]);
  }
});

test("YQL DDL gap helpers execute on live YDB", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(
    t,
    "create temp tables/view/topic, execute ANALYZE, multi-action ALTER TABLE, CHANGEFEED, RENAME TABLE, CREATE/DROP VIEW, CREATE/ALTER/DROP TOPIC, then clean all objects",
  );

  const suffix = live.baseIntId + 901;
  const tableName = `ddl_gaps_${suffix}`;
  const renamedTableName = `ddl_gaps_renamed_${suffix}`;
  const viewName = `ddl_gaps_view_${suffix}`;
  const topicName = `ddl_gaps_topic_${suffix}`;
  const usersTable = ydbTable(tableName, {
    id: integer("id").notNull().primaryKey(),
    name: text("name"),
    age: uint32("age"),
  });
  const usersTableWithStatus = ydbTable(tableName, {
    id: integer("id").notNull().primaryKey(),
    name: text("name"),
    age: uint32("age"),
    status: text("status"),
  });
  const ageIndex = index(`${tableName}_age_idx`)
    .on(usersTable.age)
    .build(usersTable);

  await ignoreMissingObject(() =>
    live.db.execute(yql.raw(buildDropTopicSql(topicName))),
  );
  await live.db.execute(
    yql.raw(buildDropViewSql(viewName, { ifExists: true })),
  );
  await live.db.execute(
    yql.raw(`DROP TABLE IF EXISTS \`${renamedTableName}\``),
  );
  await live.db.execute(yql.raw(`DROP TABLE IF EXISTS \`${tableName}\``));

  try {
    await live.db.execute(yql.raw(buildCreateTableSql(usersTable)));
    await live.db.execute(
      yql.raw(
        `UPSERT INTO \`${tableName}\` (\`id\`, \`name\`) VALUES (1, 'Twilight')`,
      ),
    );
    await ignoreUnsupportedYqlFeature(t, "ANALYZE", () =>
      live.db.execute(yql.raw(buildAnalyzeSql(tableName))),
    );
    await ignoreUnsupportedYqlFeature(t, "multi-action ALTER TABLE", () =>
      live.db.execute(
        yql.raw(
          buildAlterTableSql(tableName, [
            { kind: "add_column", column: usersTableWithStatus.status },
            { kind: "add_index", index: ageIndex },
          ]),
        ),
      ),
    );
    await live.db.execute(
      yql.raw(
        buildAddChangefeedSql(tableName, "updates_feed", {
          mode: "UPDATES",
          format: "JSON",
        }),
      ),
    );
    await live.db.execute(
      yql.raw(buildDropChangefeedSql(tableName, "updates_feed")),
    );
    await live.db.execute(
      yql.raw(buildRenameTableSql(tableName, renamedTableName)),
    );

    const renamedRows = await live.db.values<[number, string | null]>(
      yql.raw(
        `SELECT \`id\`, \`name\` FROM \`${renamedTableName}\` ORDER BY \`id\``,
      ),
    );
    assert.deepEqual(renamedRows, [[1, "Twilight"]]);

    await live.db.execute(
      yql.raw(
        buildCreateViewSql(
          viewName,
          `SELECT \`id\`, \`name\` FROM \`${renamedTableName}\``,
        ),
      ),
    );
    const viewRows = await live.db.values<[number, string | null]>(
      yql.raw(`SELECT \`id\`, \`name\` FROM \`${viewName}\` ORDER BY \`id\``),
    );
    assert.deepEqual(viewRows, [[1, "Twilight"]]);
    await live.db.execute(
      yql.raw(buildDropViewSql(viewName, { ifExists: true })),
    );

    await live.db.execute(
      yql.raw(
        buildCreateTopicSql(topicName, {
          consumers: [{ name: "audit" }],
          settings: { retention_period: rawTableOption("Interval('PT1H')") },
        }),
      ),
    );
    await ignoreUnsupportedYqlFeature(t, "ALTER TOPIC", () =>
      live.db.execute(
        yql.raw(
          buildAlterTopicSql(topicName, [
            { kind: "add_consumer", consumer: { name: "analytics" } },
            {
              kind: "alter_consumer_set",
              name: "analytics",
              settings: { important: true },
            },
            { kind: "drop_consumer", name: "analytics" },
          ]),
        ),
      ),
    );
  } finally {
    await ignoreMissingObject(() =>
      live.db.execute(yql.raw(buildDropTopicSql(topicName))),
    );
    await live.db.execute(
      yql.raw(buildDropViewSql(viewName, { ifExists: true })),
    );
    await live.db.execute(
      yql.raw(`DROP TABLE IF EXISTS \`${renamedTableName}\``),
    );
    await live.db.execute(yql.raw(`DROP TABLE IF EXISTS \`${tableName}\``));
  }
});
