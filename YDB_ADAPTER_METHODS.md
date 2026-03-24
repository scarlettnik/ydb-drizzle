## Checklist

### 1. Entry Point And Driver

**src/ydb/createDrizzle.ts**
- [x] createDrizzle(input, config?)
- [x] drizzle
- [x] accepts executor / callback / connection string
- [x] logger field wired into execution logging via prepared query/session layer
- [x] schema field consumed
- [x] schema extraction into relational config
- [x] typed schema-aware database wrapper with `db._` metadata and `db.query`

**src/ydb/driver.ts**
- [x] YdbDriver.constructor(connectionString | options | driver)
- [x] YdbDriver.ready(signal?)
- [x] YdbDriver.execute(sql, params, method, options?)
- [x] YdbDriver.transaction(callback, config?)
- [x] YdbDriver.close()
- [x] YdbDriver.fromCallback(callback)
- [x] YdbTxExecutor.execute(...)
- [x] YdbTxExecutor.transaction(...) throws for nested transactions
- [x] mapTransactionConfig(...)
- [ ] result shape is reduced to { rows }; command metadata is lost
- [ ] typings option is accepted but unused
- [ ] richer result mapping for execute/all/get/values
- [ ] replica / read-write split support
- [ ] mock driver helper

### 2. Dialect

**src/ydb/dialect.ts**
- [x] constructor(config?)
- [x] escapeName(name)
- [x] escapeParam(num)
- [x] escapeString(str)
- [ ] prepareTyping()
- [x] sqlToQuery(sql, invokeSource?)
- [ ] buildWithCTE(queries)
- [x] buildSelection(fields, options?)
- [x] buildFromTable(table)
- [x] buildJoins(joins)
- [x] buildSelectQuery(config)
- [ ] buildInsertQuery(config)
- [ ] buildUpdateSet(table, set)
- [ ] buildUpdateQuery(config)
- [ ] buildDeleteQuery(config)
- [x] buildSetOperations(leftSelect, setOperators)
- [x] buildSetOperationQuery(config) //native UNION/UNION ALL + adapter-side INTERSECT/EXCEPT emulation
- [ ] buildRefreshMaterializedViewQuery(config)
- [ ] buildRelationalQueryWithoutPK(config)
- [ ] migrate(...)

### 3. Session And Prepared Queries

**src/ydb-core/session.ts**
- [x] constructor(client, dialect, options?)
- [x] execute(sql/sql-wrapper/query-builder, options?)
- [x] all(sql/sql-wrapper/query-builder, options?)
- [x] transaction(callback, config?)
- [x] prepareQuery(query, fields, name, isResponseInArrayMode, customResultMapper?)
- [x] count(sql)
- [x] get(sql/sql-wrapper/query-builder)
- [x] values(sql/sql-wrapper/query-builder)
- [x] execution logger propagation from `drizzle({ logger })`
- [ ] batch(queries)
- [ ] cache-aware execution (withCache(...), cacheConfig)

**Prepared query layer**
- [x] YdbPreparedQuery
- [x] getQuery()
- [x] mapResult(response, isFromBatch?)
- [x] execute(placeholderValues?)
- [x] all(placeholderValues?)
- [x] values(placeholderValues?)
- [x] get(placeholderValues?) including custom result mappers that return a single object/value
- [ ] runtime placeholder rebinding is still not implemented; non-empty `placeholderValues` currently throw

### 4. Database Surface

**src/ydb-core/db.ts**
- [x] constructor(dialect, session)
- [x] execute(sql/sql-wrapper/query-builder)
- [x] all(sql/sql-wrapper/query-builder)
- [x] select(fields?)
- [x] insert(table)
- [x] update(table)
- [x] delete(table)
- [ ] transaction(callback, config?) //НЕВЕРНАЯ ИНТЕГРАЦИЯ
- [ ] $with(alias).as(...)
- [ ] with(...ctes)
- [x] selectDistinct(fields?)
- [x] selectDistinctOn(on, fields?)
- [ ] $count(source, filters?)
- [x] query.<table>.findMany(...) for flat single-table schema-aware queries
- [x] query.<table>.findFirst(...) for flat single-table schema-aware queries
- [x] typed schema-aware query property
- [x] get(sql/sql-wrapper/query-builder)
- [x] values(sql/sql-wrapper/query-builder)
- [~] command/result helpers are aligned for read queries and builders, but mutation metadata is still reduced to `{ rows }` by the driver layer

### 5. Transactions

**src/ydb-core/transaction.ts**
- [x] constructor(dialect, session)
- [x] transaction(...) throws for nested transactions
- [x] rollback()
- [ ] explicit transaction setup helper

### 6. Query Builders

