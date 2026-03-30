import { aliasedTable, aliasedTableColumn, mapColumnsInSQLToAlias } from "drizzle-orm/alias";
import { CasingCache } from "drizzle-orm/casing";
import { Column } from "drizzle-orm/column";
import { entityKind, is } from "drizzle-orm/entity";
import { DrizzleError } from "drizzle-orm/errors";
import { getOperators, getOrderByOperators } from "drizzle-orm/relations";
import { SQL, sql, type DriverValueEncoder, type QueryTypingsValue, type QueryWithTypings } from "drizzle-orm/sql/sql";
import { and } from "drizzle-orm/sql/expressions";
import type { Casing } from "drizzle-orm/utils";
import type { YdbSession } from "../ydb-core/session.js";
import type { YdbSelectedFieldsOrdered } from "../ydb-core/result-mapping.js";
import { buildMigrationHistoryInsertSql, buildMigrationHistorySelectSql, buildMigrationTableBootstrapSql } from "./migration-ddl.js";
import {
  getSelectionAliases,
  buildFromTable,
  buildJoins,
  buildLimit,
  buildOffset,
  buildOrderBy,
  buildSelectQuery,
  buildSelection,
  buildSetOperationQuery,
  buildSetOperations,
  mapExpressionsToSelectionAliases,
} from "./dialect.select.js";
import type {
  YdbDeleteConfig,
  YdbDialectMigration,
  YdbDialectMigrationConfig,
  YdbInsertConfig,
  YdbJoinConfig,
  YdbRefreshMaterializedViewConfig,
  YdbRelationalQueryConfig,
  YdbRelationalQueryResult,
  YdbSetOperatorConfig,
  YdbUpdateConfig,
  YdbSelectConfig,
} from "./dialect.types.js";
import { getInsertColumnEntries, getTableColumns, resolveInsertValue, resolveUpdateValue, validateTableColumnKeys } from "../ydb-core/query-builders/utils.js";

export interface YdbDialectConfig {
  casing?: Casing;
}

export {
  type YdbDeleteConfig,
  type YdbDialectMigration,
  type YdbDialectMigrationConfig,
  type YdbInsertConfig,
  type YdbJoinConfig,
  type YdbJoinType,
  type YdbRefreshMaterializedViewConfig,
  type YdbRelationalQueryConfig,
  type YdbRelationalQueryResult,
  type YdbSelectConfig,
  type YdbSetOperatorConfig,
  type YdbSetOperatorSource,
  type YdbUpdateConfig,
} from "./dialect.types.js";

function isNumberValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function deriveMigrationName(migration: YdbDialectMigration, index: number): string {
  return migration.name ?? `migration_${String(index + 1).padStart(4, "0")}`;
}

export class YdbDialect {
  static readonly [entityKind] = "YdbDialect";
  private readonly casing: CasingCache;

  constructor(config: YdbDialectConfig = {}) {
    this.casing = new CasingCache(config.casing);
  }

