import { Column } from "drizzle-orm/column";
import { is } from "drizzle-orm/entity";
import { SQL, sql, type SQLWrapper } from "drizzle-orm/sql/sql";
import { Subquery } from "drizzle-orm/subquery";
import { Table } from "drizzle-orm/table";
import { orderSelectedFields, type YdbSelectedFieldsOrdered } from "../ydb-core/result-mapping.js";
import type { YdbJoinConfig, YdbSelectConfig, YdbSetOperatorConfig } from "./dialect.types.js";

function qualifyIdentifier(tableAlias: string, columnName: string): SQL {
  return sql`${sql.identifier(tableAlias)}.${sql.identifier(columnName)}`;
}

function findSelectionAlias(
  value: unknown,
  fields: YdbSelectedFieldsOrdered,
  selectionAliases: string[],
): string | undefined {
  const foundIndex = fields.findIndex(({ path, field }) => {
    if (field === value) {
      return true;
    }

    if (is(value, SQL.Aliased)) {
      if (is(field, SQL.Aliased) && field.fieldAlias === value.fieldAlias) {
        return true;
      }

      return path[path.length - 1] === value.fieldAlias;
    }

    return false;
  });

  return foundIndex >= 0 ? selectionAliases[foundIndex] : undefined;
}

function mapChunkToSelectionAlias(
  chunk: unknown,
  fields: YdbSelectedFieldsOrdered,
  selectionAliases: string[],
  context: string,
): unknown {
  if (is(chunk, SQL)) {
    return new SQL(
      chunk.queryChunks.map((value) => mapChunkToSelectionAlias(value, fields, selectionAliases, context)),
    );
  }

  if (is(chunk, Column) || is(chunk, SQL.Aliased)) {
    const alias = findSelectionAlias(chunk, fields, selectionAliases);

    if (!alias) {
      throw new Error(`YDB ${context} can only reference selected fields`);
    }

    return sql.identifier(alias);
  }

  return chunk;
}

export function getSelectionAliases(fields: YdbSelectedFieldsOrdered): string[] {
  return fields.map((_, index) => `__ydb_f${index}`);
}

export function mapExpressionsToSelectionAliases(
  expressions: SQLWrapper[],
  fields: YdbSelectedFieldsOrdered,
  selectionAliases: string[],
  context: string,
): SQLWrapper[] {
  return expressions.map((expression) => {
    if (is(expression, Column) || is(expression, SQL.Aliased)) {
      const alias = findSelectionAlias(expression, fields, selectionAliases);

      if (!alias) {
        throw new Error(`YDB ${context} can only reference selected fields`);
      }

      return sql.identifier(alias);
    }

    if (is(expression, SQL)) {
      return new SQL(
        expression.queryChunks.map((chunk) => mapChunkToSelectionAlias(chunk, fields, selectionAliases, context)),
      );
    }

    return expression;
  });
}

export function buildSelection(fields: YdbSelectedFieldsOrdered, aliases?: string[]): SQL {
  if (fields.length === 0) {
    return sql.raw("*");
  }

  const selection = fields.map(({ field }, index) => {
    const alias = aliases?.[index];

    if (is(field, SQL.Aliased) && (field as any).isSelectionField) {
      const base = sql.identifier(field.fieldAlias);
      return alias ? sql`${base} as ${sql.identifier(alias)}` : base;
    }

    if (is(field, SQL.Aliased)) {
      return alias
        ? sql`${field.sql} as ${sql.identifier(alias)}`
        : sql`${field.sql} as ${sql.identifier(field.fieldAlias)}`;
    }

    if (is(field, Column) || is(field, SQL) || is(field, Subquery)) {
      return alias ? sql`${field as SQLWrapper} as ${sql.identifier(alias)}` : sql`${field as SQLWrapper}`;
    }

    return alias ? sql`${field as SQLWrapper} as ${sql.identifier(alias)}` : sql`${field as SQLWrapper}`;
  });

  return sql.join(selection, sql`, `);
}

export function buildFromTable(table: unknown): SQLWrapper {
  if (is(table, Table) && (table as any)[(Table as any).Symbol.IsAlias]) {
    return sql`${sql.identifier((table as any)[(Table as any).Symbol.OriginalName])} ${sql.identifier((table as any)[(Table as any).Symbol.Name])}`;
  }

  return table as SQLWrapper;
}

