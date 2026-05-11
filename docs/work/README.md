# Active Work

Use this folder for artifacts that guide or record active engineering work.

## Folders

- `plans/`: implementation plans with checkbox tasks and verification steps.
- `decisions/`: concise records of decisions that affect future work.
- `reviews/`: code review notes, design review notes, and QA findings.
- `specs/`: workflow or repo-structure specs that do not belong to a single product feature.

## Rules

- Prefer dated filenames: `YYYY-MM-DD-topic.md`.
- Keep product requirements in `docs/prd.md` or a feature folder under `specs/`.
- Keep implementation work in task files that can be assigned to one worker without shared write conflicts.
- Include verification commands and expected results in every plan.