**Select: src/ydb-core/query-builders/select.ts**
- [x] constructor(session, fields?)
- [x] from(table)
- [x] where(where)
- [x] getSQL()
- [x] execute()
- [x] whole-table selects now apply column `mapFromDriverValue()` decoders to result rows
- [x] toSQL()
- [x] prepare(name?)
- [x] orderBy(...)
- [x] groupBy(...)
- [x] having(...)
- [x] limit(n)
- [x] offset(n)
- [x] distinct()
- [x] distinctOn(...) //adapter-side emulation via row_number() window query
- [x] innerJoin(...)
- [x] leftJoin(...)
- [x] rightJoin(...)
- [x] fullJoin(...)
- [x] crossJoin(...)
- [~] locking clauses now fail fast with an explicit "not supported by YDB" error
- [x] set operators: union, unionAll, intersect, except //INTERSECT/EXCEPT are emulated in SQL

**Insert: src/ydb-core/query-builders/insert.ts**
- [x] constructor(table, session)
- [x] values(values | values[])
- [x] getSQL()
- [x] execute()
- [x] stable table-column order for multi-row insert
- [x] runtime $defaultFn() support for omitted insert fields
- [x] runtime $onUpdateFn() fallback during insert when no explicit/default value exists
- [x] rejects unknown columns at runtime
- [x] toSQL()
- [x] prepare(name?)
- [ ] select(selectQuery)
- [ ] returning(fields?)
- [ ] onConflictDoNothing(...)
- [ ] onConflictDoUpdate(...)
- [ ] onDuplicateKeyUpdate(...)

**Update: src/ydb-core/query-builders/update.ts**
- [x] constructor(table, session)
- [x] set(values)
- [x] where(where)
- [x] getSQL()
- [x] execute()
- [x] runtime $onUpdateFn() support for omitted update fields
- [x] rejects unknown columns at runtime
- [x] rejects empty update sets
- [x] toSQL()
- [x] prepare(name?)
- [?] returning(fields?)
- [?] from(source)
- [?] join-based update helpers

**Delete: src/ydb-core/query-builders/delete.ts**
- [x] constructor(table, session)
- [x] where(where)
- [x] getSQL()
- [x] execute()
- [x] toSQL()
- [x] prepare(name?)
- [ ] returning(fields?)
- [ ] using(...)

**Additional builders**
- [ ] YdbRaw
- [ ] YdbCountBuilder
- [~] relational query builder for flat schema-aware `db.query.<table>` queries
- [ ] generic QueryBuilder for CTE/subquery composition

### 7. Tables, Columns, Constraints

**src/ydb-core/table.ts**
- [x] ydbTable(name, columns)
- [x] ydbTableCreator(fn)
- [ ] columns are attached, but extra config is currently just mirrored from columns
- [ ] table extra config callback
- [ ] schema support
- [ ] aliasing helpers
- [ ] proper constraint/index metadata storage

**src/ydb-core/columns/common.ts**
- [~] `$type<T>()` exists on the builder API, but compile-time propagation through `ydbTable(...)` is currently incomplete; runtime builder chaining works, full typed-model preservation still needs table generic rework
- [x] notNull()
- [x] default(value)
- [x] $defaultFn(fn)
- [x] $onUpdateFn(fn)
- [x] primaryKey()
- [x] generatedAlwaysAs(...)
- [x] build(table)
- [x] getSQLType()
- [ ] YDB-specific builder methods for unique constraints
- [ ] YDB-specific builder methods for references / foreign keys
- [ ] mapToDriverValue(...) / mapFromDriverValue(...) for non-trivial custom types is now available via custom columns and type-specific codecs; whole-table `select().from(table)` now applies these decoders, but a full prepared-query/result-mapper layer is still missing

**Exported column types**
- [x] integer() / int()
- [x] text()
- [x] boolean()
- [x] bigint()
- [x] uint32()
- [x] uint64()
- [x] float()
- [x] double()
- [x] decimal(precision, scale)
- [x] bytes() / binary()
- [x] date()
- [x] datetime()
- [x] timestamp()
- [x] interval()
- [x] json()
- [x] jsonDocument()
- [x] uuid()
- [x] yson()
- [x] generic customType(...) for unsupported native types and custom codecs

**Constraints / indexes**
- [x] index(...)
- [x] uniqueIndex(...)
- [x] primaryKey(...)
- [x] unique(...)
- [?] foreignKey(...) - metadata API exists; YDB DDL generation rejects it explicitly because YDB has no FOREIGN KEY support
- [?] check(...) - metadata API exists; YDB DDL generation rejects it explicitly because YDB has no CHECK support

### 8. Relations And Schema-Aware API

- [ ] relations(table, config)
- [ ] one(...)
- [ ] many(...)
- [x] schema extraction from config.schema
- [x] db.query.<table>.findMany(...) for flat single-table queries without `with`/`extras`
- [x] db.query.<table>.findFirst(...) for flat single-table queries without `with`/`extras`
- [ ] dialect relational SQL builder (buildRelationalQueryWithoutPK(...))
- [ ] row mapping for relational selections

### 9. Migrations

- [x] migrate(...)
- [x] migration table bootstrap / bookkeeping
- [x] SQL generation for table create/alter/drop
- [x] index / constraint DDL generation
- [x] integration contract with drizzle-kit or explicit adapter-side migrator
