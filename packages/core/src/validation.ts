/* oxlint-disable anti-slop/no-unknown-parameters -- Standard Schema owns this
untrusted boundary and returns parsed domain output before it leaves validate. */
import type { AnyStandardSchema, InferSchemaOutput } from "@cable/contract";

import { CableError } from "./errors.js";

/** A serializable Standard Schema issue returned for invalid input or output. */
export interface ValidationIssue {
  readonly message: string;
}

/**
 * Parse an untrusted boundary value with a Standard Schema implementation.
 *
 * The schema may validate synchronously or asynchronously. Validation failures
 * throw `CableError<'VALIDATION'>` and retain serializable issue details.
 */
export async function validate<TSchema extends AnyStandardSchema>(
  schema: TSchema,
  value: unknown,
): Promise<InferSchemaOutput<TSchema>> {
  const result = await schema["~standard"].validate(value);
  if (result.issues !== undefined) {
    const issues: ValidationIssue[] = result.issues.map((issue) => ({
      message: issue.message,
    }));
    throw new CableError("VALIDATION", { data: { issues } });
  }

  return result.value;
}
