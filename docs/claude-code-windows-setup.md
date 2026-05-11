# Claude Code + Codex CLI: Complete Windows 11 Setup Guide

> Alignment note (2026-04-12): For any guidance affecting `https://buurt-check.nl/`, its associated legal pages, or `https://app.buurt-check.nl/#/search` and adjacent app UI states, `docs/plans/2026-04-12-website-and-app-design-10-10-spec.md` is the governing document. If this file conflicts with that spec on layout, hierarchy, spacing, visual system, bilingual asset handling, desktop adaptation, loading-state clarity, export recovery UX, or legal-page consistency, the 2026-04-12 spec controls.

**For: buurt-check project owner**
**Stack: FastAPI + PostGIS | React + TypeScript + Three.js | Rust/wgpu (forge3d)**
**Shell: PowerShell 7 on Windows 11**

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install Claude Code](#2-install-claude-code)
3. [Install Codex CLI](#3-install-codex-cli)
4. [Install Supporting Tools](#4-install-supporting-tools)
5. [Project Directory Structure](#5-project-directory-structure)
6. [Configure CLAUDE.md](#6-configure-claudemd)
7. [Install Superpowers](#7-install-superpowers)
8. [Configure Hooks](#8-configure-hooks)
9. [Create the Orchestration Scripts](#9-create-the-orchestration-scripts)
10. [Create the Codex Review Skill](#10-create-the-codex-review-skill)
11. [Run the Full Workflow](#11-run-the-full-workflow)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

Open **Windows Terminal** (recommended) or PowerShell 7. Check what you already have:

```powershell
# Check PowerShell version — you want 7.x, not 5.1
$PSVersionTable.PSVersion

# If you see 5.x, install PowerShell 7:
winget install Microsoft.PowerShell

# After install, always use "pwsh" instead of "powershell"
# Windows Terminal > Settings > Default profile > PowerShell 7
```

Check required tools:

```powershell
node --version     # Need 18+ (recommended: 20 LTS or 22)
npm --version      # Comes with Node
git --version      # Need 2.x+
python --version   # Need 3.10+ (for pytest)
cargo --version    # For forge3d Rust tests
```

Install anything missing:

```powershell
# Node.js (if missing)
winget install OpenJS.NodeJS.LTS

# Git (if missing)
winget install Git.Git

# Python (if missing)
winget install Python.Python.3.12

# Rust (if missing)
winget install Rustlang.Rustup
rustup default stable
```

**Restart your terminal after installing** so PATH updates take effect.

---

## 2. Install Claude Code

```powershell
# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version
```

If you see "claude: command not found", the npm global bin directory isn't in your PATH:

```powershell
# Find where npm installs global binaries
npm config get prefix

# Add that path + \bin to your PATH permanently
# Usually: C:\Users\YourName\AppData\Roaming\npm
# Go to: System Properties > Environment Variables > User PATH > New
# Add: C:\Users\YourName\AppData\Roaming\npm
# Restart terminal
```

First launch and authentication:

```powershell
# Navigate to your project
cd C:\path\to\buurt-check

# Launch Claude Code
claude

# Follow the prompts to authenticate:
# 1. Select "Anthropic Console" (if using API key) or "Claude.ai" (if using Pro/Max plan)
# 2. Browser opens — log in and authorize
# 3. Copy the auth code back to terminal
```

---

## 3. Install Codex CLI

```powershell
# Install Codex CLI globally
npm install -g @openai/codex

# Verify
codex --version

# Authenticate (first time)
codex auth
# Browser opens — log in with your OpenAI account
```

Codex requires an OpenAI API key or ChatGPT Plus/Pro subscription. If using an API key:

```powershell
# Set your OpenAI API key (add to your PowerShell profile for persistence)
$env:CODEX_API_KEY = "sk-your-key-here"

# To make it permanent, add to your PowerShell profile:
notepad $PROFILE
# Add this line: $env:CODEX_API_KEY = "sk-your-key-here"
# Save and close
```

---

## 4. Install Supporting Tools

```powershell
# jq — for JSON parsing in hooks (critical)
winget install jqlang.jq

# Verify jq works
echo '{"test": "hello"}' | jq '.test'
# Should print: "hello"
```

---

## 5. Project Directory Structure

Here is exactly where every configuration file goes. Starting from your buurt-check project root:

```
buurt-check/                          # Your project root
├── .claude/                          # Claude Code configuration (create this)
│   ├── settings.json                 # Hooks, permissions, model config
│   ├── agents/                       # Custom subagents
│   │   └── codex-reviewer.md         # Codex review agent definition
│   ├── skills/                       # Custom skills
│   │   └── codex-review/
│   │       └── SKILL.md              # Skill to run Codex from within Claude Code
│   └── rules/                        # Auto-loaded rule files
│       ├── geospatial.md             # Rules for Dutch geodata APIs
│       └── design.md                 # Rules for frontend/UI work
├── .workflow/                        # Orchestration state (create this)
│   ├── brief.md                      # Your Opus conversation output
│   ├── approved-plan.md              # Final approved plan (auto-generated)
│   ├── plans/                        # Plan versions (auto-generated)
│   └── feedback/                     # Codex feedback versions (auto-generated)
├── scripts/                          # Orchestration and hook scripts
│   ├── post-edit-test.ps1            # PostToolUse hook: runs tests
│   ├── orchestrate-plan.ps1          # Plan refinement loop
│   └── orchestrate-implement.ps1     # Implementation + review loop
├── CLAUDE.md                         # Project-level instructions (create this)
├── CLAUDE.local.md                   # Personal overrides, gitignored (optional)
├── backend/                          # FastAPI + PostGIS
│   └── tests/
├── frontend/                         # React + TypeScript + Three.js
│   └── tests/ or __tests__/
└── forge3d/                          # Rust/wgpu renderer
    └── tests/
```

Create the directory structure now:

```powershell
cd C:\path\to\buurt-check

# Create all directories
New-Item -ItemType Directory -Force -Path .claude/agents
New-Item -ItemType Directory -Force -Path .claude/skills/codex-review
New-Item -ItemType Directory -Force -Path .claude/rules
New-Item -ItemType Directory -Force -Path .workflow/plans
New-Item -ItemType Directory -Force -Path .workflow/feedback
New-Item -ItemType Directory -Force -Path scripts
```

Add to `.gitignore`:

```powershell
Add-Content .gitignore @"

# Claude Code local overrides
CLAUDE.local.md

# Workflow state (regenerated each session)
.workflow/plans/
.workflow/feedback/
.workflow/approved-plan.md
"@
```

---

## 6. Configure CLAUDE.md

Create `CLAUDE.md` in your project root. This is the lean, essential version — under 100 lines:

```powershell
New-Item -Path CLAUDE.md -ItemType File
```

Write this content into `CLAUDE.md`:

```markdown
# buurt-check

Dutch property intelligence app: neighborhood risk assessments and 3D visualizations for home buyers.

## Stack
- Backend: FastAPI 0.115+, Python 3.12, PostGIS, SQLAlchemy
- Frontend: React 18, TypeScript 5.5 strict, Three.js r170, Tailwind CSS
- Renderer: Rust/wgpu custom renderer (forge3d)
- APIs: BAG, 3DBAG, PDOK, RIVM

## Commands
- Backend tests: `cd backend && python -m pytest tests/ --tb=short -q`
- Frontend tests: `cd frontend && npx vitest run --bail 1`
- Rust tests: `cd forge3d && cargo test`
- Backend dev server: `cd backend && uvicorn app.main:app --reload`
- Frontend dev server: `cd frontend && npm run dev`
- Lint: `cd frontend && npx eslint src/`
- Type check: `cd frontend && npx tsc --noEmit`

## Architecture
- `backend/app/` — FastAPI routes, services, PostGIS models
- `frontend/src/` — React components, Three.js scenes, API clients
- `forge3d/src/` — Rust/wgpu renderer, shader pipeline

## Key Rules
- Named exports only, never default exports (frontend)
- All PostGIS queries use parameterized inputs — never string interpolation
- Coordinate system: EPSG:28992 (Rijksdriehoekstelsel) for Dutch data, transform to EPSG:4326 for display
- Three.js scenes must dispose geometries and materials on unmount
- All API responses follow the schema in backend/app/schemas/

## External References
- Design system: see .claude/rules/design.md
- Geospatial conventions: see .claude/rules/geospatial.md
- Detailed API docs: see backend/docs/api-reference.md

## Git
- Branch naming: feature/*, bugfix/*, hotfix/*
- Commit format: type(scope): description (e.g., feat(auth): add JWT refresh)
- Never force-push to main or develop
- Create checkpoint commits after each logical unit of work

## File Protection
- NEVER modify CLAUDE.md (only the human edits this file)
- NEVER modify .env or .env.* files
- NEVER modify database migration files without explicit approval
- ASK before modifying anything in forge3d/src/shaders/
```

Now create `.claude/rules/design.md`:

```powershell
New-Item -Path .claude/rules/design.md -ItemType File
```

Content:

```markdown
---
paths:
  - frontend/src/**
  - frontend/public/**
---
# Design System — Polar Frost

## Approach
Scandinavian minimalism ("Clear Signal"). Clean, functional, trust-building.

## Colors
- Background: #F9FAFB (Polar Frost canvas)
- Surface: #FFFFFF (cards and document surfaces)
- Frost block: #F0F4F8 (grouped evidence areas)
- Text: #171D1C (primary ink)
- Secondary text: #3D4947 (metadata and explanatory copy)
- Border: #E2E8F0 (low-contrast dividers)
- Accent fill: #0D9488 (primary actions)
- Accent text: #00685F (teal text/icons on light backgrounds)
- Tertiary: #C36D4B (warm evidence/caution benchmark)
- Risk: #22C55E good, #EAB308 moderate, #EF4444 poor, #B91C1C critical

Full palette: `docs/palette.md`.

## Typography
- Headings: Satoshi, 700-900 weight
- Body: Satoshi, 400 weight, 15px base
- Mono: JetBrains Mono (code/data)

## Component Patterns
- Cards: 8px radius, subtle shadow (0 1px 3px rgba(0,0,0,0.08))
- Spacing: 8px grid system
- Max content width: 1200px
- Mobile breakpoint: 768px

## When making UI changes
1. Check existing components in frontend/src/components/ui/ first
2. Follow the color palette above — never introduce new colors
3. All interactive elements need hover and focus states
4. Map visualizations use the choropleth scale in frontend/src/utils/colorScales.ts
```

Create `.claude/rules/geospatial.md`:

```powershell
New-Item -Path .claude/rules/geospatial.md -ItemType File
```

Content:

```markdown
---
paths:
  - backend/app/services/geo*
  - backend/app/services/pdok*
  - backend/app/services/bag*
  - backend/app/models/geo*
---
# Geospatial Conventions

## Coordinate Systems
- Storage: EPSG:28992 (RD New / Rijksdriehoekstelsel)
- Display/API output: EPSG:4326 (WGS84)
- Always transform at the service boundary, never in the frontend

## Dutch Geodata APIs
- BAG: buildings/addresses via PDOK WFS. Rate limit: 100 req/min
- 3DBAG: 3D building models via CityJSON. Cache responses locally
- PDOK: base maps, cadastral data, elevation (AHN)
- RIVM: environmental risk data. Update cache weekly

## PostGIS Rules
- All geometry columns use SRID 28992
- Use ST_Transform() for coordinate conversion
- Spatial indexes on all geometry columns
- Use ST_DWithin() instead of ST_Distance() < X for performance
```

---

## 7. Install Superpowers

Inside Claude Code (launch it first with `claude`):

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

Exit Claude Code (`/exit` or Ctrl+C) and relaunch:

```powershell
claude
```

You should see the Superpowers bootstrap message on startup. Verify with:

```
/help
```

You should see commands like `/superpowers:brainstorm`, `/superpowers:write-plan`, `/superpowers:execute-plan`.

---

## 8. Configure Hooks

Create `.claude/settings.json`. This is the central configuration file:

```powershell
New-Item -Path .claude/settings.json -ItemType File
```

Write this content:

```json
{
  "permissions": {
    "deny": [
      "Edit(CLAUDE.md)",
      "Write(CLAUDE.md)",
      "Edit(**/.env*)",
      "Write(**/.env*)",
      "Edit(**/migrations/**)",
      "Bash(rm -rf *)"
    ],
    "ask": [
      "Edit(**/forge3d/src/shaders/**)",
      "Write(**/forge3d/src/shaders/**)",
      "Bash(git push*)"
    ],
    "allow": [
      "Bash(python -m pytest*)",
      "Bash(npx vitest*)",
      "Bash(cargo test*)",
      "Bash(npx eslint*)",
      "Bash(npx tsc*)",
      "Bash(npm run dev*)",
      "Bash(uvicorn*)"
    ]
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "pwsh -ExecutionPolicy Bypass -File scripts/post-edit-test.ps1"
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "pwsh -Command \"[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.MessageBox]::Show('Claude Code needs your attention', 'Claude Code') | Out-Null\""
          }
        ]
      }
    ]
  }
}
```

Now create the test hook script. Create `scripts/post-edit-test.ps1`:

```powershell
New-Item -Path scripts/post-edit-test.ps1 -ItemType File
```

Write this content into `scripts/post-edit-test.ps1`:

```powershell
# post-edit-test.ps1
# PostToolUse hook: runs the relevant test suite after Claude edits a file
# Exit code 0 = success, Exit code 2 = block and show error to Claude

$ErrorActionPreference = "SilentlyContinue"

# Read JSON from stdin — Claude Code sends tool context as JSON
try {
    $rawInput = @()
    while ($line = [Console]::In.ReadLine()) {
        $rawInput += $line
    }
    $json = ($rawInput -join "`n") | ConvertFrom-Json
    $filePath = $json.tool_input.file_path
}
catch {
    # If we can't parse input, don't block — just exit silently
    exit 0
}

if (-not $filePath) { exit 0 }

# Get the project root (where .claude/ lives)
$projectRoot = (Get-Item -Path ".").FullName
$extension = [System.IO.Path]::GetExtension($filePath).ToLower()

$exitCode = 0
$output = ""

switch ($extension) {
    ".py" {
        $backendDir = Join-Path $projectRoot "backend"
        if (Test-Path (Join-Path $backendDir "tests")) {
            Write-Host "Running Python tests..." -ForegroundColor Yellow
            Push-Location $backendDir
            $output = & python -m pytest tests/ --tb=short -q --timeout=30 2>&1 | Out-String
            $exitCode = $LASTEXITCODE
            Pop-Location
        }
    }

    { $_ -in ".ts", ".tsx", ".jsx" } {
        $frontendDir = Join-Path $projectRoot "frontend"
        if (Test-Path (Join-Path $frontendDir "package.json")) {
            Write-Host "Running frontend tests..." -ForegroundColor Yellow
            Push-Location $frontendDir
            $output = & npx vitest run --bail 1 2>&1 | Out-String
            $exitCode = $LASTEXITCODE
            Pop-Location
        }
    }

    ".rs" {
        $rustDir = Join-Path $projectRoot "forge3d"
        if (Test-Path (Join-Path $rustDir "Cargo.toml")) {
            Write-Host "Running Rust tests..." -ForegroundColor Yellow
            Push-Location $rustDir
            $output = & cargo test 2>&1 | Out-String
            $exitCode = $LASTEXITCODE
            Pop-Location
        }
    }

    default {
        # No tests for this file type
        exit 0
    }
}

# Show the last 25 lines of output
$outputLines = $output -split "`n" | Select-Object -Last 25
$outputLines | ForEach-Object { [Console]::Error.WriteLine($_) }

if ($exitCode -ne 0) {
    [Console]::Error.WriteLine("")
    [Console]::Error.WriteLine("TESTS FAILED after editing: $filePath")
    [Console]::Error.WriteLine("Fix the failing tests before making more changes.")
    exit 2
}

[Console]::Error.WriteLine("All tests passed.")
exit 0
```

**Test the hook manually** before relying on it:

```powershell
# Simulate what Claude Code sends to the hook
'{"tool_input":{"file_path":"backend/app/main.py"}}' | pwsh -ExecutionPolicy Bypass -File scripts/post-edit-test.ps1
echo "Exit code: $LASTEXITCODE"
```

---

## 9. Create the Orchestration Scripts

### Script 1: Plan Refinement Loop

Create `scripts/orchestrate-plan.ps1`:

```powershell
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

Write-Host ""
Write-Host "  Claude Code + Codex Plan Refinement Loop" -ForegroundColor Cyan
Write-Host "  Brief: $BriefFile" -ForegroundColor Cyan
Write-Host "  Max iterations: $MaxIterations" -ForegroundColor Cyan
Write-Host ""

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
        # First iteration — generate from brief
        $claudePrompt = @"
Read the project brief at $BriefFile carefully.

Use the superpowers:write-plan skill to create a detailed, step-by-step
implementation plan. Each task should be specific enough to implement
in 2-5 minutes. Include:
- Exact file paths to create or modify
- What each change should accomplish
- Verification steps (test commands, expected output)
- Git commit message for each task

Save the complete plan to: $planFile

IMPORTANT: Do NOT implement anything. Planning only. Do NOT write any code.
"@
    }
    else {
        # Subsequent iterations — refine based on Codex feedback
        $prevPlan = Join-Path $PlansDir "plan-v$($i - 1).md"
        $prevFeedback = Join-Path $FeedbackDir "feedback-v$($i - 1).md"

        $claudePrompt = @"
You are refining an implementation plan based on adversarial review feedback.

Previous plan: $prevPlan
Review feedback: $prevFeedback

Read BOTH files carefully. Then:
1. Address every Critical Issue — these are blockers
2. Address every Design Concern where the reviewer has a valid point
3. Keep everything the reviewer said was good
4. Use superpowers:write-plan to produce an improved plan

Save the updated plan to: $planFile

IMPORTANT: Do NOT implement anything. Planning only. Do NOT write any code.
"@
    }

    # Run Claude Code non-interactively in plan mode
    # Plan mode = read-only, cannot edit files
    claude -p $claudePrompt --permission-mode plan

    # Verify plan was created
    if (-not (Test-Path $planFile)) {
        Write-Host ""
        Write-Host "  ERROR: Plan file was not created at $planFile" -ForegroundColor Red
        Write-Host "  Claude Code may have failed or saved to a different location." -ForegroundColor Red
        Write-Host "  Check the output above for errors." -ForegroundColor Red
        exit 1
    }

    $planSize = (Get-Item $planFile).Length
    Write-Host "[Claude Code] Plan v$i saved ($planSize bytes)" -ForegroundColor Green
    Write-Host ""

    # -------------------------------------------------------
    # STEP B: Codex CLI reviews the plan adversarially
    # -------------------------------------------------------
    Write-Host "[Codex CLI] Reviewing plan v$i..." -ForegroundColor Magenta

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

    Write-Host "[Codex CLI] Review saved to $feedbackFile" -ForegroundColor Magenta
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

        Write-Host "  Next step: Run the implementation script:" -ForegroundColor Cyan
        Write-Host "  .\scripts\orchestrate-implement.ps1" -ForegroundColor Cyan
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
```

### Script 2: Implementation + Review Loop

Create `scripts/orchestrate-implement.ps1`:

```powershell
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
```

---

## 10. Create the Codex Review Skill

This lets you run Codex review from INSIDE Claude Code with `/codex-review`, eliminating terminal switching for ad-hoc reviews.

Create `.claude/skills/codex-review/SKILL.md`:

```markdown
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
```

---

## 11. Run the Full Workflow

Here is the complete workflow, step by step. Each step tells you exactly what to type and where.

### Step 1: Ideate with Opus 4.6

Open claude.ai in your browser. Select Claude Opus 4.6 model. Use extended thinking.

```
I'm building a [feature] for buurt-check, a Dutch property intelligence app.
[Describe what you want to build]
Let's think through the approach, tradeoffs, and architecture.
```

When the conversation reaches a solid conclusion, copy the key decisions into a file:

```powershell
# In PowerShell, create the brief file
notepad .workflow\brief.md
```

Paste your Opus conversation summary in the format described in the orchestrate-plan script.

### Step 2: Run the plan refinement loop

```powershell
cd C:\path\to\buurt-check
.\scripts\orchestrate-plan.ps1
```

This runs automatically. Watch the output. Typical: 2-3 iterations before approval.

If you need to adjust parameters:

```powershell
# Fewer iterations (for simpler features)
.\scripts\orchestrate-plan.ps1 -MaxIterations 3

# Different brief file
.\scripts\orchestrate-plan.ps1 -BriefFile ".workflow\auth-brief.md"
```

### Step 3: Review the approved plan yourself

```powershell
# Open the approved plan
notepad .workflow\approved-plan.md

# Also check the final Codex feedback
notepad (Get-ChildItem .workflow\feedback\*.md | Sort-Object LastWriteTime | Select-Object -Last 1).FullName
```

If you want changes, edit the plan directly and skip to implementation.

### Step 4: Implement

```powershell
.\scripts\orchestrate-implement.ps1
```

This creates a git branch, runs Claude Code with Superpowers execute-plan, then has Codex review the result.

### Step 5: If implementation is incomplete, continue manually

```powershell
# Launch Claude Code interactively
claude

# Inside Claude Code:
# "Read .workflow/implementation-review.md and complete the remaining tasks from .workflow/approved-plan.md"
```

After Claude finishes, run an ad-hoc Codex review:

```powershell
# Or use the skill from inside Claude Code:
# /codex-review

# Or run Codex directly from PowerShell:
codex exec --sandbox read-only -c model_reasoning_effort="high" `
    "Review all changes on branch $(git branch --show-current) vs main. Are all planned tasks complete?"
```

### Step 6: Merge when done

```powershell
# Final check — run all tests
cd backend && python -m pytest tests/ && cd ..
cd frontend && npx vitest run && cd ..
cd forge3d && cargo test && cd ..

# Review the diff one more time
git diff main

# Merge
git checkout main
git merge (git branch --show-current)
git push
```

---

## 12. Troubleshooting

### "claude: command not found"

```powershell
# Check if it's installed
npm list -g @anthropic-ai/claude-code

# Find the binary location
npm config get prefix
# Add [prefix]\bin to your PATH
```

### "codex: command not found"

```powershell
npm list -g @openai/codex
# Same PATH fix as above
```

### Hook doesn't fire

```powershell
# Debug hooks by running Claude Code with debug logging
$env:CLAUDE_CODE_DEBUG = "1"
claude

# Check that settings.json is valid JSON
Get-Content .claude/settings.json | ConvertFrom-Json

# Common issue: wrong path separators
# Use forward slashes: "scripts/post-edit-test.ps1"
# Or escaped backslashes: "scripts\\post-edit-test.ps1"
```

### Hook fires but tests don't run

```powershell
# Test the hook script manually
'{"tool_input":{"file_path":"backend/app/main.py"}}' | pwsh -ExecutionPolicy Bypass -File scripts/post-edit-test.ps1

# Check exit code
echo $LASTEXITCODE

# Common issue: wrong project paths in the script
# Make sure you're running Claude Code from the project root
```

### Codex exec hangs or fails

```powershell
# Check authentication
codex auth

# Test with a simple prompt
codex exec --sandbox read-only "Say hello"

# Common issue on Windows: long prompts with special characters
# Use a prompt file instead:
$prompt | Out-File temp-prompt.txt -Encoding utf8
codex exec --sandbox read-only (Get-Content temp-prompt.txt -Raw)
```

### Superpowers not loading

```powershell
# Inside Claude Code:
/plugin list
# Should show superpowers

# If not, reinstall:
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace

# Exit and relaunch Claude Code
```

### PowerShell execution policy errors

```powershell
# Check current policy
Get-ExecutionPolicy

# Set to allow local scripts
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Or run scripts with explicit bypass
pwsh -ExecutionPolicy Bypass -File .\scripts\orchestrate-plan.ps1
```

### Image paste doesn't work in Claude Code

This is a known Windows limitation. Workaround: save the image to a file and reference it:

```powershell
# Take a screenshot, save as PNG
# Then in Claude Code:
# "Look at the screenshot at screenshots/bug.png and fix the layout issue"
```

### Context window filling up

Watch for Claude's responses getting shorter or less precise. Proactive fixes:

```
# Inside Claude Code — check context usage:
/context

# If above 60%, compact or clear:
/compact Focus on the current task only
# or
/clear
```

---

## Quick Reference Card

| Action | Command |
|--------|---------|
| Launch Claude Code | `claude` |
| Continue last session | `claude -c` |
| Switch to Plan Mode | `Shift+Tab` (twice from Normal) |
| Switch model | `/model opus` or `/model sonnet` |
| Enable extended thinking | Press `Tab` key, then type "ultrathink" in prompt |
| Check context usage | `/context` |
| Compact context | `/compact [focus instructions]` |
| Clear context | `/clear` |
| Run plan refinement | `.\scripts\orchestrate-plan.ps1` |
| Run implementation | `.\scripts\orchestrate-implement.ps1` |
| Ad-hoc Codex review | `/codex-review` (inside Claude Code) |
| Rewind changes | `Esc` `Esc` or `/rewind` |
| Git checkpoint | Claude auto-commits if told to in CLAUDE.md |
| View hook config | `/hooks` |
| Debug mode | `$env:CLAUDE_CODE_DEBUG="1"; claude` |
