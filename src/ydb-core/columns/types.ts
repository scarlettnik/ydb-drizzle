import { create } from "@bufbuild/protobuf";
import * as Ydb from "@ydbjs/api/value";
import { TypeKind } from "@ydbjs/value";
import {
  Bool,
  Date as YdbDate,
  Datetime as YdbDatetime,
  Double as YdbDouble,
  Float as YdbFloat,
  Int64 as YdbInt64,
  Interval as YdbInterval,
  Json as YdbJson,
  JsonDocument as YdbJsonDocument,
  Timestamp as YdbTimestamp,
  Uint32 as YdbUint32,
  Uint64 as YdbUint64,
  Uuid as YdbUuid,
  Yson as YdbYson,
} from "@ydbjs/value/primitive";
import { sql } from "drizzle-orm/sql/sql";
import { customType } from "./custom.js";

function escapeYqlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (Array.isArray(value)) {
    return Uint8Array.from(value);
  }

  if (typeof value === "string") {
    return Uint8Array.from(Buffer.from(value, "latin1"));
  }

  throw new Error(`Cannot decode YDB binary value: ${Object.prototype.toString.call(value)}`);
}

export interface YdbDecimalConfig {
  precision: number;
  scale: number;
}

const booleanBase = customType<{ data: boolean; driverData: boolean | Bool }>({
  dataType() {
    return "Bool";
  },
  toDriver(value) {
    return new Bool(value);
  },
});

const bigintBase = customType<{ data: bigint; driverData: bigint | YdbInt64 }>({
  dataType() {
    return "Int64";
  },
  toDriver(value) {
    return new YdbInt64(value);
  },
});

const uint32Base = customType<{ data: number; driverData: YdbUint32 }>({
  dataType() {
    return "Uint32";
  },
  toDriver(value) {
    return new YdbUint32(value);
  },
});

const uint64Base = customType<{ data: bigint; driverData: YdbUint64 }>({
  dataType() {
    return "Uint64";
  },
  toDriver(value) {
    return new YdbUint64(value);
  },
});

const floatBase = customType<{ data: number; driverData: YdbFloat }>({
  dataType() {
    return "Float";
  },
  toDriver(value) {
    return new YdbFloat(value);
  },
});

const doubleBase = customType<{ data: number; driverData: YdbDouble }>({
  dataType() {
    return "Double";
  },
  toDriver(value) {
    return new YdbDouble(value);
  },
});

const bytesBase = customType<{ data: Uint8Array; driverData: unknown }>({
  dataType() {
    return "String";
  },
  fromDriver(value) {
    return toUint8Array(value);
  },
});

const dateBase = customType<{ data: Date; driverData: YdbDate }>({
  dataType() {
    return "Date";
  },
  toDriver(value) {
    return new YdbDate(value);
  },
});

const datetimeBase = customType<{ data: Date; driverData: YdbDatetime }>({
  dataType() {
    return "Datetime";
  },
  toDriver(value) {
    return new YdbDatetime(value);
  },
});

const timestampBase = customType<{ data: Date; driverData: YdbTimestamp }>({
  dataType() {
    return "Timestamp";
  },
  toDriver(value) {
    return new YdbTimestamp(value);
  },
});

const intervalBase = customType<{ data: number; driverData: YdbInterval }>({
  dataType() {
    return "Interval";
  },
  toDriver(value) {
    return new YdbInterval(value);
  },
});

const uuidBase = customType<{ data: string; driverData: YdbUuid }>({
  dataType() {
    return "Uuid";
  },
  toDriver(value) {
    return new YdbUuid(value);
  },
});

const ysonBase = customType<{ data: Uint8Array; driverData: unknown }>({
  dataType() {
    return "Yson";
  },
  toDriver(value) {
    return new YdbYson(value instanceof Uint8Array ? value : new Uint8Array(value));
  },
  fromDriver(value) {
    return toUint8Array(value);
  },
});

export function boolean(name?: string) {
  return booleanBase(name as any);
}

export function bigint(name?: string) {
  return bigintBase(name as any);
}

export function uint32(name?: string) {
  return uint32Base(name as any);
}

export function uint64(name?: string) {
  return uint64Base(name as any);
}

export function float(name?: string) {
  return floatBase(name as any);
}

export function double(name?: string) {
  return doubleBase(name as any);
}

export function bytes(name?: string) {
  return bytesBase(name as any);
}

export const binary = bytes;

export function date(name?: string) {
  return dateBase(name as any);
}

export function datetime(name?: string) {
  return datetimeBase(name as any);
}

export function timestamp(name?: string) {
  return timestampBase(name as any);
}

export function interval(name?: string) {
  return intervalBase(name as any);
}

export function json<T = unknown>(name?: string) {
  return customType<{ data: T; driverData: YdbJson }>({
    dataType() {
      return "Json";
    },
    toDriver(value) {
      return new YdbJson(JSON.stringify(value));
    },
    fromDriver(value) {
      return typeof value === "string" ? JSON.parse(value) : (value as T);
    },
  })(name as any);
}

export function jsonDocument<T = unknown>(name?: string) {
  return customType<{ data: T; driverData: YdbJsonDocument }>({
    dataType() {
      return "JsonDocument";
    },
    toDriver(value) {
      return new YdbJsonDocument(JSON.stringify(value));
    },
    fromDriver(value) {
      return typeof value === "string" ? JSON.parse(value) : (value as T);
    },
  })(name as any);
}

export function uuid(name?: string) {
  return uuidBase(name as any);
}

export function yson(name?: string) {
  return ysonBase(name as any);
}

export function decimal(name: string, precision: number, scale: number) {
  return customType<{
    data: string;
    driverData: string;
    config: YdbDecimalConfig;
  }>({
    dataType(config) {
      return `Decimal(${config.precision}, ${config.scale})`;
    },
    toDriver(value) {
      if (!/^-?\d+(?:\.\d+)?$/.test(value)) {
        throw new Error(`Invalid decimal value: ${value}`);
      }

      return sql.raw(`Decimal(${escapeYqlString(value)}, ${precision}, ${scale})`);
    },
    fromDriver(value) {
      return String(value);
    },
  })(name, { precision, scale });
}

export { customType };
