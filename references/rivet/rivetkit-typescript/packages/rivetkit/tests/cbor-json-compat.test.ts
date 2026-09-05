import * as cbor from "cbor-x";
import { describe, expect, test } from "vitest";
import {
	decodeCborCompat,
	decodeCborJsonCompat,
	encodeCborCompat,
} from "@/serde";

describe("CBOR JSON compat", () => {
	test("coerces raw safe integer BigInts from Rust JSON payloads", () => {
		const decoded = decodeCborJsonCompat<{ value: number }>(
			cbor.encode({ value: 1_777_630_185_078n }),
		);

		expect(decoded.value).toBe(1_777_630_185_078);
	});

	test("preserves explicit BigInts encoded by the TypeScript compat layer", () => {
		const decoded = decodeCborJsonCompat<{ value: bigint }>(
			encodeCborCompat({ value: 123n }),
		);

		expect(decoded.value).toBe(123n);
	});

	test("keeps protocol decoder BigInts untouched", () => {
		const decoded = decodeCborCompat<{ value: bigint }>(
			cbor.encode({ value: 123n }),
		);

		expect(decoded.value).toBe(123n);
	});
});
