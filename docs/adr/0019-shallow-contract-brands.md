# 0019: Contract brands are shallow validation evidence

Status: accepted during M1, 2026-09-05. Clarifies DESIGN sections 5.1 and 5.2.

`c.query`, `c.mutation`, and `c.channel` install the same non-enumerable node
brand. `c.contract` checks that shallow brand while walking a definition, then
installs a separate root brand after its runtime validation succeeds. Structural
lookalikes are not contract nodes.

Consumers that accept a complete contract constrain it to the minimal
`AnyContract` root brand. They do not prove every schema-backed leaf against the
full node union again. The exact nested object type remains available through
`Contract<TTree>`, and node-specific inference still reads the original schema
types.

This makes the brands evidence for work already performed at a DSL boundary. It
also keeps the large-contract type workload shallow: adding a procedure does not
make each downstream consumer re-check that procedure's schema-library API.
