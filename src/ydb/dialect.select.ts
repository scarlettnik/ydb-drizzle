import { Column } from "drizzle-orm/column";
import { is } from "drizzle-orm/entity";
import { SQL, sql as yql, type SQLChunk, type SQLWrapper } from "drizzle-orm/sql/sql";
import { Subquery } from "drizzle-orm/subquery";
import { Table } from "drizzle-orm/table";
import { orderSelectedFields, type YdbSelectedFieldsOrdered } from "../ydb-core/result-mapping.js";
import type { YdbJoinConfig, YdbSelectConfig, YdbSetOperatorConfig } from "./dialect.types.js";

function qualifyIdentifier(tableAlias: string, columnName: string): SQL {
  return yql`${yql.identifier(tableAlias)}.${yql.identifier(columnName)}`;
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
  chunk: SQLChunk,
  fields: YdbSelectedFieldsOrdered,
  selectionAliases: string[],
  context: string,
): SQLChunk {
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

    return yql.identifier(alias);
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

      return yql.identifier(alias);
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
    return yql.raw("*");
  }

  const selection = fields.map(({ field }, index) => {
    const alias = aliases?.[index];

    if (is(field, SQL.Aliased) && (field as any).isSelectionField) {
      const base = yql.identifier(field.fieldAlias);
      return alias ? yql`${base} as ${yql.identifier(alias)}` : base;
    }

    if (is(field, SQL.Aliased)) {
      return alias
        ? yql`${field.sql} as ${yql.identifier(alias)}`
        : yql`${field.sql} as ${yql.identifier(field.fieldAlias)}`;
    }

    if (is(field, Column) || is(field, SQL) || is(field, Subquery)) {
      return alias ? yql`${field as SQLWrapper} as ${yql.identifier(alias)}` : yql`${field as SQLWrapper}`;
    }

    return alias ? yql`${field as SQLWrapper} as ${yql.identifier(alias)}` : yql`${field as SQLWrapper}`;
  });

  return yql.join(selection, yql`, `);
}

export function buildReturningSelection(fields: YdbSelectedFieldsOrdered): SQL {
  if (fields.length === 0) {
    return yql.raw("*");
  }

  const selection = fields.map(({ field }) => {
    if (is(field, SQL.Aliased) && (field as any).isSelectionField) {
      return yql.identifier(field.fieldAlias);
    }

    if (is(field, SQL.Aliased)) {
      return yql`${field.sql} as ${yql.identifier(field.fieldAlias)}`;
    }

    if (is(field, Column)) {
      return yql.identifier(field.name);
    }

    return yql`${field as SQLWrapper}`;
  });

  return yql.join(selection, yql`, `);
}

export function buildFromTable(table: unknown): SQLWrapper {
  if (is(table, Table) && (table as any)[(Table as any).Symbol.IsAlias]) {
    return yql`${yql.identifier((table as any)[(Table as any).Symbol.OriginalName])} ${yql.identifier((table as any)[(Table as any).Symbol.Name])}`;
  }

  return table as SQLWrapper;
}

export function buildJoins(joins: YdbJoinConfig[] | undefined): SQL | undefined {
  if (!joins || joins.length === 0) {
    return undefined;
  }

  const joinsSql = joins.map((join) => {
    const onSql = join.on ? yql` on ${join.on}` : undefined;
    const joinKeyword = yql.raw(`${join.joinType} join`);

    if (is(join.table, Table) && (join.table as any)[(Table as any).Symbol.IsAlias]) {
      return yql`${joinKeyword} ${yql.identifier((join.table as any)[(Table as any).Symbol.OriginalName])} ${yql.identifier((join.table as any)[(Table as any).Symbol.Name])}${onSql}`;
    }

    return yql`${joinKeyword} ${join.table as SQLWrapper}${onSql}`;
  });

  return yql` ${yql.join(joinsSql, yql` `)}`;
}

export function buildOrderBy(orderBy: SQLWrapper[] | undefined): SQL | undefined {
  if (!orderBy || orderBy.length === 0) {
    return undefined;
  }

  return yql` order by ${yql.join(orderBy.map((value) => yql`${value}`), yql`, `)}`;
}

export function buildLimit(limit: number | undefined): SQL | undefined {
  return limit !== undefined ? yql` limit ${limit}` : undefined;
}

export function buildOffset(offset: number | undefined): SQL | undefined {
  return offset !== undefined ? yql` offset ${offset}` : undefined;
}

