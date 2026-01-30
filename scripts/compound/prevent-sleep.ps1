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
if ($PSVersionTable.PSVersion.Major -lt 7) {
    Write-Warning "PowerShell 7+ is recommended for this script; running on $($PSVersionTable.PSVersion)."
}


$LogFile = "D:\\buurt-check\\logs\\prevent-sleep-$(Get-Date -Format 'yyyy-MM-dd').log"

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
