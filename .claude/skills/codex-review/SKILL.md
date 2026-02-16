---
name: codex-review
description: Run Codex CLI as an adversarial reviewer on the current work. Use when you want a second opinion on a plan or implementation.
allowed-tools: Bash(codex *)
---

# Codex Adversarial Review

## When to use
- After completing a plan (before implementation)
- After implementing a feature (before merging)
- When debugging a tricky issue (second perspective)

## Process

1. Ask the user what to review: "plan", "implementation", or "specific files"

2. For PLAN review:
   - Find the latest plan file in .workflow/plans/
   - Run: `codex exec --sandbox read-only -c model_reasoning_effort="high" -o .workflow/feedback/codex-adhoc-review.md "Review the implementation plan at [plan-file]. Check for correctness, completeness, architecture fit, security, and testability. Format as: Critical Issues / Design Concerns / Minor Suggestions / Verdict."`
   - Read the output file and present a comparison with your own assessment

3. For IMPLEMENTATION review:
   - Get the diff: `git diff main --stat`
   - Run: `codex exec --sandbox read-only -c model_reasoning_effort="high" -o .workflow/feedback/codex-impl-review.md "Review all changes on the current branch vs main. Check plan compliance, test coverage, regressions, code quality. Format as: Implemented / Missing / Issues / Verdict."`
   - Read the output and highlight any disagreements with your own review

4. For SPECIFIC FILES review:
   - Ask user which files
   - Run: `codex exec --sandbox read-only -c model_reasoning_effort="high" -o .workflow/feedback/codex-file-review.md "Review [files] for bugs, quality, security, and architecture concerns."`

5. Always present results as a comparison table:
   | Aspect | Claude's View | Codex's View | Agreement? |