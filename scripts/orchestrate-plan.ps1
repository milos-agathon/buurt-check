<#
.SYNOPSIS
    Automates the Claude Code <-> Codex CLI plan refinement loop.
.DESCRIPTION
    1. Claude Code generates a plan using superpowers:write-plan
    2. Codex CLI reviews the plan adversarially
    3. If not approved, Claude Code refines based on feedback
    4. Repeats until approved or max iterations reached
.PARAMETER MaxIterations
    Maximum refinement cycles (default: 5)
.PARAMETER BriefFile
    Path to the initial brief from your Opus conversation (default: .workflow/brief.md)
.EXAMPLE
    .\scripts\orchestrate-plan.ps1
    .\scripts\orchestrate-plan.ps1 -MaxIterations 3
#>

param(
    [int]$MaxIterations = 5,
    [string]$BriefFile = ".workflow\brief.md"
)

$ErrorActionPreference = "Stop"

# Resolve paths
$ProjectDir = Get-Location
$PlansDir = Join-Path $ProjectDir ".workflow\plans"
$FeedbackDir = Join-Path $ProjectDir ".workflow\feedback"

# Create directories
New-Item -ItemType Directory -Force -Path $PlansDir | Out-Null
New-Item -ItemType Directory -Force -Path $FeedbackDir | Out-Null

# Validate brief exists
if (-not (Test-Path $BriefFile)) {
    Write-Host @"

  ERROR: Brief file not found at $BriefFile

  Create this file first. It should contain the output from your
  Opus 4.6 ideation conversation. Structure it like this:

  # Project Brief: [Feature Name]
  ## Problem Statement
  [What problem are we solving]
  ## Proposed Approach
  [High-level approach agreed on with Opus]
  ## Key Constraints
  [Technical constraints, API limits, etc.]
  ## Decisions Made
  [Any design decisions already resolved]

"@ -ForegroundColor Red
    exit 1
}

# -------------------------------------------------------------------
# Helper: Run claude -p safely on Windows
#
# Problem: Windows has a ~32K char command-line limit, AND claude -p
# in plan mode doesn't reliably chain multiple Read tool calls.
#
# Solution: Write ONE temp file containing the full prompt WITH all
# referenced file contents inlined. Pass a short command to claude -p
# that says "read this one file." Claude does a single Read call and
# gets everything it needs.
# -------------------------------------------------------------------
function Invoke-ClaudePlan {
    param(
        [string]$PromptContent,
        [string]$OutputFile
    )

    # Write the fully-assembled prompt (with inlined file contents) to temp file
    $tempFile = Join-Path $ProjectDir ".workflow\~prompt-temp.md"
    $PromptContent | Out-File $tempFile -Encoding utf8

    try {
        # Short command that fits within Windows command-line limit
        $shortCmd = "Read the instructions file at $tempFile and follow them exactly. Output your complete response in markdown format."
        $result = & claude -p $shortCmd --permission-mode plan 2>$null

        if ($result) {
            $result | Out-File $OutputFile -Encoding utf8
        }
        else {
            "" | Out-File $OutputFile -Encoding utf8
        }
    }
    finally {
        Remove-Item $tempFile -ErrorAction SilentlyContinue
    }

    if (Test-Path $OutputFile) {
        return (Get-Item $OutputFile).Length
    }
    return 0
}

Write-Host ""
Write-Host "  Claude Code + Codex Plan Refinement Loop" -ForegroundColor Cyan
Write-Host "  Brief: $BriefFile" -ForegroundColor Cyan
Write-Host "  Max iterations: $MaxIterations" -ForegroundColor Cyan
Write-Host ""

# Read brief once
$briefContent = Get-Content $BriefFile -Raw

