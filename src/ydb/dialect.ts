import { PgDialect } from "drizzle-orm/pg-core/dialect";

export class YdbDialect extends PgDialect {
  override escapeName(name: string): string {
    return `\`${name.replace(/`/g, "``")}\``;
  }

  override escapeParam(num: number): string {
    return `$p${num}`;
  }

  override async migrate(): Promise<never> {
    throw new Error(
      "Use manual migrations or a dedicated YDB migration flow.",
    );
  }
}
