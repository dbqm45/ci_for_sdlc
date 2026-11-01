# Changes from a repository and the check on pull requests

ci_for_sdlc can read the changes a team keeps in its repository instead of Jira: `docs/project/changes/CHG-n/` with
`intent.md`, `plan.md` and `release.yaml`, as tf's `mode-pdi` writes them (pdi contract 0.5.0). It runs on a checkout,
so a pull request that changes a plan gets a red check when the plan is not ready. Plan of the step:
[`PDI-F2-PLAN.md`](PDI-F2-PLAN.md).

## What is read

| File | Becomes |
| --- | --- |
| `intent.md` (required) | The change as an epic: title from its first `# ` heading, its text as the description, the header's `status`. Without `release.yaml` the "Metryki sukcesu" / "Success metrics" section is the MVP's outcome and metric. |
| `plan.md` | Each slice (`TSK-n`) of the first table with a "Cięcie" / "Slice" column as a story under the change: "Wartość" / "Value" is its title, "Weryfikacja" / "Verification" its acceptance criterion, "Wydanie" / "Release" and "Flaga" / "Flag" its release line and flag. Optional columns for REL-008: "Rodzaj" / "Kind" (`foundation`, `fundament`, `F` or tf's `F-NN` make a foundation; anything else, or no column, a slice; a value starting "(fundament)" is a foundation too), "Odblokowuje" / "Unblocks" (task keys or text) and "Wymagania" / "Requirements" (ids like `US-02`, `FR-007`, `AC-3`). `dropped` slices are left out. |
| `decisions.md` (optional) | Decisions on findings: an entry in tf's format with `ustalenie: <finding>` (e.g. `DES-001:TSK-1`) answers that finding's question as a decision in the UI does, with `skutek` (`resolve` by default, `accept_risk`, `dismiss`, `confirm`). Its heading is the answer, `dlaczego` the note, `kto` and `kiedy` who and when, `id` pdi's DEC. It takes the place of a stored decision on the same question. Entries without `ustalenie` are left alone. See [`REPO-DECISIONS-PLAN.md`](REPO-DECISIONS-PLAN.md). |
| `release.yaml` | The release plan, which wins over the plan's columns: each slice's line from `releases[].tasks`, its flags from `flags[].tasks`, and the MVP (outcome, metric with target and `horizon_days`, guardrails) for REL-002. Each flag's plan (`owner`, `remove_by`, `rollout[]` with `stage`, `min_days`, `exit`) for REL-007. A slice only in `release.yaml` is a story titled with its key. |

The YAML header of `intent.md` and `plan.md` must name the change of its folder (`change: CHG-12`). Every item is
labelled `change:CHG-12`, so the change's readiness goes to pdi as in Jira mode. The release rules REL-001…006 run on
the change as on a Jira epic. Two more run only on changes from a repository:

| Rule | Default | Finds |
| --- | --- | --- |
| REL-007 | info | A flag in `release.yaml` without a plan: no rollout stages, a stage without `exit`, no `owner` or no `remove_by`. One finding per flag, naming what it lacks; it points at the flag's `key:` line in `release.yaml`. |
| REL-008 | warning | The self-check of tf's `plan-ciec.md`: a foundation without "Odblokowuje" / "Unblocks", "Unblocks" naming a task key that is not in the change (`plan.md` or `release.yaml`), or a slice with neither a verification nor a requirement id. One finding per row; it points at the row in `plan.md`. |

As for every rule, the policy's `actions` decide what an info or a warning does (by default info is only recorded and
a warning makes the change need attention) and `disabledRules` switches a rule off.

