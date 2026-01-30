<#
.SYNOPSIS
    Full pipeline: report -> PRD -> tasks -> implementation -> PR
.DESCRIPTION
    Picks the top priority from reports, creates a PRD, breaks it into tasks,
    executes them, and creates a pull request.
#>

[CmdletBinding()]
param(
    [string]$ProjectPath = "D:\\buurt-check",
    [int]$MaxIterations = 25
)
if ($PSVersionTable.PSVersion.Major -lt 7) {
    Write-Warning "PowerShell 7+ is recommended for this script; running on $($PSVersionTable.PSVersion)."
}


# Configuration
$ErrorActionPreference = "Stop"
$LogFile = Join-Path $ProjectPath "logs\\auto-compound-$(Get-Date -Format 'yyyy-MM-dd').log"

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
    $analyzeScript = Join-Path $ProjectPath "scripts\\compound\\analyze-report.ps1"
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
    $prdPath = "tasks\\$prdFileName"

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
Create a JSON file at scripts\\compound\\prd.json with an array of tasks, each having:
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
    $loopScript = Join-Path $ProjectPath "scripts\\compound\\loop.ps1"
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
