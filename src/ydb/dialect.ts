import { CasingCache } from "drizzle-orm/casing";
import { entityKind } from "drizzle-orm/entity";
import type { QueryTypingsValue, QueryWithTypings, SQL } from "drizzle-orm/sql/sql";
import type { Casing } from "drizzle-orm/utils";
import {
  buildFromTable,
  buildJoins,
  buildLimit,
  buildOffset,
  buildOrderBy,
  buildSelectQuery,
  buildSelection,
  buildSetOperationQuery,
  buildSetOperations,
  getSelectionAliases,
  mapExpressionsToSelectionAliases,
} from "./dialect.select.js";
import type { YdbSelectConfig } from "./dialect.types.js";
import type { YdbJoinConfig, YdbSetOperatorConfig } from "./dialect.types.js";
import type { YdbSelectedFieldsOrdered } from "../ydb-core/result-mapping.js";

export interface YdbDialectConfig {
  casing?: Casing;
}

export { type YdbJoinConfig, type YdbJoinType, type YdbSelectConfig, type YdbSetOperatorConfig, type YdbSetOperatorSource } from "./dialect.types.js";

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

  prepareTyping(): QueryTypingsValue {
    return "none";
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

  sqlToQuery(sql: SQL, invokeSource?: "indexes"): QueryWithTypings {
    return sql.toQuery({
      casing: this.casing,
      escapeName: this.escapeName,
      escapeParam: this.escapeParam,
      escapeString: this.escapeString,
      prepareTyping: this.prepareTyping,
      invokeSource,
    });
  }
}
