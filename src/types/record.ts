/** Public SDK record wire types; no precision or presence inference. */
export type RecordKind =
  | 'bool' | 'int64' | 'uint64' | 'decimal' | 'float64' | 'string' | 'binary'
  | 'date' | 'datetime' | 'timestamp' | 'uuid' | 'list' | 'struct';

export interface RecordField {
  name: string;
  kind: RecordKind;
  nullable: boolean;
  /** Decimal precision/scale, not fractional-time precision. */
  precision?: number;
  scale?: number;
  /** DateTime/Timestamp fractional digits (0-9); omitted is unknown, 0 is whole seconds. */
  timePrecision?: number;
  fields?: RecordField[];
  element?: RecordField;
}

export interface RecordSchema {
  fields: RecordField[];
}

/** Wire data is intentionally opaque here: the UI does not re-decode typed cells. */
export interface RecordValue {
  kind: RecordKind;
  present: boolean;
  null: boolean;
  data?: unknown;
}

export interface RecordBatch {
  schema: RecordSchema;
  records: Record<string, RecordValue>[];
}
