Copied from dbqm45/pdi, contract 0.9.0 (tag contract-v0.9.0): `contract/design-links.schema.json`,
`contract/examples/design.md` and `contract/examples/design-links.json` — the frame table of a change's design.md and
its parsed form (`conventions.design`). Pinned in `scripts/pdi-contract.json` and checked by `npm run contract:check`
in CI; never edit them here. `test/design-md.test.ts` checks that `parseDesignMd` turns the example into exactly the
expected result.
