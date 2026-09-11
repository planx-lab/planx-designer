import {
  LosslessNumber, isInteger, isSafeNumber, parse, stringify, toSafeNumberOrThrow,
} from 'lossless-json';

/** Keep ordinary integer counters usable, but never round config literals. */
export function parseJsonNumber(literal: string): number | LosslessNumber {
  if (literal !== '-0' && isInteger(literal) && isSafeNumber(literal)) {
    return toSafeNumberOrThrow(literal);
  }
  return new LosslessNumber(literal);
}

export function parseJson(text: string): unknown {
  return parse(text, undefined, { parseNumber: parseJsonNumber });
}

/** All config persistence/transport must use this, not native JSON.stringify. */
export function stringifyJson(value: unknown, space?: number): string {
  const text = stringify(value, undefined, space);
  if (text === undefined) throw new TypeError('Value is not JSON serializable');
  return text;
}
