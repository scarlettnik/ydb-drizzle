---
title: Публичный API
description: Полный список корневых экспортов и публичных методов ydb-drizzle-adapter.
---

Этот файл перечисляет публичные экспорты корня пакета `ydb-drizzle-adapter`. Подробные примеры находятся на тематических страницах.

## Подключение и database

Подробнее: [Подключение](database-api/connection.md), [методы YdbDatabase](database-api/methods.md), [транзакции и relations](database-api/transactions-relations.md).

Функции и классы:

- `createDrizzle`
- `drizzle`
- `YdbDatabase`
- `YdbSession`
- `YdbTransaction`

Типы:

- `YdbDrizzleConfig`
- `YdbDrizzleDatabase`
- `YdbDrizzleOptions`
- `YdbSchemaDefinition`
- `YdbSchemaRelations`
- `YdbSchemaWithoutTables`

## Driver

Подробнее: [YdbDriver](driver-session-dialect/driver.md).

Функции и классы:

- `YdbDriver`

Типы:

- `YdbDriverOptions`
- `YdbExecuteOptions`
- `YdbExecutor`
- `YdbQueryMeta`
- `YdbQueryResult`
- `YdbRemoteCallback`
- `YdbTransactionalExecutor`
- `YdbTransactionConfig`

## Dialect

Подробнее: [YdbDialect](driver-session-dialect/dialect.md).

Классы:

- `YdbDialect`

Типы:

- `YdbDeleteConfig`
- `YdbDialectMigration`
- `YdbDialectMigrationConfig`
- `YdbFlatRelationalQueryConfig`
- `YdbInsertConfig`
- `YdbJoinConfig`
- `YdbJoinType`
- `YdbRelationalQueryConfig`
- `YdbRelationalQueryResult`
- `YdbSelectConfig`
- `YdbSetOperatorConfig`
- `YdbSetOperatorSource`
- `YdbUpdateConfig`

## Tables and schema

Подробнее: [Таблицы](schema/tables.md), [constraints и индексы](schema/constraints-indexes.md).

Функции и классы:

- `ydbTable`
- `ydbTableCreator`
- `primaryKey`
- `unique`
- `relations`
- `one`
- `many`

Типы:

- `YdbTable`
- `YdbTableFn`

## Columns

Подробнее: [Колонки и типы](schema/columns.md).

Функции:

- `customType`
- `integer`
- `int`
- `text`
- `bigint`
- `binary`
- `boolean`
- `bytes`
- `date`
- `date32`
- `datetime`
- `datetime64`
- `decimal`
- `double`
- `dyNumber`
- `float`
- `int8`
- `int16`
- `interval`
- `interval64`
- `json`
- `jsonDocument`
- `timestamp`
- `timestamp64`
- `uint8`
- `uint16`
- `uint32`
- `uint64`
- `uuid`
- `yson`

## Table options

Подробнее: [Table options и TTL](schema/table-options.md).

Функции и классы:

- `columnFamily`
- `partitionByHash`
- `rawTableOption`
- `tableOptions`
- `ttl`

Типы:

- `YdbColumnFamilyOptions`
- `YdbTableOptionValue`
- `YdbTtlAction`
- `YdbTtlUnit`

## Indexes

Подробнее: [Constraints и индексы](schema/constraints-indexes.md).

Функции и классы:

- `index`
- `uniqueIndex`
- `vectorIndex`
- `indexView`
- `vectorIndexView`

Типы:

- `YdbVectorDistance`
- `YdbVectorKMeansTreeOptions`
- `YdbVectorSimilarity`
- `YdbVectorType`

## Построители запросов

Подробнее: [SELECT builder](query-builders/select.md), [joins и set operators](query-builders/joins-set-operators.md), [mutation builders](query-builders/mutations.md), [CTE и rendering](query-builders/cte-rendering.md).

Классы:

- `YdbCountBuilder`
- `YdbQueryBuilder`

Точки входа SELECT:

