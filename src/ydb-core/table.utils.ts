import { is } from "drizzle-orm/entity";
import { Table } from "drizzle-orm/table";
import type { YdbColumn } from "./columns/common.js";
import { YdbIndexBuilder, type YdbIndex } from "./indexes.js";
import { YdbPrimaryKeyBuilder, type YdbPrimaryKey } from "./primary-keys.js";
import { YdbTable, type YdbTableExtraConfigValue, type YdbTableWithColumns } from "./table.js";
import { YdbUniqueConstraintBuilder, type YdbUniqueConstraint } from "./unique-constraint.js";
const drizzleTableSymbol = (Table as any).Symbol;

export interface YdbTableRuntimeConfig {
  readonly name: string;
  readonly columns: readonly YdbColumn[];
  readonly indexes: readonly YdbIndex[];
  readonly primaryKeys: readonly YdbPrimaryKey[];
  readonly uniqueConstraints: readonly YdbUniqueConstraint[];
}

function normalizeExtraConfig(
  extraConfig: YdbTableExtraConfigValue[] | Record<string, YdbTableExtraConfigValue> | undefined,
): YdbTableExtraConfigValue[] {
  if (!extraConfig) {
    return [];
  }

  if (Array.isArray(extraConfig)) {
    return extraConfig.flat(1) as YdbTableExtraConfigValue[];
  }

  return Object.values(extraConfig);
}

export function getTableConfig(table: YdbTableWithColumns): YdbTableRuntimeConfig {
  const columns = Object.values((table as any)[YdbTable.Symbol.Columns] ?? {}) as YdbColumn[];
  const indexes: YdbIndex[] = [];
  const primaryKeys: YdbPrimaryKey[] = [];
  const uniqueConstraints: YdbUniqueConstraint[] = [];

  const extraConfigBuilder = (table as any)[YdbTable.Symbol.ExtraConfigBuilder] as
    | ((self: YdbTableWithColumns) => YdbTableExtraConfigValue[] | Record<string, YdbTableExtraConfigValue>)
    | undefined;

  const extraValues = normalizeExtraConfig(extraConfigBuilder?.(table));
  for (const builder of extraValues) {
    if (is(builder, YdbIndexBuilder)) {
      indexes.push(builder.build(table));
    } else if (is(builder, YdbPrimaryKeyBuilder)) {
      primaryKeys.push(builder.build(table));
    } else if (is(builder, YdbUniqueConstraintBuilder)) {
      uniqueConstraints.push(builder.build(table));
    }
  }

  for (const column of columns) {
    if (!column.isUnique) {
      continue;
    }

    const hasTableLevelDuplicate = uniqueConstraints.some((constraint) =>
      constraint.config.columns.length === 1 && constraint.config.columns[0] === column,
    );

    if (hasTableLevelDuplicate) {
      continue;
    }

    uniqueConstraints.push(new YdbUniqueConstraintBuilder(column.uniqueName, [column]).build(table));
  }

  return {
    name: (table as any)[drizzleTableSymbol.Name] as string,
    columns,
    indexes,
    primaryKeys,
    uniqueConstraints,
  };
}
