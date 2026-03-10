import test from "node:test";
import assert from "node:assert/strict";
import { Driver } from "@ydbjs/core";
import { sql } from "drizzle-orm";
import { YdbDialect, YdbDriver } from "../src/index.js";

type MockQueryCall = {
  text: string;
  params: Array<{ name: string; value: unknown }>;
  valuesRows: unknown[];
  executeRows: unknown[];
};

function createMockQueryFunction(executeRows: unknown[], valuesRows = executeRows) {
  const calls: MockQueryCall[] = [];

  const ql = ((text: string) => {
    const call: MockQueryCall = {
      text,
      params: [],
      executeRows,
      valuesRows,
    };
    calls.push(call);

    const queryObject: {
      parameter(name: string, value: unknown): typeof queryObject;
      values(): Promise<unknown[][]>;
      then<TResult1 = unknown[][], TResult2 = never>(
        onfulfilled?: ((value: unknown[][]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2>;
    } = {
      parameter(name: string, value: unknown) {
        call.params.push({ name, value });
        return queryObject;
      },
      async values() {
        return [call.valuesRows as unknown[]];
      },
      then(onfulfilled, onrejected) {
        return Promise.resolve([call.executeRows as unknown[]]).then(onfulfilled, onrejected);
      },
    };

    return queryObject;
  }) as any;

  return { ql, calls };
}

test("dialect", () => {
  const dialect = new YdbDialect({ casing: "snake_case" });

  assert.equal(dialect.escapeName("pony`name"), "`pony``name`");
  assert.equal(dialect.escapeParam(7), "$p7");
  assert.equal(dialect.escapeString("Pinkie's pie"), "'Pinkie''s pie'");
  assert.equal(dialect.prepareTyping(), "none");

  const query = dialect.sqlToQuery(sql`select ${123} as ${sql.identifier("pony_id")}`);
  assert.equal(query.sql, "select $p0 as `pony_id`");
  assert.deepEqual(query.params, [123]);
  assert.deepEqual(query.typings, ["none"]);
});

test("borrowed driver", async () => {
  let readyCalls = 0;
  let closeCalls = 0;
  const signal = new AbortController().signal;
  const borrowedDriver = Object.create(Driver.prototype) as Driver & { ready(signal?: AbortSignal): Promise<void>; close(): void };

  borrowedDriver.ready = async (incomingSignal?: AbortSignal) => {
    readyCalls++;
    assert.equal(incomingSignal, signal);
  };
  borrowedDriver.close = () => {
    closeCalls++;
  };

  const driver = new YdbDriver(borrowedDriver);

  await driver.ready(signal);
  driver.close();

  assert.equal(driver.driver, borrowedDriver);
  assert.equal(readyCalls, 1);
  assert.equal(closeCalls, 0);
});

test("execute", async () => {
  const borrowedDriver = Object.create(Driver.prototype) as Driver;
  const driver = new YdbDriver(borrowedDriver);
  const mockClient = createMockQueryFunction([{ pony: "Twilight" }], [["Twilight", 7]]);

  (driver as any).client = mockClient.ql;

  const executeResult = await driver.execute("select * from ponies", [1, "Rainbow"], "execute");
  const valuesResult = await driver.execute("select * from ponies", [2], "all", { arrayMode: true });

  assert.deepEqual(executeResult.rows, [{ pony: "Twilight" }]);
  assert.deepEqual(valuesResult.rows, [["Twilight", 7]]);
  assert.equal(mockClient.calls.length, 2);
  assert.equal(mockClient.calls[0]?.text, "select * from ponies");
  assert.deepEqual(
    mockClient.calls[0]?.params.map(({ name }) => name),
    ["p0", "p1"],
  );
  assert.deepEqual(
    mockClient.calls[1]?.params.map(({ name }) => name),
    ["p0"],
  );
});

test("transaction", async () => {
  const borrowedDriver = Object.create(Driver.prototype) as Driver;
  const driver = new YdbDriver(borrowedDriver);
  const txQuery = createMockQueryFunction([{ ok: true }]);
  const beginCalls: unknown[] = [];

  (driver as any).client = {
    begin: async (...args: unknown[]) => {
      beginCalls.push(args);

      const callback = (typeof args[0] === "function" ? args[0] : args[1]) as (tx: any) => Promise<unknown>;
      return callback(txQuery.ql);
    },
  };

  const txResult = await driver.transaction(async (tx) => {
    const result = await tx.execute("select tx", [9], "execute");
    await assert.rejects(
      () => tx.transaction!(async () => "nested"),
      /Nested transactions are not supported by YDB/,
    );

    return result.rows;
  }, { accessMode: "read only" });

  assert.deepEqual(txResult, [{ ok: true }]);
  assert.equal(beginCalls.length, 1);
  assert.deepEqual(beginCalls[0]?.[0], { isolation: "snapshotReadOnly", idempotent: true });
  assert.equal(txQuery.calls.length, 1);

  await driver.transaction(async () => "ok", { isolationLevel: "serializableReadWrite", idempotent: false });
  assert.deepEqual(beginCalls[1]?.[0], { isolation: "serializableReadWrite", idempotent: false });

  await driver.transaction(async () => "no-config");
  assert.equal(typeof beginCalls[2]?.[0], "function");
});

test("fromCallback", async () => {
  const calls: Array<{ sql: string; params: unknown[]; method: string; options: unknown }> = [];
  const executor = YdbDriver.fromCallback(async (query, params, method, options) => {
    calls.push({ sql: query, params, method, options });
    return { rows: [{ ok: true }] };
  });

  const result = await executor.execute("select 1", [1], "execute", { arrayMode: true });

  assert.deepEqual(result.rows, [{ ok: true }]);
  assert.deepEqual(calls, [{
    sql: "select 1",
    params: [1],
    method: "execute",
    options: { arrayMode: true },
  }]);
});
