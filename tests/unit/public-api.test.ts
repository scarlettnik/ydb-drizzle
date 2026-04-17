import test from "node:test";
import assert from "node:assert/strict";
import * as publicApi from "../../src/index.js";
import { createMany, createOne, relations } from "drizzle-orm";
import * as queryBuilders from "../../src/ydb-core/query-builders/index.js";
import { YdbDatabase } from "../../src/ydb-core/db.js";
import { YdbCountBuilder } from "../../src/ydb-core/query-builders/count.js";
import { YdbBatchDeleteBuilder, YdbDeleteBuilder } from "../../src/ydb-core/query-builders/delete.js";
import { YdbInsertBuilder, YdbReplaceBuilder, YdbUpsertBuilder } from "../../src/ydb-core/query-builders/insert.js";
import { YdbQueryBuilder } from "../../src/ydb-core/query-builders/query-builder.js";
import { YdbRelationalQuery, YdbRelationalQueryBuilder } from "../../src/ydb-core/query-builders/query.js";
import { except, intersect, union, unionAll, YdbSelectBuilder } from "../../src/ydb-core/query-builders/select.js";
import { YdbBatchUpdateBuilder, YdbUpdateBuilder } from "../../src/ydb-core/query-builders/update.js";
import { YdbSession } from "../../src/ydb-core/session.js";
import { YdbTransaction } from "../../src/ydb-core/transaction.js";
import { ydbTable } from "../../src/ydb-core/table.js";
import {
  buildAddColumnFamilySql,
  buildAlterColumnFamilySql,
  buildAlterColumnSetFamilySql,
  buildAlterTableResetOptionsSql,
  buildAlterTableSetOptionsSql,
  buildCreateTableSql,
} from "../../src/ydb/migration-ddl.js";
import { migrate } from "../../src/ydb/migrator.js";
import { customType } from "../../src/ydb-core/columns/custom.js";
import { integer } from "../../src/ydb-core/columns/integer.js";
import { text } from "../../src/ydb-core/columns/text.js";
import { index, indexView, uniqueIndex } from "../../src/ydb-core/indexes.js";
import {
  bigint,
  binary,
  boolean,
  bytes,
  date,
  date32,
  datetime,
  datetime64,
  decimal,
  double,
  dyNumber,
  float,
  int8,
  int16,
  interval,
  interval64,
  json,
  jsonDocument,
  timestamp,
  timestamp64,
  uint8,
  uint16,
  uint32,
  uint64,
  uuid,
  yson,
} from "../../src/ydb-core/columns/types.js";
import { primaryKey } from "../../src/ydb-core/primary-keys.js";
import { columnFamily, partitionByHash, rawTableOption, tableOptions, ttl } from "../../src/ydb-core/table-options.js";
import { unique } from "../../src/ydb-core/unique-constraint.js";
import { YdbDialect } from "../../src/ydb/dialect.js";
import { drizzle, createDrizzle } from "../../src/ydb/createDrizzle.js";
import { YdbDriver } from "../../src/ydb/driver.js";

