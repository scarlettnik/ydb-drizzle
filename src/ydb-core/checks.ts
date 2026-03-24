import { entityKind } from "drizzle-orm/entity";
import type { SQL } from "drizzle-orm/sql/sql";
import type { YdbTable } from "./table.js";

export interface YdbCheckConfig {
  readonly table: YdbTable;
  readonly name: string;
  readonly value: SQL;
}

export class YdbCheckBuilder {
  static readonly [entityKind] = "YdbCheckBuilder";

  constructor(
    private readonly name: string,
    private readonly value: SQL,
  ) {}

  build(table: YdbTable): YdbCheck {
    return new YdbCheck({
      table,
      name: this.name,
      value: this.value,
    });
  }
}

export class YdbCheck {
  static readonly [entityKind] = "YdbCheck";

  constructor(readonly config: YdbCheckConfig) {}
}

export function check(name: string, value: SQL): YdbCheckBuilder {
  return new YdbCheckBuilder(name, value);
}
