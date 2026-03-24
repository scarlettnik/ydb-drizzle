import test from "node:test";
import assert from "node:assert/strict";
import { TransactionRollbackError } from "drizzle-orm/errors";
import { YdbDialect, YdbTransaction } from "../../src/index.js";

test("transaction rollback throws Drizzle rollback error", () => {
  const tx = new YdbTransaction(new YdbDialect(), {} as any);

  assert.throws(() => tx.rollback(), TransactionRollbackError);
});

test("nested transactions are rejected directly by YdbTransaction", async () => {
  const tx = new YdbTransaction(new YdbDialect(), {} as any);

  await assert.rejects(
    async () => tx.transaction(async () => 1),
    /Nested transactions are not supported by YDB/,
  );
});
