import test from "node:test";
import assert from "node:assert/strict";
import {
  bigint,
  boolean,
  bytes,
  customType,
  date,
  datetime,
  decimal,
  double,
  float,
  integer,
  interval,
  json,
  jsonDocument,
  text,
  timestamp,
  uint32,
  uint64,
  uuid,
  ydbTable,
  yson,
} from "../../src/index.js";
import { YdbDialect } from "../../src/index.js";
import { YdbInsertBuilder } from "../../src/ydb-core/query-builders/index.js";
import { YdbSelectBuilder } from "../../src/ydb-core/query-builders/index.js";
import { YdbSession } from "../../src/index.js";
import {
  Bool,
  Date as YdbDate,
  Datetime as YdbDatetime,
  Double as YdbDouble,
  Float as YdbFloat,
  Int64 as YdbInt64,
  Interval as YdbInterval,
  Json as YdbJson,
  JsonDocument as YdbJsonDocument,
  Timestamp as YdbTimestamp,
  Uint32 as YdbUint32,
  Uint64 as YdbUint64,
  Uuid as YdbUuid,
  Yson as YdbYson,
} from "@ydbjs/value/primitive";
import { sql, type SQL } from "drizzle-orm/sql/sql";

const dialect = new YdbDialect();
const session = {} as any;

const typesTable = ydbTable("column_types", {
  id: integer("id").notNull(),
  flag: boolean("flag"),
  signed64: bigint("signed64"),
  u32: uint32("u32"),
  u64: uint64("u64"),
  f32: float("f32"),
  f64: double("f64"),
  bytesValue: bytes("bytes_value"),
  dateValue: date("date_value"),
  datetimeValue: datetime("datetime_value"),
  timestampValue: timestamp("timestamp_value"),
  intervalValue: interval("interval_value"),
  jsonValue: json("json_value"),
  jsonDocumentValue: jsonDocument("json_document_value"),
  uuidValue: uuid("uuid_value"),
  ysonValue: yson("yson_value"),
  decimalValue: decimal("decimal_value", 22, 9),
  name: text("name"),
});

function toQuery(builder: { getSQL(): any }) {
  return dialect.sqlToQuery(builder.getSQL());
}

function typeRow(values: {
  id?: unknown;
  flag?: unknown;
  signed64?: unknown;
  u32?: unknown;
  u64?: unknown;
  f32?: unknown;
  f64?: unknown;
  bytesValue?: unknown;
  dateValue?: unknown;
  datetimeValue?: unknown;
  timestampValue?: unknown;
  intervalValue?: unknown;
  jsonValue?: unknown;
  jsonDocumentValue?: unknown;
  uuidValue?: unknown;
  ysonValue?: unknown;
  decimalValue?: unknown;
  name?: unknown;
}) {
  return [
    values.id ?? null,
    values.flag ?? null,
    values.signed64 ?? null,
    values.u32 ?? null,
    values.u64 ?? null,
    values.f32 ?? null,
    values.f64 ?? null,
    values.bytesValue ?? null,
    values.dateValue ?? null,
    values.datetimeValue ?? null,
    values.timestampValue ?? null,
    values.intervalValue ?? null,
    values.jsonValue ?? null,
    values.jsonDocumentValue ?? null,
    values.uuidValue ?? null,
    values.ysonValue ?? null,
    values.decimalValue ?? null,
    values.name ?? null,
  ];
}

test("sql types", () => {
  assert.equal(typesTable.id.getSQLType(), "Int32");
  assert.equal(typesTable.flag.getSQLType(), "Bool");
  assert.equal(typesTable.signed64.getSQLType(), "Int64");
  assert.equal(typesTable.u32.getSQLType(), "Uint32");
  assert.equal(typesTable.u64.getSQLType(), "Uint64");
  assert.equal(typesTable.f32.getSQLType(), "Float");
  assert.equal(typesTable.f64.getSQLType(), "Double");
  assert.equal(typesTable.bytesValue.getSQLType(), "String");
  assert.equal(typesTable.dateValue.getSQLType(), "Date");
  assert.equal(typesTable.datetimeValue.getSQLType(), "Datetime");
  assert.equal(typesTable.timestampValue.getSQLType(), "Timestamp");
  assert.equal(typesTable.intervalValue.getSQLType(), "Interval");
  assert.equal(typesTable.jsonValue.getSQLType(), "Json");
  assert.equal(typesTable.jsonDocumentValue.getSQLType(), "JsonDocument");
  assert.equal(typesTable.uuidValue.getSQLType(), "Uuid");
  assert.equal(typesTable.ysonValue.getSQLType(), "Yson");
  assert.equal(typesTable.decimalValue.getSQLType(), "Decimal(22, 9)");
  assert.equal(typesTable.name.getSQLType(), "Utf8");
});