function buildSimpleSelectQuery(
  config: Omit<YdbSelectConfig, "table" | "fields" | "fieldsFlat" | "setOperators"> & {
    table?: unknown;
    fieldsFlat: YdbSelectedFieldsOrdered;
    extraSelections?: SQL[];
  },
): SQL {
  const selection = buildSelection(config.fieldsFlat, config.selectionAliases);
  const allSelections = config.extraSelections && config.extraSelections.length > 0
    ? yql`${selection}, ${yql.join(config.extraSelections, yql`, `)}`
    : selection;
  const joinsSql = buildJoins(config.joins);
  const whereSql = config.where ? yql` where ${config.where}` : undefined;
  const groupBySql = config.groupBy && config.groupBy.length > 0
    ? yql` group by ${yql.join(config.groupBy.map((value) => yql`${value}`), yql`, `)}`
    : undefined;
  const havingSql = config.having ? yql` having ${config.having}` : undefined;
  const orderBySql = buildOrderBy(config.orderBy);
  const limitSql = buildLimit(config.limit);
  const offsetSql = buildOffset(config.offset);
  const distinctSql = config.distinct ? yql` distinct` : undefined;
  const fromSql = config.table === undefined ? undefined : yql` from ${buildFromTable(config.table)}`;

  return yql`select${distinctSql} ${allSelections}${fromSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}`;
}

function buildDistinctOnQuery(config: YdbSelectConfig, fieldsFlat: YdbSelectedFieldsOrdered, selectionAliases: string[]): SQL {
  if (!config.distinctOn || config.distinctOn.length === 0) {
    throw new Error("YDB distinctOn() requires at least one expression");
  }

  const distinctAlias = "__ydb_distinct_on";
  const rowNumberAlias = "__ydb_row_number";
  const rowNumberSelection = yql`row_number() over (
      partition by ${yql.join(config.distinctOn.map((value) => yql`${value}`), yql`, `)}
      ${buildOrderBy(config.orderBy)}
    ) as ${yql.identifier(rowNumberAlias)}`;

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
  const selection = yql.join(selectionAliases.map((alias) => yql.identifier(alias)), yql`, `);
  const rowNumberFilter = yql`${qualifyIdentifier(distinctAlias, rowNumberAlias)} = 1`;

  return yql`select ${selection} from (${innerQuery}) as ${yql.identifier(distinctAlias)} where ${rowNumberFilter}${buildOrderBy(outerOrderBy)}${buildLimit(config.limit)}${buildOffset(config.offset)}`;
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
  const matchAlias = "__ydb_match";
  const rightInputAlias = "__ydb_right_input";
  const rightSelection = yql.join(
    selectionAliases.map((alias) => yql`${qualifyIdentifier(rightInputAlias, alias)} as ${yql.identifier(alias)}`),
    yql`, `,
  );
  const rightComparable = yql`select ${rightSelection}, 1 as ${yql.identifier(matchAlias)} from (${rightSelect}) as ${yql.identifier(rightInputAlias)}`;
  const joinConditions = selectionAliases.map((alias) => {
    const leftValue = qualifyIdentifier(leftAlias, alias);
    const rightValue = qualifyIdentifier(rightAlias, alias);
    return yql`(${leftValue} = ${rightValue} or (${leftValue} is null and ${rightValue} is null))`;
  });
  const onSql = yql.join(joinConditions, yql` and `);
  const selection = yql.join(
    selectionAliases.map((alias) => yql`${qualifyIdentifier(leftAlias, alias)} as ${yql.identifier(alias)}`),
    yql`, `,
  );
  const joinSql = type === "intersect"
    ? yql`inner join (${rightComparable}) as ${yql.identifier(rightAlias)} on ${onSql}`
    : yql`left join (${rightComparable}) as ${yql.identifier(rightAlias)} on ${onSql}`;
  const whereSql = type === "except"
    ? yql` where ${qualifyIdentifier(rightAlias, matchAlias)} is null`
    : undefined;

  return yql`select distinct ${selection} from (${leftSelect}) as ${yql.identifier(leftAlias)} ${joinSql}${whereSql}${buildOrderBy(orderBy)}${buildLimit(limit)}${buildOffset(offset)}`;
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
    const operator = yql.raw(`union${setOperator.isAll ? " all" : ""}`);
    return yql`${leftSelect} ${operator} ${rightSelect}${buildOrderBy(mappedOrderBy)}${buildLimit(setOperator.limit)}${buildOffset(setOperator.offset)}`;
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