- `db.select`
- `db.selectDistinct`
- `db.selectDistinctOn`
- `db.$with`
- `db.with`

Методы SELECT builder:

- `from`
- `fromAsTable`
- `fromValues`
- `getSelectedFields`
- `where`
- `having`
- `groupBy`
- `groupCompactBy`
- `orderBy`
- `assumeOrderBy`
- `limit`
- `offset`
- `without`
- `flattenBy`
- `flattenListBy`
- `flattenDictBy`
- `flattenOptionalBy`
- `flattenColumns`
- `sample`
- `tableSample`
- `matchRecognize`
- `window`
- `intoResult`
- `uniqueDistinct`
- `distinct`
- `distinctOn`
- `innerJoin`
- `leftJoin`
- `rightJoin`
- `fullJoin`
- `crossJoin`
- `leftSemiJoin`
- `rightSemiJoin`
- `leftOnlyJoin`
- `rightOnlyJoin`
- `exclusionJoin`
- `union`
- `unionAll`
- `intersect`
- `except`
- `addSetOperators`
- `getSQL`
- `toSQL`
- `prepare`
- `execute`

Точки входа mutation API:

- `db.insert`
- `db.upsert`
- `db.replace`
- `db.update`
- `db.batchUpdate`
- `db.delete`
- `db.batchDelete`

Методы mutation builder:

- `values`
- `select`
- `set`
- `where`
- `using`
- `on`
- `returning`
- `onDuplicateKeyUpdate`
- `getSQL`
- `toSQL`
- `prepare`
- `execute`

## SELECT and YQL helpers

Подробнее: [SELECT sources](ydb-yql-helpers/select-sources.md), [analytical helpers](ydb-yql-helpers/analytical.md), [YQL scripts](ydb-yql-helpers/scripts.md).

Функции:

- `asTable`
- `values`
- `valuesTable`
- `matchRecognize`
- `uniqueHint`
- `distinctHint`
- `windowDefinition`
- `groupKey`
- `rollup`
- `cube`
- `groupingSets`
- `grouping`
- `sessionWindow`
- `sessionStart`
- `hop`
- `hopStart`
- `hopEnd`
- `knnDistance`
- `knnSimilarity`
- `knnCosineDistance`
- `knnEuclideanDistance`
- `knnManhattanDistance`
- `knnCosineSimilarity`
- `knnInnerProductSimilarity`
- `yqlScript`
- `pragma`
- `kMeansTreeSearchTopSize`
- `declareParam`
- `commit`
- `defineAction`
- `doAction`
- `doBlock`
- `intoResult`

Функции set operators:

- `union`
- `unionAll`
- `intersect`
- `except`

Типы:

- `YdbActionParameter`
- `YdbFlattenConfig`
- `YdbFlattenMode`
- `YdbGroupingSet`
- `YdbKnnDistanceFunction`
- `YdbKnnSimilarityFunction`
- `YdbMatchRecognizeConfig`
- `YdbSampleConfig`
- `YdbScriptExpression`
- `YdbScriptPrimitive`
- `YdbUniqueDistinctHint`
- `YdbValuesOptions`
- `YdbValuesPrimitive`
- `YdbValuesRow`
- `YdbWindowClause`
- `YdbWindowDefinitionConfig`

## Migrations

Подробнее: [Migrator](migrations-ddl/migrate.md).

Функции:

- `migrate`

Типы:

- `YdbMigrateConfig`
- `YdbMigratorConfig`
- `YdbMigrationLockConfig`
- `YdbMigrationRecoveryConfig`
- `YdbMigrationStatus`
- `YdbInlineMigration`
- `YdbMigrationOperation`

## DDL helpers

Подробнее: [DDL таблиц](migrations-ddl/table-ddl.md), [DDL сервисных объектов](migrations-ddl/service-ddl.md), [операции миграций](migrations-ddl/operations.md).

Функции:

