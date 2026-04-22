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
- [x] mapTransactionConfig(...)
- [x] result shape now preserves `rowCount`, `command` and `meta`
- [x] mock driver helper

### 2. Dialect

**src/ydb/dialect.ts**
- [x] constructor(config?)
- [x] escapeName(name)
- [x] escapeParam(num)
- [x] escapeString(str)
- [x] prepareTyping()
- [x] sqlToQuery(sql, invokeSource?)
- [x] buildWithCTE(queries)
- [x] buildSelection(fields, options?)
- [x] buildFromTable(table)
- [x] buildJoins(joins)
- [x] buildSelectQuery(config)
- [x] buildInsertQuery(config)
- [x] buildUpdateSet(table, set)
- [x] buildUpdateQuery(config)
- [x] buildDeleteQuery(config)
- [x] buildSetOperations(leftSelect, setOperators)
- [x] buildSetOperationQuery(config) //native UNION/UNION ALL + adapter-side INTERSECT/EXCEPT emulation
- [x] buildRelationalQueryWithoutPK(config) //flat single-table relational SQL
- [x] migrate(...)

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
- [x] batch(queries)

**Prepared query layer**
- [x] YdbPreparedQuery
- [x] getQuery()
- [x] mapResult(response, isFromBatch?)
- [x] execute()
- [x] all()
- [x] values()
- [x] get() including custom result mappers that return a single object/value

### 4. Database Surface

**src/ydb-core/db.ts**
- [x] constructor(dialect, session)
- [x] execute(sql/sql-wrapper/query-builder)
- [x] all(sql/sql-wrapper/query-builder)
- [x] select(fields?)
- [x] insert(table)
- [x] upsert(table)
- [x] replace(table)
- [x] update(table)
- [x] batchUpdate(table)
- [x] delete(table)
- [x] batchDelete(table)
- [x] transaction(callback, config?)
- [x] $with(alias).as(...)
- [x] with(...ctes)
- [x] selectDistinct(fields?)
- [x] selectDistinctOn(on, fields?)
- [x] $count(source, filters?)
- [x] query.<table>.findMany(...) for flat single-table schema-aware queries
- [x] query.<table>.findFirst(...) for flat single-table schema-aware queries
- [x] typed schema-aware query property
- [x] get(sql/sql-wrapper/query-builder)
- [x] values(sql/sql-wrapper/query-builder)
- [x] command/result helpers preserve driver metadata on row arrays via non-enumerable `rowCount`, `command`, and `meta` properties

### 5. Transactions

**src/ydb-core/transaction.ts**
- [x] constructor(dialect, session)
- [x] rollback()
- [x] nested transaction rejection with explicit error

### 6. Query Builders

**Select: src/ydb-core/query-builders/select.ts**
- [x] constructor(session, fields?)
- [x] from(table)
- [x] select without `from(...)` for expression-only YQL selects
- [x] where(where)
- [x] getSQL()
- [x] execute()
- [x] whole-table selects now apply column `mapFromDriverValue()` decoders to result rows
- [x] toSQL()
- [x] prepare(name?)
- [x] orderBy(...)
- [x] groupBy(...)
- [x] groupCompactBy(...) for YDB `GROUP COMPACT BY`
- [x] having(...)
- [x] window(name, definition) for named YDB `WINDOW` clauses
- [x] limit(n)
- [x] offset(n)
- [x] intoResult(name) for YDB `INTO RESULT`
- [x] distinct()
- [x] distinctOn(...) //adapter-side emulation via row_number() window query
- [x] uniqueDistinct(uniqueHint(...), distinctHint(...)) for YDB `UNIQUE DISTINCT` SQL hints
- [x] innerJoin(...)
- [x] leftJoin(...)
- [x] rightJoin(...)
- [x] fullJoin(...)
- [x] crossJoin(...)
- [x] YDB-specific joins: leftSemiJoin, rightSemiJoin, leftOnlyJoin, rightOnlyJoin, exclusionJoin
- [x] set operators: union, unionAll, intersect, except //INTERSECT/EXCEPT are emulated in SQL
- [x] fromAsTable(binding, alias?) for YDB `FROM AS_TABLE(...)`
- [x] fromValues(rows, options?) for YDB `FROM (VALUES ...)`
- [x] without(columns...) for YDB `SELECT * WITHOUT ...`
- [x] flattenBy(...), flattenListBy(...), flattenDictBy(...), flattenOptionalBy(...), flattenColumns()
- [x] sample(ratio) and tableSample(method, size, repeatable?)
- [x] assumeOrderBy(...) for YDB `ASSUME ORDER BY`
- [x] matchRecognize(config | rawSql) for YDB `MATCH_RECOGNIZE`
- [x] advanced GROUP BY helpers: rollup(...), cube(...), groupingSets(...), grouping(...), sessionWindow(...), sessionStart(), hop(...), hopStart(), hopEnd()
- [x] vector/KNN query helpers: vectorIndexView(...), knnDistance(...), knnSimilarity(...), typed cosine/euclidean/manhattan/inner-product helpers, kMeansTreeSearchTopSize(...)
- [x] YQL script helpers: pragma(...), declareParam(...), commit(), defineAction(...), doAction(...), doBlock(...), intoResult(...), yqlScript(...)
- [x] standalone SELECT helpers: asTable(...), values(...), valuesTable(...), matchRecognize(...), windowDefinition(...)

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
- [x] select(selectQuery)
- [x] onDuplicateKeyUpdate(...) //adapter-side emulation on top of valid YDB `UPSERT INTO ... SELECT`
- [x] returning(...)
- [x] native `UPSERT INTO` builder
- [x] native `REPLACE INTO` builder
- [x] `replace().returning(...)` is present as an explicit unsupported-method rejection because YDB docs do not document `REPLACE ... RETURNING`

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
- [x] on(selectQuery) //YDB-native set-based `UPDATE ... ON`
- [x] returning(...)

