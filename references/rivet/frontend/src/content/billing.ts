/** Human-readable plan names. `pro` is presented as "Hobby". */
export const PLAN_LABELS: Record<string, string> = {
	free: "Free",
	pro: "Hobby",
	team: "Team",
	enterprise: "Enterprise",
};

/**
 * Rivet Compute pricing. Compute is billed per active second based on each
 * actor's configured CPU and memory.
 *
 * cost = active_seconds × (vcpus × cpu_per_vcpu_second + memory_gib × memory_per_gib_second)
 *
 * One vCPU is half a physical core. The Free plan is limited to 1 vCPU; paid
 * plans allow up to 8 vCPU.
 */
export const COMPUTE = {
	cpuPerVcpuSecond: 0.000033,
	memoryPerGibSecond: 0.0000029,
	maxVcpu: 8,
	freeMaxVcpu: 1,
};

/**
 * Monthly compute spend cap in USD per plan. `null` means no cap (and no
 * progress bar). Only the free plan is capped at $5/month of compute; paid
 * plans have no compute cap.
 */
export const COMPUTE_MONTHLY_CAP_USD: Record<string, number | null> = {
	free: 5,
	pro: null,
	team: null,
	enterprise: null,
};

/** Compute cost in dollars per active second for the given actor config. */
export function computeCostPerSecond(vcpus: number, memoryMb: number): number {
	return (
		vcpus * COMPUTE.cpuPerVcpuSecond +
		(memoryMb / 1024) * COMPUTE.memoryPerGibSecond
	);
}
