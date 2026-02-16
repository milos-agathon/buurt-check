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