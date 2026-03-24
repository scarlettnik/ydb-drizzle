import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { createLiveContext } from "./helpers/context.js";
import { typesTable } from "./helpers/schema.js";

const live = createLiveContext();

test("types round-trip", async (t) => {
  if (!live.requireLiveYdb(t)) return;
  live.describeDbChange(t, "insert one full typed row, read it back, update typed fields, read the updated row, then clean it");
  const id = live.baseUint64Id + 1n;
  const now = new Date();
  const initialDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const initialDatetime = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const initialTimestamp = new Date(now);
  const initialBytes = Uint8Array.from(Buffer.from("pony-bytes", "utf8"));
  const initialJson = { pony: "Pinkie Pie", level: 7 };
  const initialJsonDocument = ["Twilight", "Sparkle"];
  const initialUuid = "550e8400-e29b-41d4-a716-446655440000";
  const initialYson = Uint8Array.from([60, 97, 61, 49, 62, 91, 51, 59, 37, 102, 97, 108, 115, 101, 93]);

  const updatedBytes = Uint8Array.from(Buffer.from("rainbow-bytes", "utf8"));
  const updatedJson = { pony: "Rainbow Dash", level: 9 };
  const updatedJsonDocument = { team: "Mane Six" };
  const updatedTimestamp = new Date(now.getTime() + 60_000);
  const updatedYson = Uint8Array.from([91, 49, 59, 50, 59, 51, 93]);

  live.log("types", id.toString());
  await live.deleteTypeRows([id]);

  try {
    await live.db.insert(typesTable).values({
      id,
      flag: true,
      signed64: -123n,
      u32: 42,
      f32: 1.5,
      f64: 2.75,
      bytesValue: initialBytes,
      dateValue: initialDate,
      datetimeValue: initialDatetime,
      timestampValue: initialTimestamp,
      jsonValue: initialJson,
      jsonDocumentValue: initialJsonDocument,
      uuidValue: initialUuid,
      ysonValue: initialYson,
    });

    const insertedRows = await live.db.select().from(typesTable).where(eq(typesTable.id, id)) as Array<Record<string, unknown>>;

    assert.deepEqual(
      live.normalizeTypeRow(insertedRows[0]!),
      {
        id,
        flag: true,
        signed64: -123n,
        u32: 42,
        f32: 1.5,
        f64: 2.75,
        bytesValue: Array.from(initialBytes),
        dateValue: initialDate.toISOString(),
        datetimeValue: initialDatetime.toISOString(),
        timestampValue: initialTimestamp.toISOString(),
        jsonValue: initialJson,
        jsonDocumentValue: initialJsonDocument,
        uuidValue: initialUuid,
        ysonValue: Array.from(initialYson),
      },
    );

    await live.db.update(typesTable).set({
      flag: false,
      signed64: 777n,
      u32: 99,
      f32: 3.25,
      f64: 6.5,
      bytesValue: updatedBytes,
      timestampValue: updatedTimestamp,
      jsonValue: updatedJson,
      jsonDocumentValue: updatedJsonDocument,
      uuidValue: "123e4567-e89b-12d3-a456-426614174000",
      ysonValue: updatedYson,
    }).where(eq(typesTable.id, id));

    const updatedRows = await live.db.select().from(typesTable).where(eq(typesTable.id, id)) as Array<Record<string, unknown>>;

    assert.deepEqual(
      live.normalizeTypeRow(updatedRows[0]!),
      {
        id,
        flag: false,
        signed64: 777n,
        u32: 99,
        f32: 3.25,
        f64: 6.5,
        bytesValue: Array.from(updatedBytes),
        dateValue: initialDate.toISOString(),
        datetimeValue: initialDatetime.toISOString(),
        timestampValue: updatedTimestamp.toISOString(),
        jsonValue: updatedJson,
        jsonDocumentValue: updatedJsonDocument,
        uuidValue: "123e4567-e89b-12d3-a456-426614174000",
        ysonValue: Array.from(updatedYson),
      },
    );
  } finally {
    await live.deleteTypeRows([id]);
  }
});