  escapeName(name: string): string {
    return `\`${name.replace(/`/g, "``")}\``;
  }

  escapeParam(num: number): string {
    return `$p${num}`;
  }

  escapeString(str: string): string {
    return `'${str.replace(/'/g, "''")}'`;
  }

  prepareTyping(encoder?: DriverValueEncoder<unknown, unknown>): QueryTypingsValue {
    const sqlType = typeof (encoder as unknown as { getSQLType?: () => string } | undefined)?.getSQLType === "function"
      ? (encoder as unknown as { getSQLType(): string }).getSQLType()
      : undefined;

    if (sqlType === "Json" || sqlType === "JsonDocument") {
      return "json";
    }

    if (sqlType?.startsWith("Decimal(")) {
      return "decimal";
    }

    if (sqlType === "Date") {
      return "date";
    }

    if (sqlType === "Datetime" || sqlType === "Timestamp") {
      return "timestamp";
    }

    if (sqlType === "Uuid") {
      return "uuid";
    }

    return "none";
  }

  buildWithCTE(queries: { _: { alias: string; sql: SQL } }[] | undefined): SQL | undefined {
    if (!queries || queries.length === 0) {
      return undefined;
    }

    const withSqlChunks: SQL[] = [sql`with `];
    for (const [index, query] of queries.entries()) {
      withSqlChunks.push(sql`${sql.identifier(query._.alias)} as (${query._.sql})`);
      if (index < queries.length - 1) {
        withSqlChunks.push(sql`, `);
      }
    }
    withSqlChunks.push(sql` `);
    return sql.join(withSqlChunks);
  }

  getSelectionAliases(fields: YdbSelectedFieldsOrdered): string[] {
    return getSelectionAliases(fields);
  }

  mapExpressionsToSelectionAliases(
    expressions: Parameters<typeof mapExpressionsToSelectionAliases>[0],
    fields: Parameters<typeof mapExpressionsToSelectionAliases>[1],
    selectionAliases: Parameters<typeof mapExpressionsToSelectionAliases>[2],
    context: Parameters<typeof mapExpressionsToSelectionAliases>[3],
  ) {
    return mapExpressionsToSelectionAliases(expressions, fields, selectionAliases, context);
  }

  buildSelection(fields: YdbSelectedFieldsOrdered, aliases?: string[]) {
    return buildSelection(fields, aliases);
  }

  buildFromTable(table: unknown) {
    return buildFromTable(table);
  }

  buildJoins(joins: YdbJoinConfig[] | undefined) {
    return buildJoins(joins);
  }

  buildOrderBy(orderBy: Parameters<typeof buildOrderBy>[0]) {
    return buildOrderBy(orderBy);
  }

  buildLimit(limit: number | undefined) {
    return buildLimit(limit);
  }

  buildOffset(offset: number | undefined) {
    return buildOffset(offset);
  }

  buildSetOperationQuery(
    leftSelect: SQL,
    fields: YdbSelectedFieldsOrdered,
    selectionAliases: string[],
    setOperator: YdbSetOperatorConfig,
  ) {
    return buildSetOperationQuery(leftSelect, fields, selectionAliases, setOperator);
  }

  buildSetOperations(
    leftSelect: SQL,
    fields: YdbSelectedFieldsOrdered,
    selectionAliases: string[],
    setOperators: YdbSetOperatorConfig[],
  ) {
    return buildSetOperations(leftSelect, fields, selectionAliases, setOperators);
  }

  buildSelectQuery(config: YdbSelectConfig) {
    return buildSelectQuery(config);
  }

  buildInsertQuery(config: YdbInsertConfig): SQL {
    if (config.onConflict && (!Array.isArray(config.onConflict) || config.onConflict.length > 0)) {
      throw new Error("YDB insert onConflict clauses are not supported");
    }

    if (config.returning && config.returning.length > 0) {
      throw new Error("YDB insert returning() is not supported");
    }

    const withSql = this.buildWithCTE(config.withList);
    const columnEntries = getInsertColumnEntries(config.table);
    if (columnEntries.length === 0) {
      throw new Error("Insertable columns are missing");
    }

    const insertOrder = sql`(${sql.join(columnEntries.map(([, column]) => sql.identifier(column.name)), sql`, `)})`;

    if (config.select) {
      const selectQuery = is(config.values, SQL)
        ? config.values
        : (config.values as { getSQL(): SQL }).getSQL();
      return sql`${withSql}insert into ${config.table} ${insertOrder} ${selectQuery}`;
    }

    if (!Array.isArray(config.values)) {
      throw new Error("YDB insert values must be an array when select is not used");
    }

    if (config.values.length === 0) {
      throw new Error("Insert values are empty");
    }

    for (const row of config.values) {
      validateTableColumnKeys(config.table, row, "insert");
    }

    const valuesSql = config.values.map((row) => sql`(${
      sql.join(
        columnEntries.map(([key, column]) => sql`${resolveInsertValue(column, row[key])}`),
        sql`, `,
      )
    })`);

    return sql`${withSql}insert into ${config.table} ${insertOrder} values ${sql.join(valuesSql, sql`, `)}`;
  }

  buildUpdateSet(table: YdbUpdateConfig["table"], set: YdbUpdateConfig["set"]): SQL {
    const columns = getTableColumns(table);
    const setEntries = Object.entries(columns).flatMap(([key, column]) => {
      const value = resolveUpdateValue(column, set[key]);
      if (value === undefined) {
        return [];
      }

      return [sql`${sql.identifier(column.name)} = ${value}`];
    });

    if (setEntries.length === 0) {
      throw new Error("Update values are empty");
    }

    return sql.join(setEntries, sql`, `);
  }

  buildUpdateQuery(config: YdbUpdateConfig): SQL {
    if (config.returning && config.returning.length > 0) {
      throw new Error("YDB update returning() is not supported");
    }

    if (config.from) {
      throw new Error("YDB update from() is not supported");
    }

    if (config.joins && config.joins.length > 0) {
      throw new Error("YDB update joins are not supported");
    }

    if (config.orderBy && config.orderBy.length > 0) {
      throw new Error("YDB update orderBy() is not supported");
    }

    if (config.limit !== undefined) {
      throw new Error("YDB update limit() is not supported");
    }

    const withSql = this.buildWithCTE(config.withList);
    const setSql = this.buildUpdateSet(config.table, config.set);
    const whereSql = config.where ? sql` where ${config.where}` : undefined;

    return sql`${withSql}update ${this.buildFromTable(config.table)} set ${setSql}${whereSql}`;
  }

  buildDeleteQuery(config: YdbDeleteConfig): SQL {
    if (config.returning && config.returning.length > 0) {
      throw new Error("YDB delete returning() is not supported");
    }

    if (config.orderBy && config.orderBy.length > 0) {
      throw new Error("YDB delete orderBy() is not supported");
    }

    if (config.limit !== undefined) {
      throw new Error("YDB delete limit() is not supported");
    }

    const withSql = this.buildWithCTE(config.withList);
    const whereSql = config.where ? sql` where ${config.where}` : undefined;

    return sql`${withSql}delete from ${this.buildFromTable(config.table)}${whereSql}`;
  }

  buildRefreshMaterializedViewQuery(_config: YdbRefreshMaterializedViewConfig): SQL {
    throw new Error("YDB does not support materialized view refresh queries");
  }

  buildRelationalQueryWithoutPK({
    table,
    tableConfig,
    queryConfig: config,
    tableAlias,
    nestedQueryRelation,
    joinOn,
  }: YdbRelationalQueryConfig): YdbRelationalQueryResult {
    if (nestedQueryRelation) {
      throw new Error("YDB relational query `with` is not supported yet");
    }

    let where: SQL | undefined;
    let orderBy: SQL[] = [];
    let limit: number | undefined;
    let offset: number | undefined;
    let selectedColumns: string[] = [];

    const aliasedColumns = Object.fromEntries(
      Object.entries(tableConfig.columns).map(([key, value]) => [key, aliasedTableColumn(value, tableAlias)]),
    ) as Record<string, Column>;

    if (config === true) {
      selectedColumns = Object.keys(tableConfig.columns);
    } else {
      if (config.with !== undefined) {
        throw new Error("YDB relational query `with` is not supported yet");
      }

      if (config.extras !== undefined) {
        throw new Error("YDB relational query `extras` is not supported yet");
      }

      if (config.where) {
        const whereSql = typeof config.where === "function" ? config.where(aliasedColumns, getOperators()) : config.where;
        where = whereSql ? mapColumnsInSQLToAlias(whereSql, tableAlias) : undefined;
      }

      if (config.columns) {
        let isIncludeMode = false;
        for (const [field, value] of Object.entries(config.columns)) {
          if (value === undefined) {
            continue;
          }

          if (field in tableConfig.columns) {
            if (!isIncludeMode && value === true) {
              isIncludeMode = true;
            }
            selectedColumns.push(field);
          }
        }

        if (selectedColumns.length > 0) {
          selectedColumns = isIncludeMode
            ? selectedColumns.filter((column) => config.columns?.[column] === true)
            : Object.keys(tableConfig.columns).filter((column) => !selectedColumns.includes(column));
        }
      } else {
        selectedColumns = Object.keys(tableConfig.columns);
      }

      let orderByOrig = typeof config.orderBy === "function"
        ? config.orderBy(aliasedColumns, getOrderByOperators())
        : config.orderBy ?? [];
      if (!Array.isArray(orderByOrig)) {
        orderByOrig = [orderByOrig];
      }

      orderBy = orderByOrig.map((orderByValue) => {
        if (is(orderByValue, Column)) {
          return aliasedTableColumn(orderByValue, tableAlias) as unknown as SQL;
        }

        return mapColumnsInSQLToAlias(orderByValue, tableAlias);
      });

      if (config.limit !== undefined) {
        if (!isNumberValue(config.limit)) {
          throw new Error("YDB relational query limit placeholders are not supported yet");
        }
        limit = config.limit;
      }

      if (config.offset !== undefined) {
        if (!isNumberValue(config.offset)) {
          throw new Error("YDB relational query offset placeholders are not supported yet");
        }
        offset = config.offset;
      }
    }

    if (selectedColumns.length === 0) {
      throw new DrizzleError({ message: `No fields selected for table "${tableConfig.tsName}" ("${tableAlias}")` });
    }

    const selection = selectedColumns.map((field) => {
      const column = tableConfig.columns[field]!;
      return {
        dbKey: column.name,
        tsKey: field,
        field: aliasedTableColumn(column, tableAlias),
        relationTableTsKey: undefined,
        isJson: false,
        selection: [],
      };
    });

    const result = this.buildSelectQuery({
      table: aliasedTable(table, tableAlias),
      fields: {},
      fieldsFlat: selection.map(({ field }) => ({ path: [], field })) as YdbSelectedFieldsOrdered,
      where: and(joinOn, where),
      joins: undefined,
      orderBy,
      groupBy: undefined,
      having: undefined,
      limit,
      offset,
      distinct: false,
      distinctOn: undefined,
      selectionAliases: undefined,
      setOperators: [],
    });

    return {
      tableTsKey: tableConfig.tsName,
      sql: result,
      selection,
    };
  }

  async migrate(
    migrations: readonly YdbDialectMigration[],
    session: Pick<YdbSession, "execute" | "values">,
    config: string | YdbDialectMigrationConfig = {},
  ): Promise<void> {
    const migrationConfig = typeof config === "string"
      ? { migrationsTable: config }
      : config;

    await session.execute(sql.raw(buildMigrationTableBootstrapSql(migrationConfig)));

    const appliedRows = await session.values<[string, number | string, string]>(
      sql.raw(buildMigrationHistorySelectSql(migrationConfig)),
    );
    const appliedHashes = new Set(appliedRows.map(([hash]) => hash));
    const orderedMigrations = [...migrations].sort((left, right) => left.folderMillis - right.folderMillis);

    for (const [index, migration] of orderedMigrations.entries()) {
      if (appliedHashes.has(migration.hash)) {
        continue;
      }

      for (const statement of migration.sql) {
        const trimmed = statement.trim();
        if (trimmed === "") {
          continue;
        }

        await session.execute(sql.raw(trimmed));
      }

      await session.execute(sql.raw(buildMigrationHistoryInsertSql({
        hash: migration.hash,
        folderMillis: migration.folderMillis,
        name: deriveMigrationName(migration, index),
      }, migrationConfig)));

      appliedHashes.add(migration.hash);
    }
  }

  sqlToQuery(sqlValue: SQL, invokeSource?: "indexes"): QueryWithTypings {
    return sqlValue.toQuery({
      casing: this.casing,
      escapeName: this.escapeName,
      escapeParam: this.escapeParam,
      escapeString: this.escapeString,
      prepareTyping: this.prepareTyping,
      invokeSource,
    });
  }
}
