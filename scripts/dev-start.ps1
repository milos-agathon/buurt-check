<#
.SYNOPSIS
    Resets, checks, and starts the buurt-check backend and frontend.
.DESCRIPTION
    1. Stops existing dev servers on ports 8000 and 5173
    2. Runs backend and frontend quality/build checks
    3. Starts backend and frontend in separate PowerShell windows
    4. Opens Chrome at http://localhost:5173/
    5. Prints the manual steps for iPhone-sized responsive mode
.EXAMPLE
    .\scripts\dev-start.ps1
.EXAMPLE
    .\scripts\dev-start.ps1 -SkipChecks
.EXAMPLE
    .\scripts\dev-start.ps1 -SkipChecks -NoChrome
#>

[CmdletBinding()]
param(
    [switch]$SkipChecks,
    [switch]$NoChrome
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$resetScript = Join-Path $PSScriptRoot "dev-reset.ps1"

function Assert-PathExists {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    if (-not (Test-Path $Path)) {
        throw "$Label not found: $Path"
    }
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title,

        [Parameter(Mandatory = $true)]
        [string]$Command,

        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory
    )

    Write-Host ""
    Write-Host $Title -ForegroundColor Cyan
    Push-Location $WorkingDirectory
    try {
        Invoke-Expression $Command
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $Command"
        }
    }
    finally {
        Pop-Location
    }
}

function Get-PowerShellExe {
    $pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
    if ($pwsh) {
        return $pwsh
    }

    $windowsPs = (Get-Command powershell -ErrorAction SilentlyContinue).Source
    if ($windowsPs) {
        return $windowsPs
    }

    throw "Could not find pwsh or powershell in PATH."
}

function Get-ChromeExe {
    $candidates = @(
        (Get-Command chrome -ErrorAction SilentlyContinue).Source,
        (Get-Command chrome.exe -ErrorAction SilentlyContinue).Source,
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
    ) | Where-Object { $_ -and (Test-Path $_) }

    return $candidates | Select-Object -First 1
}

function Start-DevWindow {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title,

        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory,

        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    $shell = Get-PowerShellExe
    $fullCommand = @"
`$Host.UI.RawUI.WindowTitle = '$Title'
Set-Location '$WorkingDirectory'
$Command
"@

    Start-Process -FilePath $shell -ArgumentList @(
        "-NoExit",
        "-Command",
        $fullCommand
    ) | Out-Null
}

Assert-PathExists -Path $backendDir -Label "Backend directory"
Assert-PathExists -Path $frontendDir -Label "Frontend directory"
Assert-PathExists -Path $resetScript -Label "Reset script"

Write-Host "Resetting local dev ports..." -ForegroundColor Cyan
& $resetScript

if (-not $SkipChecks) {
    Invoke-Step -Title "Backend lint: ruff check ." -Command "ruff check ." -WorkingDirectory $backendDir
    Invoke-Step -Title 'Backend tests: pytest -x -q -m "not live"' -Command 'pytest -x -q -m "not live"' -WorkingDirectory $backendDir
    Invoke-Step -Title "Frontend build: npm run build" -Command "npm run build" -WorkingDirectory $frontendDir
}
else {
    Write-Host ""
    Write-Host "Skipping backend/frontend checks." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Starting backend dev server..." -ForegroundColor Cyan
Start-DevWindow `
    -Title "buurt-check backend" `
    -WorkingDirectory $backendDir `
    -Command "uvicorn app.main:app --reload --port 8000"

Write-Host "Starting frontend dev server..." -ForegroundColor Cyan
Start-DevWindow `
    -Title "buurt-check frontend" `
    -WorkingDirectory $frontendDir `
    -Command "npm run dev"

Start-Sleep -Seconds 4

if (-not $NoChrome) {
    $chrome = Get-ChromeExe
    if ($chrome) {
        Write-Host "Opening Chrome..." -ForegroundColor Cyan
        Start-Process -FilePath $chrome -ArgumentList "http://localhost:5173/" | Out-Null
    }
    else {
        Write-Host "Chrome not found automatically. Open http://localhost:5173/ manually." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Dev environment is starting." -ForegroundColor Green
Write-Host ""
Write-Host "Chrome iPhone check:" -ForegroundColor Cyan
Write-Host "1. Open http://localhost:5173/" -ForegroundColor White
Write-Host "2. Press F12" -ForegroundColor White
Write-Host "3. Press Ctrl+Shift+M" -ForegroundColor White
Write-Host "4. Choose an iPhone preset, or set Responsive mode to 375 x 812" -ForegroundColor White
Write-Host "5. Keep portrait orientation and refresh with Ctrl+R" -ForegroundColor White