export function buildJoins(joins: YdbJoinConfig[] | undefined): SQL | undefined {
  if (!joins || joins.length === 0) {
    return undefined;
  }

  const joinsSql = joins.map((join) => {
    const onSql = join.on ? sql` on ${join.on}` : undefined;
    const joinKeyword = sql.raw(`${join.joinType} join`);

    if (is(join.table, Table) && (join.table as any)[(Table as any).Symbol.IsAlias]) {
      return sql`${joinKeyword} ${sql.identifier((join.table as any)[(Table as any).Symbol.OriginalName])} ${sql.identifier((join.table as any)[(Table as any).Symbol.Name])}${onSql}`;
    }

    return sql`${joinKeyword} ${join.table as SQLWrapper}${onSql}`;
  });

  return sql` ${sql.join(joinsSql, sql` `)}`;
}

export function buildOrderBy(orderBy: SQLWrapper[] | undefined): SQL | undefined {
  if (!orderBy || orderBy.length === 0) {
    return undefined;
  }

  return sql` order by ${sql.join(orderBy.map((value) => sql`${value}`), sql`, `)}`;
}

export function buildLimit(limit: number | undefined): SQL | undefined {
  return limit !== undefined ? sql` limit ${limit}` : undefined;
}

export function buildOffset(offset: number | undefined): SQL | undefined {
  return offset !== undefined ? sql` offset ${offset}` : undefined;
}

function buildSimpleSelectQuery(
  config: Omit<YdbSelectConfig, "table" | "fields" | "fieldsFlat" | "setOperators"> & {
    table: unknown;
    fieldsFlat: YdbSelectedFieldsOrdered;
    extraSelections?: SQL[];
  },
): SQL {
  const selection = buildSelection(config.fieldsFlat, config.selectionAliases);
  const allSelections = config.extraSelections && config.extraSelections.length > 0
    ? sql`${selection}, ${sql.join(config.extraSelections, sql`, `)}`
    : selection;
  const joinsSql = buildJoins(config.joins);
  const whereSql = config.where ? sql` where ${config.where}` : undefined;
  const groupBySql = config.groupBy && config.groupBy.length > 0
    ? sql` group by ${sql.join(config.groupBy.map((value) => sql`${value}`), sql`, `)}`
    : undefined;
  const havingSql = config.having ? sql` having ${config.having}` : undefined;
  const orderBySql = buildOrderBy(config.orderBy);
  const limitSql = buildLimit(config.limit);
  const offsetSql = buildOffset(config.offset);
  const distinctSql = config.distinct ? sql` distinct` : undefined;

  return sql`select${distinctSql} ${allSelections} from ${buildFromTable(config.table)}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}`;
}

function buildDistinctOnQuery(config: YdbSelectConfig, fieldsFlat: YdbSelectedFieldsOrdered, selectionAliases: string[]): SQL {
  if (!config.distinctOn || config.distinctOn.length === 0) {
    throw new Error("YDB distinctOn() requires at least one expression");
  }

  const distinctAlias = "__ydb_distinct_on";
  const rowNumberAlias = "__ydb_row_number";
  const rowNumberSelection = sql`row_number() over (
      partition by ${sql.join(config.distinctOn.map((value) => sql`${value}`), sql`, `)}
      ${buildOrderBy(config.orderBy)}
    ) as ${sql.identifier(rowNumberAlias)}`;

  const innerQuery = buildSimpleSelectQuery({
    table: config.table,
    fieldsFlat,
    joins: config.joins,
    where: config.where,
    groupBy: config.groupBy,
    having: config.having,
    distinct: false,
    selectionAliases,
    extraSelections: [rowNumberSelection],
  });

  const outerOrderBy = config.orderBy && config.orderBy.length > 0
    ? mapExpressionsToSelectionAliases(config.orderBy, fieldsFlat, selectionAliases, "distinctOn() orderBy()")
    : undefined;
  const selection = sql.join(selectionAliases.map((alias) => sql.identifier(alias)), sql`, `);
  const rowNumberFilter = sql`${qualifyIdentifier(distinctAlias, rowNumberAlias)} = 1`;

  return sql`select ${selection} from (${innerQuery}) as ${sql.identifier(distinctAlias)} where ${rowNumberFilter}${buildOrderBy(outerOrderBy)}${buildLimit(config.limit)}${buildOffset(config.offset)}`;
}