test("insert codecs", () => {
  const now = new Date();
  const rowDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rowDatetime = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const rowTimestamp = new Date(now);
  const rowYson = Buffer.from("<a=1>[3;%false]");

  const query = toQuery(
    new YdbInsertBuilder(typesTable, session).values({
      id: 1,
      flag: true,
      signed64: -123n,
      u32: 42,
      u64: 9007199254740993n,
      f32: 1.5,
      f64: 2,
      bytesValue: Buffer.from([1, 2, 3]),
      dateValue: rowDate,
      datetimeValue: rowDatetime,
      timestampValue: rowTimestamp,
      intervalValue: 123456,
      jsonValue: { pony: "Pinkie Pie" },
      jsonDocumentValue: ["Twilight", "Sparkle"],
      uuidValue: "550e8400-e29b-41d4-a716-446655440000",
      ysonValue: rowYson,
      decimalValue: "123.456",
      name: "Rarity",
    }),
  );

  assert.equal(
    query.sql,
    'insert into `column_types` (`id`, `flag`, `signed64`, `u32`, `u64`, `f32`, `f64`, `bytes_value`, `date_value`, `datetime_value`, `timestamp_value`, `interval_value`, `json_value`, `json_document_value`, `uuid_value`, `yson_value`, `decimal_value`, `name`) values ($p0, $p1, $p2, $p3, $p4, $p5, $p6, $p7, $p8, $p9, $p10, $p11, $p12, $p13, $p14, $p15, Decimal("123.456", 22, 9), $p16)',
  );

  assert.equal(query.params[0], 1);
  assert.ok(query.params[1] instanceof Bool);
  assert.ok(query.params[2] instanceof YdbInt64);
  assert.ok(query.params[3] instanceof YdbUint32);
  assert.ok(query.params[4] instanceof YdbUint64);
  assert.ok(query.params[5] instanceof YdbFloat);
  assert.ok(query.params[6] instanceof YdbDouble);
  assert.ok(query.params[7] instanceof Uint8Array);
  assert.ok(query.params[8] instanceof YdbDate);
  assert.ok(query.params[9] instanceof YdbDatetime);
  assert.ok(query.params[10] instanceof YdbTimestamp);
  assert.ok(query.params[11] instanceof YdbInterval);
  assert.ok(query.params[12] instanceof YdbJson);
  assert.ok(query.params[13] instanceof YdbJsonDocument);
  assert.ok(query.params[14] instanceof YdbUuid);
  assert.ok(query.params[15] instanceof YdbYson);
  assert.equal(query.params[16], "Rarity");
});

test("decimal rejects invalid", () => {
  assert.throws(
    () => toQuery(new YdbInsertBuilder(typesTable, session).values({ id: 1, decimalValue: "12e3" } as any)),
    /Invalid decimal value: 12e3/,
  );
});

test("customType", () => {
  const slugType = customType<{ data: string; driverData: SQL }>({
    dataType() {
      return "Utf8";
    },
    toDriver(value) {
      return sql.raw(`Utf8("${value.toUpperCase()}")`);
    },
  });

  const customTable = ydbTable("custom_types", {
    id: integer("id").notNull(),
    slug: slugType("slug"),
  });

  const query = toQuery(new YdbInsertBuilder(customTable, session).values({ id: 1, slug: "pony" }));

  assert.equal(customTable.slug.getSQLType(), "Utf8");
  assert.equal(query.sql, 'insert into `custom_types` (`id`, `slug`) values ($p0, Utf8("PONY"))');
  assert.deepEqual(query.params, [1]);
});

test("select decoders", async () => {
  const mockClient = {
    execute: async () => ({
      rows: [
        typeRow({
          id: 1,
          bytesValue: [1, 2, 3],
          ysonValue: "<a=1>[3;%false]",
        }),
      ],
    }),
  } as any;
  const mockSession = new YdbSession(mockClient, dialect);

  const [row] = await new YdbSelectBuilder(mockSession).from(typesTable).execute() as Array<Record<string, unknown>>;

  assert.equal(row.id, 1);
  assert.ok(row.bytesValue instanceof Uint8Array);
  assert.deepEqual(Array.from(row.bytesValue as Uint8Array), [1, 2, 3]);
  assert.ok(row.ysonValue instanceof Uint8Array);
  assert.deepEqual(
    Array.from(row.ysonValue as Uint8Array),
    Array.from(Buffer.from("<a=1>[3;%false]", "latin1")),
  );
});
