import { entityKind, is } from "drizzle-orm/entity";
import { QueryPromise } from "drizzle-orm/query-promise";
import { SQL, type SQLWrapper } from "drizzle-orm/sql/sql";
import { haveSameKeys } from "drizzle-orm/utils";
import { mapResultRow, orderSelectedFields } from "../result-mapping.js";
import type { YdbPreparedQueryConfig, YdbSession } from "../session.js";
import { YdbDialect } from "../../ydb/dialect.js";
import type { YdbJoinType, YdbSelectConfig, YdbSetOperatorConfig, YdbSetOperatorSource } from "../../ydb/dialect.types.js";
import { getSetOperatorHelpers } from "./select.set-operators.js";
import type { SelectConfigWithTable, SelectFields, YdbSelectBuilderOptions } from "./select.types.js";
import {
  createSelectionProxy,
  getSourceSelection,
  getTableLikeName,
  normalizeCountValue,
  normalizeSqlWrapperArray,
} from "./select.utils.js";

export class YdbSelectBuilder<TResult = unknown[]> extends QueryPromise<TResult> implements YdbSetOperatorSource {
  static readonly [entityKind] = "YdbSelectBuilder";

  private readonly session: YdbSession;
  private readonly dialect: YdbDialect;
  private readonly config: Omit<YdbSelectConfig, "table"> & { table?: unknown };
  private readonly isPartialSelect: boolean;
  private joinsNotNullableMap: Record<string, boolean> = {};
  private tableName?: string;
  private usedInSetOperation = false;

  constructor(
    session: YdbSession,
    fields?: SelectFields,
  );
  constructor(
    session: YdbSession,
    dialect: YdbDialect,
    fields?: SelectFields,
    options?: YdbSelectBuilderOptions,
  );
  constructor(
    session: YdbSession,
    dialectOrFields?: YdbDialect | SelectFields,
    fieldsOrUndefined?: SelectFields,
    options: YdbSelectBuilderOptions = {},
  ) {
    super();
    this.session = session;

    if (dialectOrFields instanceof YdbDialect) {
      this.dialect = dialectOrFields;
      this.isPartialSelect = fieldsOrUndefined !== undefined;
      this.config = {
        table: undefined,
        fields: fieldsOrUndefined ? { ...fieldsOrUndefined } : {},
        distinct: options.distinct,
        distinctOn: options.distinctOn,
        setOperators: [],
      };
      return;
    }

    this.dialect = new YdbDialect();
    this.isPartialSelect = dialectOrFields !== undefined;
    this.config = {
      table: undefined,
      fields: dialectOrFields ? { ...(dialectOrFields as SelectFields) } : {},
      distinct: false,
      distinctOn: undefined,
      setOperators: [],
    };
  }

  private requireTable(): unknown {
    if (!this.config.table) {
      throw new Error("Missing table in select().from()");
    }

    return this.config.table;
  }

  private requireConfigWithTable(): SelectConfigWithTable {
    const table = this.requireTable();

    if (Object.keys(this.config.fields).length === 0) {
      throw new Error("YDB select() selected zero columns");
    }

    return {
      ...this.config,
      table,
    };
  }

  private markUsedInSetOperation(): void {
    this.usedInSetOperation = true;
  }

  private shouldUseSelectionAliases(): boolean {
    return this.usedInSetOperation
      || (this.config.joins?.length ?? 0) > 0
      || (this.config.distinctOn?.length ?? 0) > 0;
  }

  private getOrderedFields() {
    return orderSelectedFields(this.getSelectedFields());
  }

  private getSelectionAliases(fields = this.getOrderedFields()): string[] | undefined {
    return this.shouldUseSelectionAliases() ? this.dialect.getSelectionAliases(fields) : undefined;
  }

  private getTargetConfigForTailClauses(): YdbSetOperatorConfig | Omit<YdbSelectConfig, "table"> & { table?: unknown } {
    return this.config.setOperators[this.config.setOperators.length - 1] ?? this.config;
  }

