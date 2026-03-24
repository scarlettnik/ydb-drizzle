## Test Coverage Matrix

### Runtime / Integration

- `src/index.ts`
  - `tests/unit/public-api.test.ts`
- `src/ydb/createDrizzle.ts`
  - `tests/live/inputs-and-crud.test.ts`
  - `tests/unit/create-drizzle.logger.test.ts`
  - `tests/unit/create-drizzle.schema.test.ts`
  - `tests/unit/create-drizzle.transaction.test.ts`
- `src/ydb/driver.ts`
  - `tests/unit/driver.test.ts`
  - `tests/unit/public-api.test.ts`
  - `tests/live/test-connection.ts`
- `src/ydb/dialect.ts`
  - `tests/unit/dialect.test.ts`
  - `tests/unit/public-api.test.ts`
  - `tests/unit/select-builder.sql.test.ts`
- `src/ydb/dialect.select.ts`
  - `tests/unit/dialect.test.ts`
  - `tests/unit/select-builder.sql.test.ts`
  - `tests/unit/select-builder.runtime.test.ts`
- `src/ydb/dialect.types.ts`
  - type-only module, compile-checked by `npm run typecheck`
- `src/ydb/migration-ddl.ts`
  - `tests/unit/migration-ddl.test.ts`
  - `tests/live/migrations.test.ts`
- `src/ydb/migrator.ts`
  - `tests/unit/migrator.test.ts`
  - `tests/unit/public-api.test.ts`
  - `tests/live/migrations.test.ts`
- `src/ydb-core/session.ts`
  - `tests/unit/session-prepared.test.ts`
  - `tests/unit/public-api.test.ts`
  - `tests/unit/create-drizzle.transaction.test.ts`
- `src/ydb-core/db.ts`
  - `tests/unit/public-api.test.ts`
  - `tests/live/inputs-and-crud.test.ts`
  - `tests/live/select-features.test.ts`
  - `tests/live/transactions.test.ts`
- `src/ydb-core/transaction.ts`
  - `tests/unit/transaction.test.ts`
  - `tests/unit/public-api.test.ts`
  - `tests/unit/create-drizzle.transaction.test.ts`

### Query Builders

- `src/ydb-core/query-builders/index.ts`
  - `tests/unit/public-api.test.ts`
- `src/ydb-core/query-builders/select*.ts`
  - `tests/unit/public-api.test.ts`
  - `tests/unit/select-builder.sql.test.ts`
  - `tests/unit/select-builder.runtime.test.ts`
  - `tests/unit/builder-contract.test.ts`
  - `tests/live/select-features.test.ts`
- `src/ydb-core/query-builders/query.ts`
  - `tests/unit/relational-query.test.ts`
  - `tests/live/relations.test.ts`
- `src/ydb-core/query-builders/insert.ts`
  - `tests/unit/mutation-builders.test.ts`
  - `tests/live/inputs-and-crud.test.ts`
  - `tests/live/types-roundtrip.test.ts`
- `src/ydb-core/query-builders/update.ts`
  - `tests/unit/mutation-builders.test.ts`
  - `tests/live/inputs-and-crud.test.ts`
  - `tests/live/types-roundtrip.test.ts`
- `src/ydb-core/query-builders/delete.ts`
  - `tests/unit/mutation-builders.test.ts`
  - `tests/live/raw-sql.test.ts`
  - `tests/live/inputs-and-crud.test.ts`
- `src/ydb-core/query-builders/utils.ts`
  - `tests/unit/query-builder-utils.test.ts`
  - `tests/unit/mutation-builders.test.ts`

### Migrations / Schema Metadata

- `src/ydb-core/indexes.ts`
  - `tests/unit/migration-ddl.test.ts`
  - `tests/unit/public-api.test.ts`
  - `tests/live/migrations.test.ts`
- `src/ydb-core/primary-keys.ts`
  - `tests/unit/migration-ddl.test.ts`
  - `tests/unit/public-api.test.ts`
- `src/ydb-core/unique-constraint.ts`
  - `tests/unit/migration-ddl.test.ts`
  - `tests/unit/public-api.test.ts`
- `src/ydb-core/checks.ts`
  - `tests/unit/migration-ddl.test.ts`
  - `tests/unit/public-api.test.ts`
- `src/ydb-core/foreign-keys.ts`
  - `tests/unit/migration-ddl.test.ts`
  - `tests/unit/public-api.test.ts`
- `src/ydb-core/table.utils.ts`
  - `tests/unit/migration-ddl.test.ts`
  - `tests/live/migrations.test.ts`

### Tables / Columns / Mapping

- `src/ydb-core/table.ts`
  - `tests/unit/table-columns.test.ts`
  - `tests/unit/migration-ddl.test.ts`
  - `tests/unit/public-api.test.ts`
- `src/ydb-core/columns/*.ts`
  - `tests/unit/public-api.test.ts`
  - `tests/unit/table-columns.test.ts`
  - `tests/unit/column-types.test.ts`
  - `tests/live/types-roundtrip.test.ts`
- `src/ydb-core/result-mapping.ts`
  - `tests/unit/select-builder.runtime.test.ts`
  - `tests/unit/session-prepared.test.ts`
  - `tests/live/select-features.test.ts`
