# Changes from a repository and the check on pull requests

ci_for_sdlc can read the changes a team keeps in its repository instead of Jira: `docs/project/changes/CHG-n/` with
`intent.md`, `plan.md` and `release.yaml`, as tf's `mode-pdi` writes them (pdi contract 0.5.0). It runs on a checkout,
so a pull request that changes a plan gets a red check when the plan is not ready. Plan of the step:
[`PDI-F2-PLAN.md`](PDI-F2-PLAN.md).

## What is read

| File | Becomes |
| --- | --- |
| `intent.md` (required) | The change as an epic: title from its first `# ` heading, its text as the description, the header's `status`. Without `release.yaml` the "Metryki sukcesu" / "Success metrics" section is the MVP's outcome and metric. |
| `plan.md` | Each slice (`TSK-n`) of the first table with a "Cięcie" / "Slice" column as a story under the change: "Wartość" / "Value" is its title, "Weryfikacja" / "Verification" its acceptance criterion, "Wydanie" / "Release" and "Flaga" / "Flag" its release line and flag. `dropped` slices are left out. |
| `release.yaml` | The release plan, which wins over the plan's columns: each slice's line from `releases[].tasks`, its flags from `flags[].tasks`, and the MVP (outcome, metric with target and `horizon_days`, guardrails) for REL-002. A slice only in `release.yaml` is a story titled with its key. |

The YAML header of `intent.md` and `plan.md` must name the change of its folder (`change: CHG-12`). Every item is
labelled `change:CHG-12`, so the change's readiness goes to pdi as in Jira mode. The release rules REL-001…006 run on
the change as on a Jira epic.

A file that cannot be used (no header, a header naming another change, `release.yaml` that is not valid YAML or not
in the contract's shape, a file over 256 KB) is reported with the file and the reason and its change is left out;
the gate then fails whatever the threshold. A change is never read as an empty plan.

## Running it

```sh
npm run analyze -- --repo ../my-service --repo-url https://github.com/acme/my-service --fail-on critical
```

`--repo` analyses only that checkout's changes (no Jira, no demo); settings, policy and decisions still come from
`CI_DATA_DIR`. Exit codes: 0 passed, 1 an item is below the threshold (`--fail-on critical`: not ready; `warning`: not
ready or needs attention) or a file could not be read, 2 the analysis could not run (for example no
`docs/project/changes` folder).

In GitHub Actions (`GITHUB_ACTIONS=true`) each file problem and each failing item is also an `::error` annotation on
its file (`intent.md` for a change, `plan.md` for a slice), and a table of the items goes to the run's summary.

## On pull requests

Copy [`templates/change-check.yml`](templates/change-check.yml) to `.github/workflows/` of the repository. It runs on
pull requests that touch `docs/project/changes/**`, checks out ci_for_sdlc next to the repository and runs the command
above. Pin its `ref` to a release tag of ci_for_sdlc. To make it a required check, add "Definition check / check" to
the branch protection rule of the default branch.