**Batch Update: src/ydb-core/query-builders/update.ts**
- [x] constructor(table, session)
- [x] set(values)
- [x] where(where)
- [x] getSQL()
- [x] execute()
- [x] toSQL()
- [x] prepare(name?)
- [x] rejects unsupported returning()/on() methods

**Delete: src/ydb-core/query-builders/delete.ts**

- [x] constructor(table, session)
- [x] where(where)
- [x] getSQL()
- [x] execute()
- [x] toSQL()
- [x] prepare(name?)
- [x] using(...) //adapter-side emulation via `where exists (...)`
- [x] on(selectQuery) //YDB-native set-based `DELETE ... ON`
- [x] returning(...)

**Batch Delete: src/ydb-core/query-builders/delete.ts**
- [x] constructor(table, session)
- [x] where(where)
- [x] getSQL()
- [x] execute()
- [x] toSQL()
- [x] prepare(name?)
- [x] rejects unsupported returning()/on()/using() methods

**Additional builders**
- [x] YdbCountBuilder
- [x] relational query builder for schema-aware `db.query.<table>` queries, including nested `with`
- [x] generic QueryBuilder for CTE/subquery composition

### 7. Tables, Columns, Constraints

**src/ydb-core/table.ts**
- [x] ydbTable(name, columns)
- [x] ydbTableCreator(fn)
- [x] columns are attached to the table instance
- [x] table extra config callback
- [x] constraint/index metadata storage for primary keys, unique constraints and indexes

**src/ydb-core/columns/common.ts**
- [x] `$type<T>()` with compile-time propagation through `ydbTable(...)`
- [x] notNull()
- [x] default(value)
- [x] $defaultFn(fn)
- [x] $onUpdateFn(fn)
- [x] primaryKey()
- [x] build(table)
- [x] getSQLType()
- [x] YDB-specific builder methods for unique constraints
- [x] mapToDriverValue(...) / mapFromDriverValue(...) across custom columns, whole-table selects, and prepared-query/result mapping

**Exported column types**
- [x] integer() / int()
- [x] text()
- [x] boolean()
- [x] int8()
- [x] int16()
- [x] bigint()
- [x] uint8()
- [x] uint16()
- [x] uint32()
- [x] uint64()
- [x] float()
- [x] double()
- [x] dyNumber()
- [x] decimal(precision, scale)
- [x] bytes() / binary()
- [x] date()
- [x] date32()
- [x] datetime()
- [x] datetime64()
- [x] timestamp()
- [x] timestamp64()
- [x] interval()
- [x] interval64()
- [x] json()
- [x] jsonDocument()
- [x] uuid()
- [x] yson()
- [x] generic customType(...)

**Constraints / indexes**
- [x] index(...)
- [x] indexView(table, indexName, alias?)
- [x] uniqueIndex(...)
- [x] vectorIndex(...) / vectorKMeansTree(...)
- [x] primaryKey(...)
- [x] unique(...)

### 8. Relations And Schema-Aware API

- [x] relations(table, config)
- [x] one(...)
- [x] many(...)
- [x] schema extraction from `config.schema`
- [x] db.query.<table>.findMany(...)
- [x] db.query.<table>.findFirst(...)
- [x] dialect relational SQL builder (buildRelationalQueryWithoutPK(...))
- [x] row mapping for relational selections

### 9. Migrations

- [x] migrate(...)
- [x] migration table bootstrap / bookkeeping
- [x] SQL generation for table create/alter/drop
- [x] temporary table DDL via buildCreateTableSql(table, { temporary: true | "temp" | "temporary" })
- [x] index / constraint DDL generation
- [x] integration contract with drizzle-kit or explicit adapter-side migrator
- [x] table options / partitioning / TTL / column-family DDL
- [x] vector index DDL (`USING vector_kmeans_tree`)
- [x] ANALYZE DDL builder
- [x] CREATE VIEW / DROP VIEW DDL builders
- [x] CREATE TOPIC / ALTER TOPIC / DROP TOPIC DDL builders
- [x] ALTER TABLE RENAME TO builder
- [x] ALTER TABLE CHANGEFEED add/drop builders
- [x] ALTER TABLE multi-action statement builder
- [x] CREATE/ALTER/DROP ASYNC REPLICATION DDL builders
- [x] CREATE/ALTER/DROP TRANSFER DDL builders
- [x] CREATE OBJECT (TYPE SECRET) DDL builder
- [x] CREATE/ALTER/DROP USER DDL builders
- [x] CREATE/ALTER/DROP GROUP DDL builders
- [x] GRANT / REVOKE DDL builders
- [x] SHOW CREATE DDL builder