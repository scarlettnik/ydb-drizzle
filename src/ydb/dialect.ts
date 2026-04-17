import { aliasedTable, aliasedTableColumn, mapColumnsInAliasedSQLToAlias, mapColumnsInSQLToAlias } from "drizzle-orm/alias";
import { CasingCache } from "drizzle-orm/casing";
import { Column } from "drizzle-orm/column";
import { entityKind, is } from "drizzle-orm/entity";
import { DrizzleError } from "drizzle-orm/errors";
import { getOperators, getOrderByOperators } from "drizzle-orm/relations";
import { SQL, sql as yql, type DriverValueEncoder, type QueryTypingsValue, type QueryWithTypings } from "drizzle-orm/sql/sql";
import { and } from "drizzle-orm/sql/expressions";
import type { Casing } from "drizzle-orm/utils";
import type { YdbSession } from "../ydb-core/session.js";
import type { YdbSelectedFieldsOrdered } from "../ydb-core/result-mapping.js";
import type { YdbColumn } from "../ydb-core/columns/common.js";
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
  buildReturningSelection,
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
  type YdbFlatRelationalQueryConfig,
  type YdbInsertConfig,
  type YdbJoinConfig,
  type YdbJoinType,
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

    if (sqlType === "Date" || sqlType === "Date32") {
      return "date";
    }

    if (sqlType === "Datetime" || sqlType === "Timestamp" || sqlType === "Datetime64" || sqlType === "Timestamp64") {
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

    const withSqlChunks: SQL[] = [yql`with `];
    for (const [index, query] of queries.entries()) {
      withSqlChunks.push(yql`${yql.identifier(query._.alias)} as (${query._.sql})`);
      if (index < queries.length - 1) {
        withSqlChunks.push(yql`, `);
      }
    }
    withSqlChunks.push(yql` `);
    return yql.join(withSqlChunks);
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

  buildReturningSelection(fields: YdbSelectedFieldsOrdered) {
    return buildReturningSelection(fields);
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
    const withSql = this.buildWithCTE(config.withList);
    const query = buildSelectQuery(config);
    return withSql ? yql`${withSql}${query}` : query;
  }

  buildInsertQuery(config: YdbInsertConfig): SQL {
    const withSql = this.buildWithCTE(config.withList);
    const columnEntries = config.columnEntries ?? getInsertColumnEntries(config.table);
    if (columnEntries.length === 0) {
      throw new Error("Insertable columns are missing");
    }

    const commandName = config.command ?? "insert";
    const commandLabel = commandName.charAt(0).toUpperCase() + commandName.slice(1);
    const insertOrder = yql`(${yql.join(columnEntries.map(([, column]) => yql.identifier(column.name)), yql`, `)})`;
    const command = yql.raw(commandName);
    const returningSql = config.returning
      ? yql` returning ${this.buildReturningSelection(config.returning)}`
      : undefined;

    if (config.select) {
      const selectQuery = is(config.values, SQL)
        ? config.values
        : (config.values as { getSQL(): SQL }).getSQL();
      return yql`${withSql}${command} into ${config.table} ${insertOrder} ${selectQuery}${returningSql}`;
    }

    if (!Array.isArray(config.values)) {
      throw new Error(`YDB ${commandName} values must be an array when select is not used`);
    }

    if (config.values.length === 0) {
      throw new Error(`${commandLabel} values are empty`);
    }

    for (const row of config.values) {
      validateTableColumnKeys(config.table, row, commandName);
    }

    const valuesSql = config.values.map((row) => yql`(${
      yql.join(
        columnEntries.map(([key, column]) => yql`${resolveInsertValue(column, row[key])}`),
        yql`, `,
      )
    })`);

    return yql`${withSql}${command} into ${config.table} ${insertOrder} values ${yql.join(valuesSql, yql`, `)}${returningSql}`;
  }

  buildUpdateSet(table: YdbUpdateConfig["table"], set: NonNullable<YdbUpdateConfig["set"]>): SQL {
    const columns = getTableColumns(table);
    const setEntries = Object.entries(columns).flatMap(([key, column]) => {
      const value = resolveUpdateValue(column, set[key]);
      if (value === undefined) {
        return [];
      }

      return [yql`${yql.identifier(column.name)} = ${value}`];
    });

    if (setEntries.length === 0) {
      throw new Error("Update values are empty");
    }

    return yql.join(setEntries, yql`, `);
  }

  buildUpdateQuery(config: YdbUpdateConfig): SQL {
    const withSql = this.buildWithCTE(config.withList);
    const returningSql = config.returning
      ? yql` returning ${this.buildReturningSelection(config.returning)}`
      : undefined;
    const updateKeyword = config.batch ? yql`batch update` : yql`update`;

    if (config.batch && (config.on || returningSql || withSql)) {
      throw new Error("YDB BATCH UPDATE cannot use WITH, ON, or RETURNING");
    }

    if (config.on) {
      return yql`${withSql}update ${this.buildFromTable(config.table)} on ${config.on}${returningSql}`;
    }

    if (!config.set) {
      throw new Error("Update values are missing");
    }

    const set = config.set;
    const setSql = this.buildUpdateSet(config.table, set);
    const whereSql = config.where ? yql` where ${config.where}` : undefined;

    return yql`${withSql}${updateKeyword} ${this.buildFromTable(config.table)} set ${setSql}${whereSql}${returningSql}`;
  }

  buildDeleteQuery(config: YdbDeleteConfig): SQL {
    const withSql = this.buildWithCTE(config.withList);
    const returningSql = config.returning
      ? yql` returning ${this.buildReturningSelection(config.returning)}`
      : undefined;
    const deleteKeyword = config.batch ? yql`batch delete from` : yql`delete from`;

    if (config.batch && (config.on || returningSql || withSql || (config.using && config.using.length > 0))) {
      throw new Error("YDB BATCH DELETE cannot use WITH, ON, USING, or RETURNING");
    }

    if (config.on) {
      if (config.where || (config.using && config.using.length > 0)) {
        throw new Error("YDB delete().on() cannot be combined with where() or using()");
      }

      return yql`${withSql}delete from ${this.buildFromTable(config.table)} on ${config.on}${returningSql}`;
    }

    if (config.using && config.using.length > 0) {
      const usingSql = yql.join(
        config.using.map((table) => yql`${this.buildFromTable(table)}`),
        yql`, `,
      );
      const existsWhereSql = config.where ? yql` where ${config.where}` : undefined;

      return yql`${withSql}delete from ${this.buildFromTable(config.table)} where exists (select 1 from ${usingSql}${existsWhereSql})${returningSql}`;
    }

    const whereSql = config.where ? yql` where ${config.where}` : undefined;

    return yql`${withSql}${deleteKeyword} ${this.buildFromTable(config.table)}${whereSql}${returningSql}`;
  }

  buildRelationalQueryWithoutPK({
    table,
    tableConfig,
    queryConfig: config,
    tableAlias,
    joinOn,
  }: YdbRelationalQueryConfig): YdbRelationalQueryResult {
    let where: SQL | undefined;
    let orderBy: SQL[] = [];
    let limit: number | undefined;
    let offset: number | undefined;
    let selectedColumns: string[] = [];
    const selectedExtras: Array<{ tsKey: string; field: SQL.Aliased }> = [];

    const aliasedColumns = Object.fromEntries(
      Object.entries(tableConfig.columns).map(([key, value]) => [key, aliasedTableColumn(value, tableAlias)]),
    ) as Record<string, Column>;

    if (config === true) {
      selectedColumns = Object.keys(tableConfig.columns);
    } else {
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

      if (config.extras) {
        const extras = typeof config.extras === "function"
          ? config.extras(aliasedColumns as Record<string, Column>, { sql: yql })
          : config.extras;

        for (const [tsKey, value] of Object.entries(extras)) {
          selectedExtras.push({
            tsKey,
            field: mapColumnsInAliasedSQLToAlias(value, tableAlias) as SQL.Aliased,
          });
        }
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
          throw new Error("YDB relational query limit must be a finite number");
        }
        limit = config.limit;
      }

      const offsetValue = "offset" in config ? config.offset : undefined;
      if (offsetValue !== undefined) {
        if (!isNumberValue(offsetValue)) {
          throw new Error("YDB relational query offset must be a finite number");
        }
        offset = offsetValue;
      }
    }

    if (selectedColumns.length === 0 && selectedExtras.length === 0) {
      selectedColumns = tableConfig.primaryKey.length > 0
        ? tableConfig.primaryKey
          .map((column) => Object.entries(tableConfig.columns).find(([, value]) => value === column)?.[0])
          .filter((value): value is string => !!value)
        : Object.keys(tableConfig.columns).slice(0, 1);
    }

    if (selectedColumns.length === 0 && selectedExtras.length === 0) {
      throw new DrizzleError({ message: `No fields selected for table "${tableConfig.tsName}" ("${tableAlias}")` });
    }

    const selection = [
      ...selectedColumns.map((field) => {
        const column = tableConfig.columns[field]!;
        return {
          dbKey: column.name,
          tsKey: field,
          field: aliasedTableColumn(column, tableAlias) as unknown as YdbColumn,
          relationTableTsKey: undefined,
          isJson: false,
          selection: [],
        };
      }),
      ...selectedExtras.map(({ tsKey, field }) => ({
        dbKey: field.fieldAlias,
        tsKey,
        field,
        relationTableTsKey: undefined,
        isJson: false,
        isExtra: true,
        selection: [],
      })),
    ];

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

    await session.execute(yql.raw(buildMigrationTableBootstrapSql(migrationConfig)));

    const appliedRows = await session.values<[string, number | string, string]>(
      yql.raw(buildMigrationHistorySelectSql(migrationConfig)),
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

        await session.execute(yql.raw(trimmed));
      }

      await session.execute(yql.raw(buildMigrationHistoryInsertSql({
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