- `buildAddColumnsSql`
- `buildAddChangefeedSql`
- `buildAddColumnFamilySql`
- `buildAddIndexSql`
- `buildAlterAsyncReplicationSql`
- `buildAlterGroupSql`
- `buildAlterTableSql`
- `buildAlterColumnFamilySql`
- `buildAlterColumnSetFamilySql`
- `buildAlterTableResetOptionsSql`
- `buildAlterTableSetOptionsSql`
- `buildAlterTopicSql`
- `buildAlterTransferSql`
- `buildAlterUserSql`
- `buildAnalyzeSql`
- `buildCreateAsyncReplicationSql`
- `buildCreateGroupSql`
- `buildCreateSecretSql`
- `buildCreateTableSql`
- `buildCreateTopicSql`
- `buildCreateTransferSql`
- `buildCreateUserSql`
- `buildCreateViewSql`
- `buildDropAsyncReplicationSql`
- `buildDropColumnsSql`
- `buildDropChangefeedSql`
- `buildDropGroupSql`
- `buildDropIndexSql`
- `buildDropTableSql`
- `buildDropTopicSql`
- `buildDropTransferSql`
- `buildDropUserSql`
- `buildDropViewSql`
- `buildGrantSql`
- `buildMigrationLockTableBootstrapSql`
- `buildMigrationSql`
- `buildRevokeSql`
- `buildRenameTableSql`
- `buildShowCreateSql`

Типы операций и конфигурации:

- `YdbAccessPermission`
- `YdbAccessPermissions`
- `YdbAlterAsyncReplicationOperation`
- `YdbAlterAsyncReplicationOptions`
- `YdbAlterGroupOperation`
- `YdbAlterTableAction`
- `YdbAlterTableOperation`
- `YdbAlterTopicAction`
- `YdbAlterTopicOperation`
- `YdbAlterTransferOperation`
- `YdbAlterTransferOptions`
- `YdbAlterUserOperation`
- `YdbAnalyzeOperation`
- `YdbAsyncReplicationConsistencyLevel`
- `YdbAsyncReplicationOptions`
- `YdbAsyncReplicationTarget`
- `YdbChangefeedFormat`
- `YdbChangefeedMode`
- `YdbChangefeedOptions`
- `YdbCreateAsyncReplicationOperation`
- `YdbCreateGroupOperation`
- `YdbCreateSecretOperation`
- `YdbCreateTopicOptions`
- `YdbCreateTopicOperation`
- `YdbCreateTransferOperation`
- `YdbCreateUserOperation`
- `YdbCreateViewOperation`
- `YdbCreateViewOptions`
- `YdbDropAsyncReplicationOperation`
- `YdbDropChangefeedOperation`
- `YdbDropGroupOperation`
- `YdbDropTopicOperation`
- `YdbDropTransferOperation`
- `YdbDropUserOperation`
- `YdbDropViewOperation`
- `YdbGrantOperation`
- `YdbRenameTableOperation`
- `YdbRevokeOperation`
- `YdbShowCreateObjectType`
- `YdbShowCreateOperation`
- `YdbTopicConsumer`
- `YdbTransferOptions`
- `YdbUserOptions`

## Объектные методы без корневого export

Эти методы доступны на объектах, создаваемых корневым API. Некоторые классы builders не экспортируются как отдельные корневые имена:

- `YdbPreparedQuery.getQuery`
- `YdbPreparedQuery.isResponseInArrayMode`
- `YdbPreparedQuery.mapResult`
- `YdbPreparedQuery.execute`
- `YdbPreparedQuery.all`
- `YdbPreparedQuery.get`
- `YdbPreparedQuery.values`
- `YdbSession.prepareQuery`
- `YdbSession.execute`
- `YdbSession.all`
- `YdbSession.get`
- `YdbSession.values`
- `YdbSession.batch`
- `YdbSession.count`
- `YdbSession.transaction`
- `YdbDriver.ready`
- `YdbDriver.execute`
- `YdbDriver.transaction`
- `YdbDriver.close`
- `YdbDriver.fromCallback`