  private createJoin(joinType: YdbJoinType) {
    return (table: unknown, on?: SQL | ((fields: SelectFields) => SQL)) => {
      const baseTableName = this.tableName;
      const tableName = getTableLikeName(table);

      if (typeof tableName === "string" && this.config.joins?.some((join) => join.alias === tableName)) {
        throw new Error(`Alias "${tableName}" is already used in this query`);
      }

      if (!this.isPartialSelect) {
        if (Object.keys(this.joinsNotNullableMap).length === 1 && typeof baseTableName === "string") {
          this.config.fields = {
            [baseTableName]: this.config.fields,
          };
        }

        if (typeof tableName === "string" && !is(table, SQL)) {
          this.config.fields[tableName] = getSourceSelection(table);
        }
      }

      const resolvedOn = typeof on === "function" ? on(createSelectionProxy(this.config.fields, "sql")) : on;

      if (!this.config.joins) {
        this.config.joins = [];
      }

      this.config.joins.push({ table, joinType, alias: tableName, on: resolvedOn });

      if (typeof tableName === "string") {
        switch (joinType) {
          case "left":
            this.joinsNotNullableMap[tableName] = false;
            break;
          case "right":
            this.joinsNotNullableMap = Object.fromEntries(
              Object.keys(this.joinsNotNullableMap).map((key) => [key, false]),
            );
            this.joinsNotNullableMap[tableName] = true;
            break;
          case "full":
            this.joinsNotNullableMap = Object.fromEntries(
              Object.keys(this.joinsNotNullableMap).map((key) => [key, false]),
            );
            this.joinsNotNullableMap[tableName] = false;
            break;
          case "inner":
          case "cross":
            this.joinsNotNullableMap[tableName] = true;
            break;
        }
      }

      return this;
    };
  }

  private createSetOperator(type: "union" | "intersect" | "except", isAll: boolean) {
    return (rightSelection: YdbSetOperatorSource | ((operators: ReturnType<typeof getSetOperatorHelpers>) => YdbSetOperatorSource)) => {
      const rightSelect = typeof rightSelection === "function" ? rightSelection(getSetOperatorHelpers()) : rightSelection;

      if (!haveSameKeys(this.getSelectedFields(), rightSelect.getSelectedFields())) {
        throw new Error("Set operator error (union / intersect / except): selected fields are not the same or are in a different order");
      }

      this.markUsedInSetOperation();
      if ("markUsedInSetOperation" in rightSelect && typeof (rightSelect as any).markUsedInSetOperation === "function") {
        (rightSelect as any).markUsedInSetOperation();
      }

      this.config.setOperators.push({
        type,
        isAll,
        rightSelect,
      });

      return this;
    };
  }

  from(source: unknown): this {
    this.config.table = source;
    this.tableName = getTableLikeName(source);

    if (!this.isPartialSelect) {
      this.config.fields = getSourceSelection(source);
    }

    this.joinsNotNullableMap = typeof this.tableName === "string" ? { [this.tableName]: true } : {};
    return this;
  }

  getSelectedFields(): SelectFields {
    return this.config.fields;
  }

  where(where: SQL | ((fields: SelectFields) => SQL) | undefined): this {
    this.config.where = typeof where === "function" ? where(createSelectionProxy(this.config.fields, "sql")) : where ?? undefined;
    return this;
  }

  having(having: SQL | ((fields: SelectFields) => SQL) | undefined): this {
    this.config.having = typeof having === "function" ? having(createSelectionProxy(this.config.fields, "sql")) : having ?? undefined;
    return this;
  }

  groupBy(...columns: SQLWrapper[] | [(fields: SelectFields) => SQLWrapper | SQLWrapper[]]): this {
    if (typeof columns[0] === "function") {
      const groupBy = columns[0](createSelectionProxy(this.config.fields, "alias"));
      this.config.groupBy = Array.isArray(groupBy) ? groupBy : [groupBy];
      return this;
    }

    this.config.groupBy = columns as SQLWrapper[];
    return this;
  }

