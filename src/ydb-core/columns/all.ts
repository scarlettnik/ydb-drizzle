import { binary, bigint, boolean, bytes, customType, date, datetime, decimal, double, float, interval, json, jsonDocument, timestamp, uint32, uint64, uuid, yson } from "./types.js";
import { integer } from "./integer.js";
import { text } from "./text.js";

export const ydbColumnBuilders = {
  bigint,
  binary,
  boolean,
  bytes,
  customType,
  date,
  datetime,
  decimal,
  double,
  float,
  integer,
  interval,
  json,
  jsonDocument,
  text,
  timestamp,
  int: integer,
  uint32,
  uint64,
  uuid,
  yson,
};

export function getYdbColumnBuilders() {
  return ydbColumnBuilders;
}

export type YdbColumnBuilders = typeof ydbColumnBuilders;
