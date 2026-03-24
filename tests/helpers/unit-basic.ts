import { integer, text, ydbTable, YdbDialect } from "../../src/index.js";

export const dialect = new YdbDialect();
export const session = {} as any;

export const users = ydbTable("users", {
  id: integer("id").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at").$defaultFn(() => 100),
  updatedAt: integer("updated_at").$onUpdateFn(() => 200),
});

export const posts = ydbTable("posts", {
  id: integer("id").notNull(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
});

export function createMockSession() {
  const prepareCalls: Array<{
    name?: string;
    isResponseInArrayMode: boolean;
    query: { sql: string; params: unknown[]; typings?: unknown[] };
    fields: unknown;
  }> = [];

  return {
    prepareCalls,
    session: {
      prepareQuery(query: any, fields: unknown, name?: string, isResponseInArrayMode = false) {
        const built = "sql" in query && Array.isArray(query.params) ? query : dialect.sqlToQuery(query);
        prepareCalls.push({ name, isResponseInArrayMode, query: built, fields });

        return {
          getQuery() {
            return built;
          },
          async execute() {
            return { prepared: built.sql, params: built.params, name, fields };
          },
        };
      },
    } as any,
  };
}
