import type { ExtractTablesWithRelations } from "drizzle-orm/relations";

/**
 * User-defined schema object passed to `drizzle({ schema })`.
 *
 * Example:
 * `{ users, posts, comments }`
 */
export type YdbSchemaDefinition = Record<string, unknown>;

/**
 * Marker type used when `drizzle()` is created without a `schema` option.
 */
export type YdbSchemaWithoutTables = Record<string, never>;

/**
 * Relational metadata extracted from a schema definition and used by `db.query.*`.
 */
export type YdbSchemaRelations<
  TSchemaDefinition extends YdbSchemaDefinition = YdbSchemaDefinition,
> = ExtractTablesWithRelations<TSchemaDefinition>;