for ($i = 1; $i -le $MaxIterations; $i++) {
    $planFile = Join-Path $PlansDir "plan-v$i.md"
    $feedbackFile = Join-Path $FeedbackDir "feedback-v$i.md"
    $timestamp = Get-Date -Format "HH:mm:ss"

    Write-Host ("=" * 60) -ForegroundColor Yellow
    Write-Host "  ITERATION $i / $MaxIterations  [$timestamp]" -ForegroundColor Yellow
    Write-Host ("=" * 60) -ForegroundColor Yellow
    Write-Host ""

    # -------------------------------------------------------
    # STEP A: Claude Code generates or refines the plan
    # -------------------------------------------------------
    Write-Host "[Claude Code] Generating plan v$i..." -ForegroundColor Green

    if ($i -eq 1) {
        # First iteration: brief is the only input
        $fullPrompt = @"
# Instructions

You are creating an implementation plan for a software project.
Below is the project brief. Create a detailed, step-by-step implementation plan.

Each task should be specific enough to implement in 2-5 minutes. Include:
- Exact file paths to create or modify
- What each change should accomplish
- Verification steps (test commands, expected output)
- Git commit message for each task

Output the COMPLETE plan in markdown format.
Do NOT try to save any files. Do NOT implement anything.
Do NOT write any code. Planning only.

---

# Project Brief

$briefContent
"@
    }
    else {
        # Subsequent iterations: inline BOTH the previous plan and feedback
        # so Claude doesn't need to make additional Read calls
        $prevPlanContent = Get-Content (Join-Path $PlansDir "plan-v$($i - 1).md") -Raw
        $prevFeedbackContent = Get-Content (Join-Path $FeedbackDir "feedback-v$($i - 1).md") -Raw

        $fullPrompt = @"
# Instructions

You are refining an implementation plan based on adversarial review feedback.
Below you will find the previous plan and the reviewer's feedback.

Refine the plan:
1. Address every Critical Issue — these are blockers that must be fixed
2. Address every Design Concern where the reviewer has a valid point
3. Keep everything the reviewer marked as good
4. Improve task ordering and completeness

Output the COMPLETE updated plan in markdown format.
Include ALL tasks (not just changed ones) — this must be a standalone document.
Do NOT try to save any files. Do NOT implement anything.
Do NOT write any code. Planning only.

---

# Previous Plan (version $($i - 1))

$prevPlanContent

---

# Reviewer Feedback (iteration $($i - 1))

$prevFeedbackContent
"@
    }

    # Run Claude Code — all context is in one temp file
    $planSize = Invoke-ClaudePlan -PromptContent $fullPrompt -OutputFile $planFile

    # Verify plan has meaningful content
    if ($planSize -lt 200) {
        Write-Host ""
        Write-Host "  WARNING: Plan output is suspiciously small ($planSize bytes). Retrying in 5s..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
        $planSize = Invoke-ClaudePlan -PromptContent $fullPrompt -OutputFile $planFile
    }

    if ($planSize -lt 200) {
        Write-Host ""
        Write-Host "  ERROR: Plan file is empty or too small after retry ($planSize bytes)" -ForegroundColor Red
        if (Test-Path $planFile) {
            Write-Host "  Content:" -ForegroundColor Red
            Get-Content $planFile | Select-Object -First 10 | ForEach-Object {
                Write-Host "    $_" -ForegroundColor Gray
            }
        }
        Write-Host ""
        Write-Host "  Possible causes:" -ForegroundColor Yellow
        Write-Host "  - Claude Code authentication expired (run 'claude' interactively to re-auth)" -ForegroundColor Yellow
        Write-Host "  - Rate limit hit (wait a few minutes and retry the script)" -ForegroundColor Yellow
        Write-Host "  - Token limit reached (brief + plan + feedback may be too large)" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "[Claude Code] Plan v$i saved ($planSize bytes)" -ForegroundColor Green
    Write-Host ""

    # -------------------------------------------------------
    # STEP B: Codex CLI reviews the plan adversarially
    # -------------------------------------------------------
    Write-Host "[Codex CLI] Reviewing plan v$i..." -ForegroundColor Magenta

    # Codex CAN read files in its sandbox, so we pass the file path
    $codexPrompt = @"
You are a senior software architect performing a rigorous adversarial review
of an implementation plan. Your job is to find problems BEFORE implementation.

The plan is at: $planFile
Read it completely. Also examine the existing codebase for context.

The project stack is:
- Backend: FastAPI + PostGIS (Python 3.12)
- Frontend: React + TypeScript + Three.js
- Renderer: Rust/wgpu (forge3d)
- Dutch geodata APIs: BAG, 3DBAG, PDOK, RIVM

Evaluate against these criteria:
1. CORRECTNESS — Will each step actually work? Are there logical errors?
2. COMPLETENESS — Are edge cases handled? Missing error scenarios?
3. ARCHITECTURE — Does this fit the existing codebase patterns?
4. SECURITY — SQL injection, XSS, API key exposure, CORS issues?
5. TESTABILITY — Can each task be verified? Are test commands realistic?
6. ORDERING — Are dependencies between tasks in the right sequence?

Write your review in EXACTLY this format (the script parses the verdict line):

# Plan Review - Iteration $i

## Critical Issues (must fix before implementation)
- [Numbered list of showstopper problems]

## Design Concerns (should address)
- [Numbered list of architectural or quality issues]

## Minor Suggestions
- [Numbered list of nice-to-haves]

## What's Good
- [What the plan gets right — be specific]

## Verdict: READY FOR IMPLEMENTATION
or
## Verdict: NOT READY - REVISE
"@

    # Run Codex in read-only sandbox — it cannot modify any files
    codex exec `
        --sandbox read-only `
        -c model_reasoning_effort="high" `
        -o $feedbackFile `
        $codexPrompt

    if (-not (Test-Path $feedbackFile)) {
        Write-Host "  WARNING: Codex feedback file not created. Codex may have failed." -ForegroundColor Yellow
        Write-Host "  Creating a placeholder so the loop can continue." -ForegroundColor Yellow
        "## Verdict: NOT READY - REVISE`n`nCodex CLI did not produce output. Review the plan manually." | Out-File $feedbackFile -Encoding utf8
    }

    $feedbackSize = (Get-Item $feedbackFile).Length
    Write-Host "[Codex CLI] Review saved to $feedbackFile ($feedbackSize bytes)" -ForegroundColor Magenta
    Write-Host ""

    # -------------------------------------------------------
    # STEP C: Check the verdict
    # -------------------------------------------------------
    $feedback = Get-Content $feedbackFile -Raw

    if ($feedback -match "READY FOR IMPLEMENTATION") {
        Write-Host ""
        Write-Host ("=" * 60) -ForegroundColor Green
        Write-Host "  PLAN APPROVED after $i iteration(s)!" -ForegroundColor Green
        Write-Host "" -ForegroundColor Green
        Write-Host "  Final plan:     $planFile" -ForegroundColor Green
        Write-Host "  Final review:   $feedbackFile" -ForegroundColor Green
        Write-Host ("=" * 60) -ForegroundColor Green
        Write-Host ""

        # Copy to standard location
        Copy-Item $planFile (Join-Path $ProjectDir ".workflow\approved-plan.md") -Force

        Write-Host "  Next step: Launch Claude Code interactively and run:" -ForegroundColor Cyan
        Write-Host "  claude" -ForegroundColor Cyan
        Write-Host '  > Read .workflow/approved-plan.md and use superpowers:execute-plan' -ForegroundColor Cyan
        Write-Host ""
        exit 0
    }

    # Count issues for summary
    $criticalCount = ([regex]::Matches($feedback, "(?m)^- ")).Count
    Write-Host "[Loop] Plan NOT approved. ~$criticalCount items to address." -ForegroundColor Yellow
    Write-Host "       Continuing to iteration $($i + 1)..." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host ""
Write-Host ("=" * 60) -ForegroundColor Red
Write-Host "  Max iterations ($MaxIterations) reached without approval." -ForegroundColor Red
Write-Host "" -ForegroundColor Red
Write-Host "  Latest plan:     $(Join-Path $PlansDir "plan-v$MaxIterations.md")" -ForegroundColor Red
Write-Host "  Latest feedback:  $(Join-Path $FeedbackDir "feedback-v$MaxIterations.md")" -ForegroundColor Red
Write-Host "" -ForegroundColor Red
Write-Host "  Options:" -ForegroundColor Yellow
Write-Host "  1. Review the feedback manually and update the plan" -ForegroundColor Yellow
Write-Host "  2. Run again with more iterations: -MaxIterations 10" -ForegroundColor Yellow
Write-Host "  3. Manually approve: copy the plan to .workflow\approved-plan.md" -ForegroundColor Yellow
Write-Host ("=" * 60) -ForegroundColor Red
exit 1