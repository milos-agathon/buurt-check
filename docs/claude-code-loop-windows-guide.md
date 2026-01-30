# Nightly Autonomous Claude Code Loop - Windows Setup Guide

A complete guide to setting up a self-improving AI agent loop on Windows that reviews your work, extracts learnings, updates its own instructions, and ships features while you sleep.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project Structure](#2-project-structure)
3. [PowerShell Scripts](#3-powershell-scripts)
4. [Windows Task Scheduler Setup](#4-windows-task-scheduler-setup)
5. [Power Management Configuration](#5-power-management-configuration)
6. [Environment Variables](#6-environment-variables)
7. [Testing Your Setup](#7-testing-your-setup)
8. [Monitoring and Debugging](#8-monitoring-and-debugging)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Prerequisites

### Required Software

Install the following before proceeding:

**Claude Code**
```powershell
# Install via npm (requires Node.js)
npm install -g @anthropic-ai/claude-code
```

**Git for Windows**
Download from: https://git-scm.com/download/win

**GitHub CLI**
```powershell
# Install via winget
winget install GitHub.cli

# Or download from: https://cli.github.com/
```

**PowerShell 7+ (recommended)**
```powershell
# Install via winget
winget install Microsoft.PowerShell
```

### Verify Installations

Open PowerShell and run:

```powershell
claude --version
git --version
gh --version
$PSVersionTable.PSVersion
```

### Authenticate GitHub CLI

```powershell
gh auth login
```

Follow the prompts to authenticate with your GitHub account.

---

## 2. Project Structure

Create the following folder structure in your project:

```
C:\projects\your-project\
├── scripts\
│   └── compound\
│       ├── daily-compound-review.ps1
│       ├── auto-compound.ps1
│       ├── analyze-report.ps1
│       ├── loop.ps1
│       └── prevent-sleep.ps1
├── logs\
├── reports\
├── tasks\
├── CLAUDE.md
└── .env.local
```

Create the directories:

```powershell
$projectRoot = "C:\projects\your-project"

New-Item -ItemType Directory -Force -Path "$projectRoot\scripts\compound"
New-Item -ItemType Directory -Force -Path "$projectRoot\logs"
New-Item -ItemType Directory -Force -Path "$projectRoot\reports"
New-Item -ItemType Directory -Force -Path "$projectRoot\tasks"
```

---

## 3. PowerShell Scripts

### 3.1 Daily Compound Review Script

This script reviews all Claude Code threads from the last 24 hours and extracts learnings into your CLAUDE.md files.

**File:** `scripts\compound\daily-compound-review.ps1`

```powershell
#Requires -Version 7.0
<#
.SYNOPSIS
    Reviews Claude Code threads from the last 24 hours and compounds learnings.
.DESCRIPTION
    Runs BEFORE auto-compound.ps1 to update CLAUDE.md with learnings from the day's work.
#>

[CmdletBinding()]
param(
    [string]$ProjectPath = "C:\projects\your-project"
)

# Configuration
$ErrorActionPreference = "Stop"
$LogFile = Join-Path $ProjectPath "logs\compound-review-$(Get-Date -Format 'yyyy-MM-dd').log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    Add-Content -Path $LogFile -Value $logMessage
}

try {
    Write-Log "Starting daily compound review..."
    
    # Navigate to project directory
    Set-Location $ProjectPath
    Write-Log "Working directory: $ProjectPath"
    
    # Ensure we're on main and up to date
    Write-Log "Checking out main branch..."
    git checkout main
    if ($LASTEXITCODE -ne 0) { throw "Failed to checkout main branch" }
    
    Write-Log "Pulling latest changes..."
    git pull origin main
    if ($LASTEXITCODE -ne 0) { throw "Failed to pull from origin" }
    
    # Run Claude Code to review threads and compound learnings
    Write-Log "Running Claude Code compound review..."
    
    $prompt = @"
Load the compound-engineering skill. Look through and read each Claude Code thread from the last 24 hours. For any thread where we did NOT use the Compound Engineering skill to compound our learnings at the end, do so now - extract the key learnings from that thread and update the relevant CLAUDE.md files so we can learn from our work and mistakes. Commit your changes and push to main.
"@
    
    claude -p $prompt --dangerously-skip-permissions 2>&1 | Tee-Object -Append -FilePath $LogFile
    
    if ($LASTEXITCODE -ne 0) {
        Write-Log "WARNING: Claude Code exited with code $LASTEXITCODE"
    }
    
    Write-Log "Daily compound review completed successfully."
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
```

---

### 3.2 Analyze Report Script

This script analyzes your prioritized reports and extracts the top priority item.

**File:** `scripts\compound\analyze-report.ps1`

```powershell
#Requires -Version 7.0
<#
.SYNOPSIS
    Analyzes a prioritized report and returns the top priority item.
.PARAMETER ReportPath
    Path to the markdown report file to analyze.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$ReportPath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ReportPath)) {
    throw "Report not found: $ReportPath"
}

$reportContent = Get-Content $ReportPath -Raw

# Extract priority items (customize this regex based on your report format)
# This assumes format like "1. **Item Name** - Description" or "- [ ] Priority: High - Item"
$priorityPattern = '(?:^|\n)(?:1\.|#1|\*\*Priority 1\*\*|Priority:\s*High)[:\s-]*\*?\*?([^\n\r]+)'

if ($reportContent -match $priorityPattern) {
    $priorityItem = $Matches[1].Trim()
    $priorityItem = $priorityItem -replace '\*+', '' -replace '^\s*[-:]\s*', ''
} else {
    # Fallback: get first list item or heading
    if ($reportContent -match '(?:^|\n)[-*]\s*\[?\s*\]?\s*([^\n\r]+)') {
        $priorityItem = $Matches[1].Trim()
    } else {
        throw "Could not extract priority item from report"
    }
}

# Generate branch name from priority item
$branchName = $priorityItem.ToLower() `
    -replace '[^a-z0-9\s-]', '' `
    -replace '\s+', '-' `
    -replace '-+', '-' `
    -replace '^-|-$', ''

$branchName = "feature/$branchName"

# Truncate if too long
if ($branchName.Length -gt 50) {
    $branchName = $branchName.Substring(0, 50) -replace '-$', ''
}

# Add date suffix for uniqueness
$dateSuffix = Get-Date -Format "MMdd"
$branchName = "$branchName-$dateSuffix"

# Output as JSON
$result = @{
    priority_item = $priorityItem
    branch_name = $branchName
    report_path = $ReportPath
} | ConvertTo-Json -Compress

Write-Output $result
```

---

### 3.3 Execution Loop Script

This script runs Claude Code iteratively until all tasks pass or it hits the iteration limit.

**File:** `scripts\compound\loop.ps1`

```powershell
#Requires -Version 7.0
<#
.SYNOPSIS
    Runs Claude Code in a loop to execute tasks until complete.
.PARAMETER MaxIterations
    Maximum number of iterations before stopping.
.PARAMETER TaskFile
    Path to the tasks JSON file.
#>

[CmdletBinding()]
param(
    [int]$MaxIterations = 25,
    [string]$TaskFile = "scripts\compound\prd.json",
    [string]$ProjectPath = "C:\projects\your-project"
)

$ErrorActionPreference = "Stop"
$LogFile = Join-Path $ProjectPath "logs\loop-$(Get-Date -Format 'yyyy-MM-dd-HHmm').log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    Add-Content -Path $LogFile -Value $logMessage
}

Set-Location $ProjectPath

Write-Log "Starting execution loop (max $MaxIterations iterations)..."

for ($i = 1; $i -le $MaxIterations; $i++) {
    Write-Log "=== Iteration $i of $MaxIterations ==="
    
    # Check if task file exists
    $taskPath = Join-Path $ProjectPath $TaskFile
    if (-not (Test-Path $taskPath)) {
        Write-Log "Task file not found: $taskPath"
        break
    }
    
    # Read current tasks
    $tasks = Get-Content $taskPath -Raw | ConvertFrom-Json
    
    # Check if all tasks are complete
    $incompleteTasks = $tasks | Where-Object { $_.status -ne "complete" -and $_.status -ne "done" }
    
    if ($null -eq $incompleteTasks -or $incompleteTasks.Count -eq 0) {
        Write-Log "All tasks complete!"
        break
    }
    
    Write-Log "Remaining tasks: $($incompleteTasks.Count)"
    
    # Run Claude Code for next task
    $prompt = @"
Read the tasks in $TaskFile. Pick the next incomplete task and implement it. After implementation:
1. Run any relevant tests
2. If tests pass, mark the task as complete in $TaskFile
3. Commit your changes with a descriptive message
If tests fail, fix the issues and try again. If you cannot complete a task after reasonable effort, mark it as blocked with a note explaining why.
"@
    
    Write-Log "Running Claude Code..."
    claude -p $prompt --dangerously-skip-permissions 2>&1 | Tee-Object -Append -FilePath $LogFile
    
    # Brief pause between iterations
    Start-Sleep -Seconds 5
}

Write-Log "Execution loop finished after $i iterations."
```

---

### 3.4 Auto-Compound Script (Main Pipeline)

This is the main implementation script that orchestrates the entire pipeline.

**File:** `scripts\compound\auto-compound.ps1`

```powershell
#Requires -Version 7.0
<#
.SYNOPSIS
    Full pipeline: report → PRD → tasks → implementation → PR
.DESCRIPTION
    Picks the top priority from reports, creates a PRD, breaks it into tasks,
    executes them, and creates a pull request.
#>

[CmdletBinding()]
param(
    [string]$ProjectPath = "C:\projects\your-project",
    [int]$MaxIterations = 25
)

# Configuration
$ErrorActionPreference = "Stop"
$LogFile = Join-Path $ProjectPath "logs\auto-compound-$(Get-Date -Format 'yyyy-MM-dd').log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    Add-Content -Path $LogFile -Value $logMessage
}

try {
    Write-Log "========================================="
    Write-Log "Starting auto-compound pipeline..."
    Write-Log "========================================="
    
    # Navigate to project directory
    Set-Location $ProjectPath
    
    # Load environment variables from .env.local if it exists
    $envFile = Join-Path $ProjectPath ".env.local"
    if (Test-Path $envFile) {
        Write-Log "Loading environment from .env.local..."
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^([^#=]+)=(.*)$') {
                $key = $Matches[1].Trim()
                $value = $Matches[2].Trim()
                [Environment]::SetEnvironmentVariable($key, $value, "Process")
            }
        }
    }
    
    # Fetch latest (including tonight's CLAUDE.md updates from compound review)
    Write-Log "Fetching latest from origin/main..."
    git fetch origin main
    if ($LASTEXITCODE -ne 0) { throw "Failed to fetch from origin" }
    
    git reset --hard origin/main
    if ($LASTEXITCODE -ne 0) { throw "Failed to reset to origin/main" }
    
    # Find the latest prioritized report
    $reportsPath = Join-Path $ProjectPath "reports"
    $latestReport = Get-ChildItem -Path $reportsPath -Filter "*.md" -ErrorAction SilentlyContinue | 
                    Sort-Object LastWriteTime -Descending | 
                    Select-Object -First 1
    
    if ($null -eq $latestReport) {
        throw "No reports found in $reportsPath"
    }
    
    Write-Log "Using report: $($latestReport.Name)"
    
    # Analyze and pick #1 priority
    Write-Log "Analyzing report for top priority..."
    $analyzeScript = Join-Path $ProjectPath "scripts\compound\analyze-report.ps1"
    $analysisJson = & $analyzeScript -ReportPath $latestReport.FullName
    $analysis = $analysisJson | ConvertFrom-Json
    
    $priorityItem = $analysis.priority_item
    $branchName = $analysis.branch_name
    
    Write-Log "Priority item: $priorityItem"
    Write-Log "Branch name: $branchName"
    
    # Check if branch already exists
    $existingBranch = git branch --list $branchName
    if ($existingBranch) {
        Write-Log "Branch $branchName already exists, adding timestamp..."
        $branchName = "$branchName-$(Get-Date -Format 'HHmm')"
    }
    
    # Create feature branch
    Write-Log "Creating feature branch: $branchName"
    git checkout -b $branchName
    if ($LASTEXITCODE -ne 0) { throw "Failed to create branch $branchName" }
    
    # Create PRD
    Write-Log "Creating PRD..."
    $prdFileName = "prd-$($branchName -replace 'feature/', '' -replace '/', '-').md"
    $prdPath = "tasks\$prdFileName"
    
    $prdPrompt = @"
Load the prd skill. Create a detailed PRD (Product Requirements Document) for implementing this feature:

$priorityItem

Include:
- Clear objectives and success criteria
- Technical requirements and constraints
- Implementation approach
- Testing requirements
- Edge cases to handle

Save the PRD to: $prdPath
"@
    
    claude -p $prdPrompt --dangerously-skip-permissions 2>&1 | Tee-Object -Append -FilePath $LogFile
    
    # Convert PRD to tasks
    Write-Log "Converting PRD to tasks..."
    $tasksPrompt = @"
Load the tasks skill. Read the PRD at $prdPath and convert it into a structured task list.
Create a JSON file at scripts\compound\prd.json with an array of tasks, each having:
- id: unique identifier
- title: short description
- description: detailed requirements
- status: "pending"
- dependencies: array of task ids this depends on

Order tasks by dependencies so they can be executed sequentially.
"@
    
    claude -p $tasksPrompt --dangerously-skip-permissions 2>&1 | Tee-Object -Append -FilePath $LogFile
    
    # Run the execution loop
    Write-Log "Starting execution loop..."
    $loopScript = Join-Path $ProjectPath "scripts\compound\loop.ps1"
    & $loopScript -MaxIterations $MaxIterations -ProjectPath $ProjectPath
    
    # Push branch and create PR
    Write-Log "Pushing branch to origin..."
    git push -u origin $branchName
    if ($LASTEXITCODE -ne 0) { throw "Failed to push branch" }
    
    Write-Log "Creating pull request..."
    $prTitle = "Compound: $priorityItem"
    gh pr create --draft --title $prTitle --base main --body "Automated PR created by nightly compound process.`n`nImplements: $priorityItem`n`nSee $prdPath for full requirements."
    
    if ($LASTEXITCODE -ne 0) {
        Write-Log "WARNING: Failed to create PR via gh cli"
    } else {
        Write-Log "Pull request created successfully!"
    }
    
    Write-Log "========================================="
    Write-Log "Auto-compound pipeline completed!"
    Write-Log "========================================="
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    Write-Log $_.ScriptStackTrace
    
    # Attempt to return to main branch on failure
    try {
        git checkout main 2>$null
    } catch {}
    
    exit 1
}
```

---

### 3.5 Prevent Sleep Script

This script prevents Windows from sleeping during automation.

**File:** `scripts\compound\prevent-sleep.ps1`

```powershell
#Requires -Version 7.0
<#
.SYNOPSIS
    Prevents Windows from sleeping for a specified duration.
.PARAMETER Hours
    Number of hours to prevent sleep.
#>

[CmdletBinding()]
param(
    [int]$Hours = 9
)

$LogFile = "C:\projects\your-project\logs\prevent-sleep-$(Get-Date -Format 'yyyy-MM-dd').log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    Add-Content -Path $LogFile -Value $logMessage
}

# Calculate end time
$endTime = (Get-Date).AddHours($Hours)
Write-Log "Preventing sleep until $endTime ($Hours hours)"

# Use SetThreadExecutionState to prevent sleep
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class SleepPreventer {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint SetThreadExecutionState(uint esFlags);
    
    public const uint ES_CONTINUOUS = 0x80000000;
    public const uint ES_SYSTEM_REQUIRED = 0x00000001;
    public const uint ES_DISPLAY_REQUIRED = 0x00000002;
    
    public static void PreventSleep() {
        SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED);
    }
    
    public static void AllowSleep() {
        SetThreadExecutionState(ES_CONTINUOUS);
    }
}
"@

try {
    [SleepPreventer]::PreventSleep()
    Write-Log "Sleep prevention enabled"
    
    # Keep the script running
    while ((Get-Date) -lt $endTime) {
        # Refresh the execution state every 5 minutes
        [SleepPreventer]::PreventSleep()
        Start-Sleep -Seconds 300
    }
    
    Write-Log "Sleep prevention period ended"
}
finally {
    [SleepPreventer]::AllowSleep()
    Write-Log "Sleep prevention disabled"
}
```

---

## 4. Windows Task Scheduler Setup

### 4.1 Using PowerShell to Create Tasks

Run these commands in an **elevated (Administrator) PowerShell** window:

```powershell
# Configuration
$projectPath = "C:\projects\your-project"
$scriptsPath = "$projectPath\scripts\compound"

# Task 1: Prevent Sleep (starts at 5:00 PM)
$preventSleepAction = New-ScheduledTaskAction `
    -Execute "pwsh.exe" `
    -Argument "-ExecutionPolicy Bypass -File `"$scriptsPath\prevent-sleep.ps1`" -Hours 9" `
    -WorkingDirectory $projectPath

$preventSleepTrigger = New-ScheduledTaskTrigger -Daily -At "5:00PM"

$preventSleepSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -WakeToRun `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName "Compound-PreventSleep" `
    -Action $preventSleepAction `
    -Trigger $preventSleepTrigger `
    -Settings $preventSleepSettings `
    -Description "Prevents sleep during nightly compound automation"

# Task 2: Daily Compound Review (10:30 PM)
$reviewAction = New-ScheduledTaskAction `
    -Execute "pwsh.exe" `
    -Argument "-ExecutionPolicy Bypass -File `"$scriptsPath\daily-compound-review.ps1`" -ProjectPath `"$projectPath`"" `
    -WorkingDirectory $projectPath

$reviewTrigger = New-ScheduledTaskTrigger -Daily -At "10:30PM"

$reviewSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -WakeToRun `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask `
    -TaskName "Compound-DailyReview" `
    -Action $reviewAction `
    -Trigger $reviewTrigger `
    -Settings $reviewSettings `
    -Description "Reviews Claude Code threads and updates CLAUDE.md with learnings"

# Task 3: Auto-Compound (11:00 PM)
$autoCompoundAction = New-ScheduledTaskAction `
    -Execute "pwsh.exe" `
    -Argument "-ExecutionPolicy Bypass -File `"$scriptsPath\auto-compound.ps1`" -ProjectPath `"$projectPath`"" `
    -WorkingDirectory $projectPath

$autoCompoundTrigger = New-ScheduledTaskTrigger -Daily -At "11:00PM"

$autoCompoundSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -WakeToRun `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 4)

Register-ScheduledTask `
    -TaskName "Compound-AutoCompound" `
    -Action $autoCompoundAction `
    -Trigger $autoCompoundTrigger `
    -Settings $autoCompoundSettings `
    -Description "Implements top priority feature and creates PR"

Write-Host "All tasks registered successfully!" -ForegroundColor Green
```

### 4.2 Using Task Scheduler GUI (Alternative Method)

If you prefer the graphical interface:

1. Press `Win + R`, type `taskschd.msc`, press Enter
2. Click **Create Task** (not Basic Task) in the right panel
3. Configure each task:

**General Tab:**
- Name: `Compound-DailyReview` (or appropriate name)
- Check "Run whether user is logged on or not"
- Check "Run with highest privileges"

**Triggers Tab:**
- New → Daily → Set time (10:30 PM for review, 11:00 PM for auto-compound)
- Check "Enabled"

**Actions Tab:**
- New → Start a program
- Program: `pwsh.exe`
- Arguments: `-ExecutionPolicy Bypass -File "C:\projects\your-project\scripts\compound\daily-compound-review.ps1"`
- Start in: `C:\projects\your-project`

**Conditions Tab:**
- Uncheck "Start only if computer is on AC power"
- Check "Wake the computer to run this task"

**Settings Tab:**
- Check "Allow task to be run on demand"
- Check "Run task as soon as possible after scheduled start is missed"
- Set "Stop task if it runs longer than" to 4 hours

---

## 5. Power Management Configuration

### 5.1 Allow Wake Timers

For Task Scheduler to wake your computer, wake timers must be enabled:

1. Open **Control Panel** → **Power Options**
2. Click **Change plan settings** for your current plan
3. Click **Change advanced power settings**
4. Expand **Sleep** → **Allow wake timers**
5. Set to **Enable** for both "On battery" and "Plugged in"

### 5.2 PowerShell Method

```powershell
# Enable wake timers (requires Administrator)
powercfg -setacvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1
powercfg -setdcvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1
powercfg -setactive SCHEME_CURRENT
```

### 5.3 Prevent Automatic Sleep During Automation Window (Alternative)

If you'd rather just disable sleep during your automation hours:

```powershell
# Create a power plan for automation hours
powercfg -duplicatescheme SCHEME_CURRENT 12345678-1234-1234-1234-123456789abc
powercfg -changename 12345678-1234-1234-1234-123456789abc "Compound Automation"
powercfg -setacvalueindex 12345678-1234-1234-1234-123456789abc SUB_SLEEP STANDBYIDLE 0
```

---

## 6. Environment Variables

### 6.1 Create .env.local File

Create a `.env.local` file in your project root with any required environment variables:

```
# .env.local
ANTHROPIC_API_KEY=your-api-key-here
GITHUB_TOKEN=your-github-token
PROJECT_NAME=your-project
```

### 6.2 System Environment Variables

For Claude Code to work properly in scheduled tasks, ensure these are set system-wide:

1. Press `Win + R`, type `sysdm.cpl`, press Enter
2. Go to **Advanced** tab → **Environment Variables**
3. Under **System variables**, ensure `PATH` includes:
   - Node.js installation path (e.g., `C:\Program Files\nodejs`)
   - npm global packages (e.g., `%APPDATA%\npm`)
   - Git (e.g., `C:\Program Files\Git\cmd`)
   - GitHub CLI (e.g., `C:\Program Files\GitHub CLI`)

Or via PowerShell (Administrator):

```powershell
# Add to system PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$additions = @(
    "C:\Program Files\nodejs",
    "$env:APPDATA\npm",
    "C:\Program Files\Git\cmd",
    "C:\Program Files\GitHub CLI"
)

foreach ($path in $additions) {
    if ($currentPath -notlike "*$path*") {
        $currentPath = "$currentPath;$path"
    }
}

[Environment]::SetEnvironmentVariable("Path", $currentPath, "Machine")
```

---

## 7. Testing Your Setup

### 7.1 Test Individual Scripts

```powershell
# Test compound review (without actually running Claude)
cd C:\projects\your-project

# Check script syntax
pwsh -ExecutionPolicy Bypass -File .\scripts\compound\daily-compound-review.ps1 -WhatIf

# Run with verbose output
pwsh -ExecutionPolicy Bypass -File .\scripts\compound\daily-compound-review.ps1 -Verbose
```

### 7.2 Test Scheduled Tasks

```powershell
# List all compound tasks
Get-ScheduledTask | Where-Object { $_.TaskName -like "Compound-*" }

# Run a task manually
Start-ScheduledTask -TaskName "Compound-DailyReview"

# Check task status
Get-ScheduledTaskInfo -TaskName "Compound-DailyReview"
```

### 7.3 Verify Task Scheduler Wake Capability

```powershell
# Check if wake timers are enabled
powercfg -query SCHEME_CURRENT SUB_SLEEP RTCWAKE

# List all wake timers
powercfg -waketimers
```

### 7.4 Test Sleep Prevention

```powershell
# Run the prevent-sleep script for 1 minute
pwsh -ExecutionPolicy Bypass -Command "& {
    Add-Type -TypeDefinition @'
    using System;
    using System.Runtime.InteropServices;
    public class Test {
        [DllImport(\"kernel32.dll\")]
        public static extern uint SetThreadExecutionState(uint f);
    }
'@
    [Test]::SetThreadExecutionState(0x80000001)
    Write-Host 'Sleep prevention active for 60 seconds...'
    Start-Sleep -Seconds 60
    [Test]::SetThreadExecutionState(0x80000000)
    Write-Host 'Done'
}"
```

---

## 8. Monitoring and Debugging

### 8.1 View Logs

```powershell
# Tail the compound review log
Get-Content "C:\projects\your-project\logs\compound-review-$(Get-Date -Format 'yyyy-MM-dd').log" -Wait

# Tail the auto-compound log
Get-Content "C:\projects\your-project\logs\auto-compound-$(Get-Date -Format 'yyyy-MM-dd').log" -Wait

# View all recent logs
Get-ChildItem "C:\projects\your-project\logs" -Filter "*.log" | 
    Sort-Object LastWriteTime -Descending | 
    Select-Object -First 5 | 
    ForEach-Object { 
        Write-Host "`n=== $($_.Name) ===" -ForegroundColor Cyan
        Get-Content $_.FullName -Tail 20 
    }
```

### 8.2 Check Task History

```powershell
# View recent task runs
Get-WinEvent -LogName "Microsoft-Windows-TaskScheduler/Operational" -MaxEvents 50 |
    Where-Object { $_.Message -like "*Compound*" } |
    Format-Table TimeCreated, Message -Wrap

# Or use Task Scheduler GUI:
# 1. Open Task Scheduler
# 2. Select your task
# 3. Click "History" tab (enable history if needed: Action → Enable All Tasks History)
```

### 8.3 Create a Monitoring Dashboard Script

**File:** `scripts\compound\status.ps1`

```powershell
#Requires -Version 7.0
<#
.SYNOPSIS
    Shows status of the compound automation system.
#>

param(
    [string]$ProjectPath = "C:\projects\your-project"
)

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "  Compound Automation Status Dashboard" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Check scheduled tasks
Write-Host "`n[Scheduled Tasks]" -ForegroundColor Yellow
$tasks = Get-ScheduledTask | Where-Object { $_.TaskName -like "Compound-*" }
foreach ($task in $tasks) {
    $info = Get-ScheduledTaskInfo -TaskName $task.TaskName
    $status = switch ($task.State) {
        "Ready" { "✓ Ready" }
        "Running" { "▶ Running" }
        "Disabled" { "✗ Disabled" }
        default { $task.State }
    }
    Write-Host "  $($task.TaskName): $status"
    Write-Host "    Last Run: $($info.LastRunTime)" -ForegroundColor Gray
    Write-Host "    Next Run: $($info.NextRunTime)" -ForegroundColor Gray
}

# Check recent logs
Write-Host "`n[Recent Logs]" -ForegroundColor Yellow
$logsPath = Join-Path $ProjectPath "logs"
if (Test-Path $logsPath) {
    Get-ChildItem $logsPath -Filter "*.log" | 
        Sort-Object LastWriteTime -Descending | 
        Select-Object -First 3 | 
        ForEach-Object {
            $size = "{0:N1} KB" -f ($_.Length / 1KB)
            Write-Host "  $($_.Name) ($size) - Modified: $($_.LastWriteTime)"
        }
}

# Check git status
Write-Host "`n[Git Status]" -ForegroundColor Yellow
Set-Location $ProjectPath
$branch = git branch --show-current
$status = git status --porcelain
Write-Host "  Current Branch: $branch"
Write-Host "  Uncommitted Changes: $(if ($status) { $status.Count } else { 0 })"

# Check for open PRs
Write-Host "`n[Open Pull Requests]" -ForegroundColor Yellow
$prs = gh pr list --state open --json title,url,createdAt 2>$null | ConvertFrom-Json
if ($prs) {
    foreach ($pr in $prs) {
        Write-Host "  - $($pr.title)"
        Write-Host "    $($pr.url)" -ForegroundColor Gray
    }
} else {
    Write-Host "  No open PRs"
}

Write-Host "`n=========================================" -ForegroundColor Cyan
```

---

## 9. Troubleshooting

### Problem: Claude Code Not Found

**Symptom:** Task fails with "claude is not recognized"

**Solution:**
```powershell
# Find where claude is installed
Get-Command claude -ErrorAction SilentlyContinue | Select-Object Source

# If not found, reinstall
npm install -g @anthropic-ai/claude-code

# Verify PATH in scheduled task environment
# Add full path to claude in your scripts:
$claudePath = "$env:APPDATA\npm\claude.cmd"
& $claudePath -p "your prompt" --dangerously-skip-permissions
```

### Problem: Task Doesn't Wake Computer

**Symptom:** Tasks missed while computer was sleeping

**Solution:**
1. Verify wake timers are enabled (see Section 5.1)
2. Check if task has "Wake to run" enabled
3. Some laptops disable wake timers on battery - plug in
4. Check BIOS settings for wake timer support

```powershell
# Verify task configuration
Get-ScheduledTask -TaskName "Compound-DailyReview" | 
    Select-Object -ExpandProperty Settings | 
    Select-Object WakeToRun
```

### Problem: Git Authentication Fails

**Symptom:** "fatal: Authentication failed" in logs

**Solution:**
```powershell
# Set up credential helper
git config --global credential.helper manager

# Re-authenticate
gh auth login

# Or use SSH keys instead of HTTPS
```

### Problem: Permission Denied Errors

**Symptom:** Scripts fail with access denied

**Solution:**
```powershell
# Set execution policy for current user
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Ensure task runs with correct user
# In Task Scheduler: check "Run with highest privileges"
```

### Problem: PowerShell Version Issues

**Symptom:** "#Requires -Version 7.0" error

**Solution:**
```powershell
# Install PowerShell 7
winget install Microsoft.PowerShell

# Use pwsh.exe instead of powershell.exe in Task Scheduler
# Change: powershell.exe → pwsh.exe
```

### Problem: Scripts Hang Indefinitely

**Symptom:** Task never completes

**Solution:**
1. Set execution time limit in Task Scheduler settings
2. Add timeout to Claude Code calls:

```powershell
# Add timeout wrapper
$job = Start-Job -ScriptBlock {
    claude -p "your prompt" --dangerously-skip-permissions
}
$job | Wait-Job -Timeout 3600  # 1 hour timeout
if ($job.State -eq 'Running') {
    $job | Stop-Job
    Write-Log "ERROR: Claude Code timed out after 1 hour"
}
$result = $job | Receive-Job
$job | Remove-Job
```

---

## Quick Reference

### Common Commands

```powershell
# Check task status
Get-ScheduledTask | Where-Object { $_.TaskName -like "Compound-*" }

# Run task manually
Start-ScheduledTask -TaskName "Compound-DailyReview"

# View logs
Get-Content "C:\projects\your-project\logs\*.log" -Tail 50

# Check wake timers
powercfg -waketimers

# Disable a task temporarily
Disable-ScheduledTask -TaskName "Compound-AutoCompound"

# Re-enable a task
Enable-ScheduledTask -TaskName "Compound-AutoCompound"

# Remove all compound tasks
Get-ScheduledTask | Where-Object { $_.TaskName -like "Compound-*" } | Unregister-ScheduledTask
```

### File Locations

| Component | Location |
|-----------|----------|
| Scripts | `C:\projects\your-project\scripts\compound\` |
| Logs | `C:\projects\your-project\logs\` |
| Reports | `C:\projects\your-project\reports\` |
| Tasks JSON | `C:\projects\your-project\scripts\compound\prd.json` |
| Environment | `C:\projects\your-project\.env.local` |
| Agent Memory | `C:\projects\your-project\CLAUDE.md` |

---

## What Happens Each Night

| Time | Job | Action |
|------|-----|--------|
| 5:00 PM | Prevent Sleep | Keeps computer awake for 9 hours |
| 10:30 PM | Compound Review | Reviews threads, extracts learnings, updates CLAUDE.md |
| 11:00 PM | Auto-Compound | Picks top priority, implements it, creates PR |
| ~2:00 AM | Sleep Allowed | Computer can sleep again |

When you wake up, you'll have:
- Updated CLAUDE.md files with patterns learned from yesterday's work
- A draft PR implementing your next priority
- Detailed logs showing exactly what happened

The agent gets smarter every day because it reads its own updated instructions before each implementation run.