A file that cannot be used (no header, a header naming another change, `release.yaml` that is not valid YAML or not
in the contract's shape, a file over 256 KB) is reported with the file and the reason and its change is left out;
the gate then fails whatever the threshold. A change is never read as an empty plan.

## Running it

```sh
npm run analyze -- --repo ../my-service --repo-url https://github.com/acme/my-service --fail-on critical
```

`--repo` analyses only that checkout's changes (no Jira, no demo); settings and policy still come from `CI_DATA_DIR`,
and decisions from both `CI_DATA_DIR` and the changes' `decisions.md` (the repository's win on the same question).
A bad `decisions.md` entry (a finding of another change, no `kto`, a bad date or effect) is reported with its line
and fails the gate like any file problem. Exit codes: 0 passed, 1 an item is below the threshold (`--fail-on critical`: not ready; `warning`: not
ready or needs attention) or a file could not be read, 2 the analysis could not run (for example no
`docs/project/changes` folder).

`--tests <file or directory>` (repeatable) adds JUnit XML test results: a test naming `TSK-57/AC-1` (or a requirement
id of the slice's row, `US-02/AC-1`) is that criterion's test, and TEST-001…003 report a criterion without a test, a
failing one, and one the item does not have (docs/PDI-G4-PLAN.md). A report that cannot be read fails the gate.

In GitHub Actions (`GITHUB_ACTIONS=true`) each file problem and each finding that fails the gate is also an `::error`
annotation on its file: the file and line the finding points at (`release.yaml` for REL-007, the slice's row in
`plan.md` for REL-008), else the item's (`intent.md` for a change, its row in `plan.md` for a slice). Other open
findings on a change file are `::warning` (warning) or `::notice` (info) annotations that do not fail the gate. A table
of the items goes to the run's summary.

### With pdi

```sh
PDI_EVENTS_URL=http://localhost:8787 PDI_SIGNING_SECRET=… \
  npm run analyze -- --repo ../my-service --send-to-pdi
```

`--send-to-pdi` sends the readiness of every change of the repository (also those `--items` leaves out of the report)
to pdi as `readiness.changed`, signed and shaped as the server sends it in Jira mode (docs/PDI-F4-PLAN.md): a ready
change opens "approve-for-implementation" in pdi's inbox. It needs `--repo`, `PDI_EVENTS_URL` (https, or http on
localhost) and `PDI_SIGNING_SECRET` (pdi's `PDI_CI_FOR_SDLC_SIGNING_SECRET`); without them the gate exits 2 before
the analysis. A change is sent only when its readiness differs from the last one sent, through the queue in
`CI_DATA_DIR`, delivered once within 15 s (5 s per request). What was not delivered stays queued for the next run.
After the report:

```
pdi: http://localhost:8787
  pdi readiness.changed CHG-12 ready delivered
  pdi readiness.changed CHG-13 not_ready queued (pdi answered 500)
  pdi readiness.changed CHG-14 ready unchanged
  pdi queued readiness.changed CHG-13 attempts=1 next=2026-10-30T10:01:00.000Z (pdi answered 500)
```

The `pdi queued` lines are what still waits in the queue (also from earlier runs). Delivery never changes the exit
code. Keep `CI_DATA_DIR` between runs, or every run sends every change again. Without the flag the `PDI_*` variables
are ignored (docs/PDI-L3-PLAN.md).

## On pull requests

Copy [`templates/change-check.yml`](templates/change-check.yml) to `.github/workflows/` of the repository. It runs on
pull requests that touch `docs/project/changes/**` (a change to `release.yaml` or `plan.md` alone is enough), checks out ci_for_sdlc next to the repository and runs the command
above. Pin its `ref` to a release tag of ci_for_sdlc. To make it a required check, add "Definition check / check" to
the branch protection rule of the default branch.

To trace acceptance criteria to tests, set `TEST_REPORTS` in the template to where your test step writes JUnit XML
(relative to the repository, a file or a directory) and add that step before the check; the template has a Vitest
example. Empty (the default) means no test results. Once it is set, a report that is missing or cannot be read fails
the check, so tests that did not run never read as "no tests". Criteria can break when code changes, so widen or drop
the template's `paths` too.
