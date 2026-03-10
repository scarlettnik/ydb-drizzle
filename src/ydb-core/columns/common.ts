import type { ColumnBuilderBaseConfig, ColumnBuilderExtraConfig, ColumnBuilderRuntimeConfig, ColumnDataType } from "drizzle-orm/column-builder";
import { ColumnBuilder } from "drizzle-orm/column-builder";
import type { ColumnBaseConfig, ColumnRuntimeConfig } from "drizzle-orm/column";
import { Column } from "drizzle-orm/column";
import { entityKind } from "drizzle-orm/entity";
import type { SQL } from "drizzle-orm/sql/sql";
import type { Table } from "drizzle-orm/table";

export type YdbColumnBuilderBase = YdbColumnBuilder<any, any, any, any>;

export class YdbColumnBuilder<
  T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
  TRuntimeConfig extends object = object,
  TTypeConfig extends object = object,
  TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
> extends ColumnBuilder<T, TRuntimeConfig, TTypeConfig, TExtraConfig> {
  static readonly [entityKind]: string = "YdbColumnBuilder";

  generatedAlwaysAs(
    as: SQL | this["_"]["data"] | (() => SQL),
    _config?: { mode?: "virtual" | "stored" },
  ): any {
    this.config.generated = { as, type: "always", mode: _config?.mode ?? "virtual" };
    return this as any;
  }

  build<TTable extends Table>(table: TTable): YdbColumn {
    return new YdbColumn(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
  }
}

export class YdbColumn<
  T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
  TRuntimeConfig extends object = object,
  TTypeConfig extends object = object,
> extends Column<T, TRuntimeConfig, TTypeConfig> {
  static readonly [entityKind]: string = "YdbColumn";

  constructor(table: Table, config: ColumnRuntimeConfig<T["data"], TRuntimeConfig>) {
    super(table, config);
  }

  getSQLType(): string {
    return "unknown";
  }

  mapFromDriverValue(value: T["driverParam"]): T["data"] {
    return super.mapFromDriverValue(value) as T["data"];
  }

  mapToDriverValue(value: T["data"]): T["driverParam"] {
    return super.mapToDriverValue(value) as T["driverParam"];
  }
}
