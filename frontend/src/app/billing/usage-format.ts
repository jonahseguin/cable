export type MetricType = "hours" | "bytes" | "operations";

function stripTrailingZeros(value: number, decimals: number): string {
	return value.toFixed(decimals).replace(/\.?0+$/, "");
}

/** Format a metric's native-unit value (seconds, bytes, or 4KiB units). */
export function formatMetricValue(value: bigint, type: MetricType): string {
	const num = Number(value);

	switch (type) {
		case "hours": {
			const hours = num / 3600;
			if (hours >= 1_000_000_000) {
				return `${stripTrailingZeros(hours / 1_000_000_000, 1)}B hrs`;
			}
			if (hours >= 1_000_000) {
				return `${stripTrailingZeros(hours / 1_000_000, 1)}M hrs`;
			}
			if (hours >= 1000) {
				return `${stripTrailingZeros(hours / 1000, 1)}k hrs`;
			}
			return `${stripTrailingZeros(hours, 1)} hrs`;
		}
		case "bytes": {
			const KiB = 1024;
			const MiB = 1024 * 1024;
			const GiB = 1024 * 1024 * 1024;
			const TiB = 1024 * 1024 * 1024 * 1024;

			if (num >= TiB) {
				return `${stripTrailingZeros(num / TiB, 2)} TiB`;
			}
			if (num >= GiB) {
				return `${stripTrailingZeros(num / GiB, 2)} GiB`;
			}
			if (num >= MiB) {
				return `${stripTrailingZeros(num / MiB, 2)} MiB`;
			}
			if (num >= KiB) {
				return `${stripTrailingZeros(num / KiB, 2)} KiB`;
			}
			return `${num} B`;
		}
		case "operations": {
			const units = num / 4000;
			if (units >= 1_000_000_000) {
				return `${stripTrailingZeros(units / 1_000_000_000, 2)}B ops`;
			}
			if (units >= 1_000_000) {
				return `${stripTrailingZeros(units / 1_000_000, 2)}M ops`;
			}
			if (units >= 1_000) {
				return `${stripTrailingZeros(units / 1_000, 2)}K ops`;
			}
			return `${Math.round(units)} ops`;
		}
	}
}
