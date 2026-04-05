import test from "node:test";
import assert from "node:assert/strict";
import { TransactionRollbackError } from "drizzle-orm/errors";
import { YdbDialect, YdbTransaction } from "../../src/index.js";

test("transaction rollback throws Drizzle rollback error", () => {
  const tx = new YdbTransaction(new YdbDialect(), {} as any);

  assert.throws(() => tx.rollback(), TransactionRollbackError);
});
