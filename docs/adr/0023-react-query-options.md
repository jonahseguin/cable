# ADR 0023: Native TanStack Query options

Status: accepted for M4, 2026-09-05.

`@cable/react` exposes `createCableQuery(client)`, a shallow cached proxy that
produces native TanStack Query options. Query leaves provide `queryKey(input)`
and `queryOptions(input)` with the stable key `['cable', path, input]`.
Mutation leaves provide `mutationOptions()` and receive their input from
TanStack's `mutationFn`. The integration does not wrap `useQuery` or
`useMutation`, create mutation keys, or add a Cable-specific options-override
surface. This keeps TanStack's lifecycle, cache APIs, hydration, and SSR
semantics authoritative while preserving Cable's leaf input, output, and error
types.
