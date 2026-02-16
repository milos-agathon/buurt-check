<#
.SYNOPSIS
    Implements the approved plan with Claude Code, then reviews with Codex CLI.
.DESCRIPTION
    1. Creates a dedicated git branch
    2. Claude Code implements using superpowers:execute-plan
    3. Codex CLI reviews the full implementation
    4. Reports what's done vs what's missing
.EXAMPLE
    .\scripts\orchestrate-implement.ps1
#>

param(
    [string]$PlanFile = ".workflow\approved-plan.md"
)

$ErrorActionPreference = "Stop"

# Validate
if (-not (Test-Path $PlanFile)) {
    Write-Host "No approved plan found at $PlanFile" -ForegroundColor Red
    Write-Host "Run orchestrate-plan.ps1 first." -ForegroundColor Red
    exit 1
}

# Create implementation branch
$branchName = "implement/$(Get-Date -Format 'yyyyMMdd-HHmm')"
Write-Host "Creating branch: $branchName" -ForegroundColor Cyan
git checkout -b $branchName

Write-Host ""
Write-Host ("=" * 60) -ForegroundColor Green
Write-Host "  IMPLEMENTATION PHASE" -ForegroundColor Green
Write-Host "  Plan: $PlanFile" -ForegroundColor Green
Write-Host "  Branch: $branchName" -ForegroundColor Green
Write-Host ("=" * 60) -ForegroundColor Green
Write-Host ""

# -------------------------------------------------------
# STEP 1: Claude Code implements the plan
# -------------------------------------------------------
Write-Host "[Claude Code] Implementing approved plan..." -ForegroundColor Green
Write-Host "  This runs interactively — Superpowers will manage the process." -ForegroundColor Gray
Write-Host "  It will use subagents, TDD, and code review internally." -ForegroundColor Gray
Write-Host ""

# Run Claude Code INTERACTIVELY for implementation
# (superpowers:execute-plan needs to ask you questions)
claude -p @"
Read the approved implementation plan at $PlanFile.

Use superpowers:execute-plan to implement it step by step.
Follow the plan exactly. For each task:
1. Write tests first (TDD — red/green/refactor)
2. Implement the minimum code to pass tests
3. Run verification commands from the plan
4. Commit with the message specified in the plan

After ALL tasks are complete, run the full test suite:
- python -m pytest tests/ --tb=short (backend)
- npx vitest run (frontend)
- cargo test (forge3d, if changed)

Report what was completed and what (if anything) was skipped.
"@

Write-Host ""
Write-Host "[Claude Code] Implementation phase complete." -ForegroundColor Green
Write-Host ""

# -------------------------------------------------------
# STEP 2: Codex CLI reviews the implementation
# -------------------------------------------------------
Write-Host "[Codex CLI] Reviewing implementation..." -ForegroundColor Magenta

$reviewFile = ".workflow\implementation-review.md"
$diffSummary = git diff main --stat 2>&1 | Out-String
$changedFiles = git diff main --name-only 2>&1 | Out-String

$codexReviewPrompt = @"
You are reviewing a complete implementation against its approved plan.

Plan: $PlanFile (read this file)
Branch: $branchName

Files changed (vs main):
$changedFiles

Diff summary:
$diffSummary

Review criteria:
1. PLAN COMPLIANCE — Is every task from the plan implemented?
2. TEST COVERAGE — Does every new function/endpoint have tests?
3. REGRESSIONS — Do existing tests still pass?
4. CODE QUALITY — Clean code, proper error handling, no dead code?
5. SECURITY — No hardcoded secrets, proper input validation?

Format your review as:

# Implementation Review

## Fully Implemented
- [List of plan tasks that are correctly done]

## Partially Implemented
- [Tasks that are started but incomplete, with what's missing]

## Not Implemented
- [Tasks from the plan that were skipped entirely]

## Issues Found
- [Bugs, regressions, quality problems]

## Verdict: FULLY IMPLEMENTED
or
## Verdict: INCOMPLETE - [number] tasks remaining
"@

codex exec `
    --sandbox read-only `
    -c model_reasoning_effort="high" `
    -o $reviewFile `
    $codexReviewPrompt

Write-Host ""
Write-Host "[Codex CLI] Review saved to $reviewFile" -ForegroundColor Magenta
Write-Host ""

# Check verdict
$review = Get-Content $reviewFile -Raw

if ($review -match "FULLY IMPLEMENTED") {
    Write-Host ("=" * 60) -ForegroundColor Green
    Write-Host "  IMPLEMENTATION COMPLETE!" -ForegroundColor Green
    Write-Host "  Branch: $branchName" -ForegroundColor Green
    Write-Host "  Review: $reviewFile" -ForegroundColor Green
    Write-Host "" -ForegroundColor Green
    Write-Host "  Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Review the diff yourself: git diff main" -ForegroundColor Cyan
    Write-Host "  2. Run full test suite manually" -ForegroundColor Cyan
    Write-Host "  3. Merge: git checkout main && git merge $branchName" -ForegroundColor Cyan
    Write-Host "  4. Or create PR: gh pr create" -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Green
}
else {
    Write-Host ("=" * 60) -ForegroundColor Yellow
    Write-Host "  IMPLEMENTATION INCOMPLETE" -ForegroundColor Yellow
    Write-Host "  Review: $reviewFile" -ForegroundColor Yellow
    Write-Host "" -ForegroundColor Yellow
    Write-Host "  To continue, feed the review back to Claude Code:" -ForegroundColor Cyan
    Write-Host "  claude" -ForegroundColor Cyan
    Write-Host '  Then: "Read .workflow/implementation-review.md and complete the remaining tasks"' -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Yellow
}