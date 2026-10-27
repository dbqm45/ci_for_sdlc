# tf reconstruction export (format `tf-reconstruction`, version 1)

The format is part of the pdi contract since 0.8.0: `reconstruction-export.schema.json` here is a copy of
`contract/reconstruction.schema.json` and `reconstruction.json` a copy of `contract/examples/reconstruction.json`
(an output of tf's real exporter `recon_export.py`). Both are pinned in `scripts/pdi-contract.json` and generated with
`npm run contract:sync`; `npm run contract:check` (CI) fails when they differ from the pinned contract. Never edit them
here. `source/` holds the Markdown the example was generated from (`rules.md`, `requirements.md`, `domain.md`), kept
for reference.

The sample code is a small payments module: timeout 45 s, at most 2 retries, at most 5 saved cards. One rule cites a
line that does not hold its quote, so its evidence is `verified: false`. `reconstruction.test.ts` checks the example
against the schema.
