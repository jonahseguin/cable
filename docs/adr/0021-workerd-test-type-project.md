# ADR 0021: isolate Workers Vitest declarations

Status: accepted for M3 tests

`@cloudflare/vitest-plugin` 1.1.4 exposes `cloudflare:test` declarations that
conflict with Wrangler 4.129.0 generated runtime declarations under strict
library checking. The dedicated `packages/cloudflare/workerd/tsconfig.json`
checks integration-test source with the plugin types and `skipLibCheck: true`.
All library and generated-Worker projects retain `skipLibCheck: false`.
Remove this exception when a plugin release type-checks with Wrangler-generated
types under strict declaration checking.
