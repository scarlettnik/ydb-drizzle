import { CasingCache } from "drizzle-orm/casing";
import { entityKind } from "drizzle-orm/entity";
import type { QueryTypingsValue, QueryWithTypings, SQL } from "drizzle-orm/sql/sql";
import type { Casing } from "drizzle-orm/utils";

export interface YdbDialectConfig {
  casing?: Casing;
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

  prepareTyping(): QueryTypingsValue {
    return "none";
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
