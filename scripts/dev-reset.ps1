<#
.SYNOPSIS
    Stops the local buurt-check dev servers.
.DESCRIPTION
    Kills any process listening on the backend port (8000) and frontend port
    (5173). Intended as a fast cleanup step before restarting local dev.
.EXAMPLE
    .\scripts\dev-reset.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

function Stop-PortListener {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port,

        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if (-not $connections -or $connections.Count -eq 0) {
        Write-Host "[$Label] Nothing listening on port $Port" -ForegroundColor DarkGray
        return
    }

    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $pids) {
        $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($null -eq $process) {
            Write-Host "[$Label] PID $pid already exited" -ForegroundColor DarkGray
            continue
        }

        Write-Host "[$Label] Stopping $($process.ProcessName) (PID $pid) on port $Port" -ForegroundColor Yellow
        Stop-Process -Id $pid -Force -ErrorAction Stop
    }
}

Stop-PortListener -Port 8000 -Label "backend"
Stop-PortListener -Port 5173 -Label "frontend"

Write-Host ""
Write-Host "Dev ports reset complete." -ForegroundColor Green
