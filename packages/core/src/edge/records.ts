/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type --
These helpers narrow unknown adapter-boundary values before operation-specific parsing. */

/** A plain record whose fields remain untrusted until its caller parses them. */
export interface UnparsedRecord {
  readonly [key: string]: unknown;
}

/** @internal Build the caller's operation-specific boundary error. */
export type InvalidRecord = (message: string) => Error;

/** Require a plain object and preserve the caller's boundary-specific error. */
export function requireRecord(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This helper performs the plain-object boundary parse.
  value: unknown,
  label: string,
  invalid: InvalidRecord,
): UnparsedRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(`${label} must be an object`);
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw invalid(`${label} must be a plain object`);
  }
  // SAFETY: The value is a plain object whose fields remain unknown.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Operation-specific parsing follows immediately.
  return value as UnparsedRecord;
}

/** Reject keys that the enclosing wire envelope does not declare. */
export function assertRecordKeys(
  value: UnparsedRecord,
  allowed: readonly string[],
  label: string,
  invalid: InvalidRecord,
): void {
  const key = Object.keys(value).find((candidate) => !allowed.includes(candidate));
  if (key !== undefined) invalid(`${label} has unknown field '${key}'`);
}