function buildEmulatedSetOperationQuery(
  type: "intersect" | "except",
  leftSelect: SQL,
  rightSelect: SQL,
  selectionAliases: string[],
  orderBy: SQLWrapper[] | undefined,
  limit: number | undefined,
  offset: number | undefined,
): SQL {
  const leftAlias = "__ydb_left";
  const rightAlias = "__ydb_right";
  const joinConditions = selectionAliases.map((alias) => sql`${qualifyIdentifier(leftAlias, alias)} = ${qualifyIdentifier(rightAlias, alias)}`);
  const onSql = sql.join(joinConditions, sql` and `);
  const selection = sql.join(
    selectionAliases.map((alias) => sql`${qualifyIdentifier(leftAlias, alias)} as ${sql.identifier(alias)}`),
    sql`, `,
  );
  const joinSql = type === "intersect"
    ? sql`inner join (${rightSelect}) as ${sql.identifier(rightAlias)} on ${onSql}`
    : sql`left join (${rightSelect}) as ${sql.identifier(rightAlias)} on ${onSql}`;
  const whereSql = type === "except"
    ? sql` where ${sql.join(
      selectionAliases.map((alias) => sql`${qualifyIdentifier(rightAlias, alias)} is null`),
      sql` and `,
    )}`
    : undefined;

  return sql`select distinct ${selection} from (${leftSelect}) as ${sql.identifier(leftAlias)} ${joinSql}${whereSql}${buildOrderBy(orderBy)}${buildLimit(limit)}${buildOffset(offset)}`;
}

export function buildSetOperationQuery(
  leftSelect: SQL,
  fields: YdbSelectedFieldsOrdered,
  selectionAliases: string[],
  setOperator: YdbSetOperatorConfig,
): SQL {
  const rightSelect = setOperator.rightSelect.getSQL(selectionAliases);
  const mappedOrderBy = setOperator.orderBy && setOperator.orderBy.length > 0
    ? mapExpressionsToSelectionAliases(
      setOperator.orderBy,
      fields,
      selectionAliases,
      `${setOperator.type}() orderBy()`,
    )
    : undefined;

  if (setOperator.type === "union") {
    const operator = sql.raw(`union${setOperator.isAll ? " all" : ""}`);
    return sql`${leftSelect} ${operator} ${rightSelect}${buildOrderBy(mappedOrderBy)}${buildLimit(setOperator.limit)}${buildOffset(setOperator.offset)}`;
  }

  return buildEmulatedSetOperationQuery(
    setOperator.type,
    leftSelect,
    rightSelect,
    selectionAliases,
    mappedOrderBy,
    setOperator.limit,
    setOperator.offset,
  );
}

export function buildSetOperations(
  leftSelect: SQL,
  fields: YdbSelectedFieldsOrdered,
  selectionAliases: string[],
  setOperators: YdbSetOperatorConfig[],
): SQL {
  return setOperators.reduce(
    (current, setOperator) => buildSetOperationQuery(current, fields, selectionAliases, setOperator),
    leftSelect,
  );
}

export function buildSelectQuery(config: YdbSelectConfig): SQL {
  const fieldsFlat = config.fieldsFlat ?? orderSelectedFields(config.fields);
  const selectionAliases = config.selectionAliases;
  const baseQuery = config.distinctOn && config.distinctOn.length > 0
    ? buildDistinctOnQuery(config, fieldsFlat, selectionAliases ?? getSelectionAliases(fieldsFlat))
    : buildSimpleSelectQuery({
      table: config.table,
      fieldsFlat,
      joins: config.joins,
      where: config.where,
      groupBy: config.groupBy,
      having: config.having,
      orderBy: config.orderBy,
      limit: config.limit,
      offset: config.offset,
      distinct: config.distinct,
      selectionAliases,
    });

  if (config.setOperators.length === 0) {
    return baseQuery;
  }

  return buildSetOperations(
    baseQuery,
    fieldsFlat,
    selectionAliases ?? getSelectionAliases(fieldsFlat),
    config.setOperators,
  );
}
