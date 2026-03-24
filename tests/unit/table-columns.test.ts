import test from "node:test";
import assert from "node:assert/strict";
import { getTableName, Table } from "drizzle-orm/table";
import { sql } from "drizzle-orm";
import { customType, integer, text, uuid, ydbTable, ydbTableCreator } from "../../src/index.js";
import { getYdbColumnBuilders, ydbColumnBuilders } from "../../src/ydb-core/columns/all.js";
import { YdbColumn } from "../../src/ydb-core/columns/common.js";

const typedTable = ydbTable("typed_table", {
  payload: text("payload").$type<{ pony: string }>(),
});
void typedTable;

test("table columns", () => {
  const table = ydbTable("ponies", {
    id: uuid("id").notNull(),
    price: integer("price").notNull(),
    name: text("name").notNull(),
  });

  const columns = (table as any)[(Table as any).Symbol.Columns];
  const extraColumns = (table as any)[(Table as any).Symbol.ExtraConfigColumns];

  assert.equal(getTableName(table), "ponies");
  assert.equal(table.id.name, "id");
  assert.equal(table.name.name, "name");
  assert.equal(columns.id, table.id);
  assert.equal(columns.name, table.name);
  assert.equal(extraColumns.id, table.id);
  assert.equal(extraColumns.name, table.name);
});

test("table callback", () => {
  const callbackTable = ydbTable("mares", ({ integer: int, text: textType }) => ({
    id: int("id").notNull(),
    name: textType("name").notNull(),
  }));
  const prefixedTable = ydbTableCreator((name) => `app_${name}`)("users", {
    id: integer("id").notNull(),
  });

  assert.equal(getTableName(callbackTable), "mares");
  assert.equal(getTableName(prefixedTable), "app_users");
  assert.equal(callbackTable.id.name, "id");
  assert.equal(callbackTable.name.name, "name");
});

test("column builders", () => {
  const firstRegistry = getYdbColumnBuilders();
  const secondRegistry = getYdbColumnBuilders();
  const callbackCalls: unknown[] = [];

  const table = ydbTable("registry_check", (builders) => {
    callbackCalls.push(builders);

    assert.equal(builders, ydbColumnBuilders);
    assert.equal(builders, firstRegistry);
    assert.equal(firstRegistry, secondRegistry);
    assert.equal(builders.int, builders.integer);

    return {
      id: builders.int("id").notNull(),
      payload: builders.text("payload"),
    };
  });

  assert.equal(callbackCalls.length, 1);
  assert.equal(table.id.name, "id");
  assert.equal(table.payload.name, "payload");
});

test("column builder metadata", () => {
  const generatedSql = sql`lower(name)`;
  const table = ydbTable("builder_columns", {
    id: integer("id")
      .notNull()
      .default(1)
      .$defaultFn(() => 2)
      .$onUpdateFn(() => 3)
      .primaryKey()
      .generatedAlwaysAs(() => generatedSql),
    plain: text("plain"),
  });

  const idColumn = table.id;
  const plainColumn = table.plain as YdbColumn;

  assert.equal(idColumn.notNull, true);
  assert.equal(idColumn.default, 1);
  assert.equal(idColumn.defaultFn?.(), 2);
  assert.equal(idColumn.onUpdateFn?.(), 3);
  assert.equal(idColumn.primary, true);
  assert.equal((idColumn as any).generated.type, "always");
  assert.equal((idColumn as any).generated.mode, "virtual");
  assert.equal(typeof (idColumn as any).generated.as, "function");
  assert.equal((idColumn as any).generated.as(), generatedSql);
  assert.equal(plainColumn.getSQLType(), "Utf8");
  assert.equal((new YdbColumn(table, (plainColumn as any).config)).getSQLType(), "unknown");
  assert.equal(plainColumn.mapToDriverValue("Rarity"), "Rarity");
  assert.equal(plainColumn.mapFromDriverValue("Rarity"), "Rarity");
});

test("custom columns", () => {
  const uppercase = customType<{ data: string; driverData: string }>({
    dataType() {
      return "Utf8";
    },
    toDriver(value) {
      return value.toUpperCase();
    },
    fromDriver(value) {
      return value.toLowerCase();
    },
  });
  const withConfig = customType<{ data: string; driverData: string; config: { prefix: string } }>({
    dataType(config) {
      return config?.prefix ? "Utf8" : "String";
    },
    toDriver(value) {
      return `cfg:${value}`;
    },
  });

  const table = ydbTable("custom_columns", {
    upper: uppercase("upper"),
    configured: withConfig("configured", { prefix: "pony" }),
  });

  assert.equal(table.upper.getSQLType(), "Utf8");
  assert.equal(table.upper.mapToDriverValue("pinkie"), "PINKIE");
  assert.equal(table.upper.mapFromDriverValue("PINKIE"), "pinkie");
  assert.equal(table.configured.getSQLType(), "Utf8");
  assert.equal(table.configured.mapToDriverValue("dash"), "cfg:dash");
});
