import type { SQL, SQLWrapper } from "drizzle-orm/sql/sql";
import type { YdbSelectedFieldsOrdered } from "../ydb-core/result-mapping.js";

export type YdbJoinType = "inner" | "left" | "right" | "full" | "cross";

export interface YdbJoinConfig {
  table: unknown;
  joinType: YdbJoinType;
  alias?: string;
  on?: SQL;
}

export interface YdbSetOperatorSource {
  getSelectedFields(): Record<string, unknown>;
  getSQL(selectionAliases?: string[]): SQL;
}

export interface YdbSetOperatorConfig {
  type: "union" | "intersect" | "except";
  isAll: boolean;
  rightSelect: YdbSetOperatorSource;
  orderBy?: SQLWrapper[];
  limit?: number;
  offset?: number;
}

export interface YdbSelectConfig {
  table: unknown;
  fields: Record<string, unknown>;
  fieldsFlat?: YdbSelectedFieldsOrdered;
  joins?: YdbJoinConfig[];
  where?: SQL;
  groupBy?: SQLWrapper[];
  having?: SQL;
  orderBy?: SQLWrapper[];
  limit?: number;
  offset?: number;
  distinct?: boolean;
  distinctOn?: SQLWrapper[];
  selectionAliases?: string[];
  setOperators: YdbSetOperatorConfig[];
}
