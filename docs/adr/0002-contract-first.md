# 0002: Contract first

Status: accepted in the original design.

Share a standalone contract between server and client without importing the backend module graph. The contract package has zero runtime dependencies and accepts Standard Schema types. Infer individual nodes to keep the TypeScript workload shallow.

Source: [DESIGN.md](../DESIGN.md), section 12, decision 2.