  orderBy(...columns: SQLWrapper[] | [(fields: SelectFields) => SQLWrapper | SQLWrapper[]]): this {
    const target = this.getTargetConfigForTailClauses();

    if (typeof columns[0] === "function") {
      const orderBy = columns[0](createSelectionProxy(this.config.fields, "alias"));
      (target as YdbSetOperatorConfig | typeof this.config).orderBy = Array.isArray(orderBy) ? orderBy : [orderBy];
      return this;
    }

    (target as YdbSetOperatorConfig | typeof this.config).orderBy = columns as SQLWrapper[];
    return this;
  }

  limit(limit: number): this {
    const target = this.getTargetConfigForTailClauses();
    (target as YdbSetOperatorConfig | typeof this.config).limit = normalizeCountValue(limit, "limit");
    return this;
  }

  offset(offset: number): this {
    const target = this.getTargetConfigForTailClauses();
    (target as YdbSetOperatorConfig | typeof this.config).offset = normalizeCountValue(offset, "offset");
    return this;
  }

  distinct(): this {
    if (this.config.distinctOn && this.config.distinctOn.length > 0) {
      throw new Error("YDB select() cannot combine distinct() and distinctOn()");
    }

    this.config.distinct = true;
    return this;
  }

  distinctOn(...values: SQLWrapper[] | [SQLWrapper[]]): this {
    if (this.config.distinct) {
      throw new Error("YDB select() cannot combine distinct() and distinctOn()");
    }

    const resolved = normalizeSqlWrapperArray(values[0] as SQLWrapper[] | SQLWrapper | undefined);
    if (!resolved || resolved.length === 0) {
      throw new Error("YDB distinctOn() requires at least one expression");
    }

    this.config.distinctOn = resolved;
    return this;
  }

  innerJoin = this.createJoin("inner");
  leftJoin = this.createJoin("left");
  rightJoin = this.createJoin("right");
  fullJoin = this.createJoin("full");
  crossJoin = this.createJoin("cross");

  union = this.createSetOperator("union", false);
  unionAll = this.createSetOperator("union", true);
  intersect = this.createSetOperator("intersect", false);
  except = this.createSetOperator("except", false);

  addSetOperators(setOperators: YdbSetOperatorConfig[]): this {
    this.markUsedInSetOperation();

    for (const setOperator of setOperators) {
      if ("markUsedInSetOperation" in setOperator.rightSelect && typeof (setOperator.rightSelect as any).markUsedInSetOperation === "function") {
        (setOperator.rightSelect as any).markUsedInSetOperation();
      }
    }

    this.config.setOperators.push(...setOperators);
    return this;
  }

  getSQL(selectionAliases?: string[]): SQL {
    const config = this.requireConfigWithTable();
    const fieldsFlat = orderSelectedFields(config.fields);
    const aliases = selectionAliases ?? this.getSelectionAliases(fieldsFlat);

    return this.dialect.buildSelectQuery({
      ...config,
      fieldsFlat,
      selectionAliases: aliases,
    });
  }

  toSQL() {
    const prepared = this.session.prepareQuery<YdbPreparedQueryConfig>(this.getSQL(), this.getOrderedFields());
    const { typings: _typings, ...query } = prepared.getQuery();
    return query;
  }

  prepare(name?: string) {
    const orderedFields = this.getOrderedFields();
    const joinsNotNullableMap = Object.keys(this.joinsNotNullableMap).length > 0 ? this.joinsNotNullableMap : undefined;
    const resultMapper = (rows: unknown[][]) => rows.map((row) => mapResultRow(orderedFields, row, joinsNotNullableMap));

    return this.session.prepareQuery<YdbPreparedQueryConfig & { execute: TResult; all: TResult }>(
      this.getSQL(),
      orderedFields,
      name,
      true,
      resultMapper as any,
    );
  }

  override execute(): Promise<TResult> {
    return this.prepare().execute() as Promise<TResult>;
  }
}
