# Review Branch Prompt

Review the current branch as a code reviewer.

Prioritize:

- Behavioral regressions.
- Product contract violations.
- Missing or weak tests.
- i18n and graceful-degradation failures.
- Backend cache, data-source, scoring, and warning-code errors.
- Frontend mobile layout, accessibility, and design-token regressions.

Return findings first, ordered by severity, with file and line references.