test("root public API re-exports runtime entry points", () => {
  assert.equal(publicApi.YdbDialect, YdbDialect);
  assert.equal(publicApi.YdbDriver, YdbDriver);
  assert.equal(publicApi.YdbSession, YdbSession);
  assert.equal(publicApi.YdbTransaction, YdbTransaction);
  assert.equal(publicApi.YdbDatabase, YdbDatabase);
  assert.equal(publicApi.drizzle, drizzle);
  assert.equal(publicApi.createDrizzle, createDrizzle);
  assert.equal(publicApi.relations, relations);
  assert.equal(publicApi.one, createOne);
  assert.equal(publicApi.many, createMany);
  assert.equal(publicApi.ydbTable, ydbTable);
  assert.equal(publicApi.integer, integer);
  assert.equal(publicApi.int, integer);
  assert.equal(publicApi.text, text);
  assert.equal(publicApi.customType, customType);
  assert.equal(publicApi.index, index);
  assert.equal(publicApi.indexView, indexView);
  assert.equal(publicApi.uniqueIndex, uniqueIndex);
  assert.equal(publicApi.boolean, boolean);
  assert.equal(publicApi.bigint, bigint);
  assert.equal(publicApi.int8, int8);
  assert.equal(publicApi.int16, int16);
  assert.equal(publicApi.uint8, uint8);
  assert.equal(publicApi.uint16, uint16);
  assert.equal(publicApi.uint32, uint32);
  assert.equal(publicApi.uint64, uint64);
  assert.equal(publicApi.float, float);
  assert.equal(publicApi.double, double);
  assert.equal(publicApi.dyNumber, dyNumber);
  assert.equal(publicApi.bytes, bytes);
  assert.equal(publicApi.binary, binary);
  assert.equal(publicApi.date, date);
  assert.equal(publicApi.date32, date32);
  assert.equal(publicApi.datetime, datetime);
  assert.equal(publicApi.datetime64, datetime64);
  assert.equal(publicApi.timestamp, timestamp);
  assert.equal(publicApi.timestamp64, timestamp64);
  assert.equal(publicApi.interval, interval);
  assert.equal(publicApi.interval64, interval64);
  assert.equal(publicApi.json, json);
  assert.equal(publicApi.jsonDocument, jsonDocument);
  assert.equal(publicApi.uuid, uuid);
  assert.equal(publicApi.yson, yson);
  assert.equal(publicApi.decimal, decimal);
  assert.equal(publicApi.primaryKey, primaryKey);
  assert.equal(publicApi.unique, unique);
  assert.equal(publicApi.buildCreateTableSql, buildCreateTableSql);
  assert.equal(publicApi.buildAddColumnFamilySql, buildAddColumnFamilySql);
  assert.equal(publicApi.buildAlterColumnFamilySql, buildAlterColumnFamilySql);
  assert.equal(publicApi.buildAlterColumnSetFamilySql, buildAlterColumnSetFamilySql);
  assert.equal(publicApi.buildAlterTableResetOptionsSql, buildAlterTableResetOptionsSql);
  assert.equal(publicApi.buildAlterTableSetOptionsSql, buildAlterTableSetOptionsSql);
  assert.equal(publicApi.migrate, migrate);
  assert.equal(publicApi.tableOptions, tableOptions);
  assert.equal(publicApi.rawTableOption, rawTableOption);
  assert.equal(publicApi.partitionByHash, partitionByHash);
  assert.equal(publicApi.ttl, ttl);
  assert.equal(publicApi.columnFamily, columnFamily);
  assert.equal(publicApi.union, union);
  assert.equal(publicApi.unionAll, unionAll);
  assert.equal(publicApi.intersect, intersect);
  assert.equal(publicApi.except, except);
  assert.equal(publicApi.YdbCountBuilder, YdbCountBuilder);
  assert.equal(publicApi.YdbQueryBuilder, YdbQueryBuilder);
});

test("query builder barrel re-exports concrete builder implementations", () => {
  assert.equal(queryBuilders.YdbCountBuilder, YdbCountBuilder);
  assert.equal(queryBuilders.YdbSelectBuilder, YdbSelectBuilder);
  assert.equal(queryBuilders.YdbInsertBuilder, YdbInsertBuilder);
  assert.equal(queryBuilders.YdbUpsertBuilder, YdbUpsertBuilder);
  assert.equal(queryBuilders.YdbReplaceBuilder, YdbReplaceBuilder);
  assert.equal(queryBuilders.YdbUpdateBuilder, YdbUpdateBuilder);
  assert.equal(queryBuilders.YdbBatchUpdateBuilder, YdbBatchUpdateBuilder);
  assert.equal(queryBuilders.YdbDeleteBuilder, YdbDeleteBuilder);
  assert.equal(queryBuilders.YdbBatchDeleteBuilder, YdbBatchDeleteBuilder);
  assert.equal(queryBuilders.YdbQueryBuilder, YdbQueryBuilder);
  assert.equal(queryBuilders.YdbRelationalQueryBuilder, YdbRelationalQueryBuilder);
  assert.equal(queryBuilders.YdbRelationalQuery, YdbRelationalQuery);
  assert.equal(queryBuilders.union, union);
  assert.equal(queryBuilders.unionAll, unionAll);
  assert.equal(queryBuilders.intersect, intersect);
  assert.equal(queryBuilders.except, except);
});
