# tf reconstruction export (format `tf-reconstruction`, version 1)

`reconstruction.json` here was produced by tf's real exporter, not written by hand:

```
recon_export.py source/ --repo <sample repo>   # tf commit 97bdef4, packs/pack-it/skills/eng-codebase-mapping/scripts
```

`source/` holds the Markdown it was generated from (`rules.md`, `requirements.md`, `domain.md`). The sample code is
a small payments module: timeout 45 s, at most 2 retries, at most 5 saved cards. One rule cites a line that does not
hold its quote, so its evidence is `verified: false`. `reconstruction-export.schema.json` is tf's schema, copied
unchanged; `reconstruction.test.ts` checks the fixture against it. Regenerate with tf's exporter, never edit by hand.
