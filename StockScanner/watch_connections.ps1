# Watches established TCP connections from any python.exe to Polygon (198.44.194.0/24).
# Run this in a third terminal alongside scanner + backend so you can see whether
# the count actually grows from THIS machine or whether the dashboard is showing
# ghosts from prior runs that haven't been reaped yet.
Write-Host "Watching python.exe -> 198.44.194.* connections. Ctrl-C to stop." -ForegroundColor Cyan
$last = -1
while ($true) {
    $pids = (Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'python.exe' }).ProcessId
    $conns = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue |
        Where-Object { $_.OwningProcess -in $pids -and $_.RemoteAddress -like '198.44.194.*' }
    $count = ($conns | Measure-Object).Count
    if ($count -ne $last) {
        $ts = Get-Date -Format 'HH:mm:ss'
        Write-Host "[$ts] python -> Polygon TCP: $count" -ForegroundColor Yellow
        if ($count -gt 0) {
            $conns | ForEach-Object { "    PID $($_.OwningProcess)  $($_.LocalPort) -> $($_.RemoteAddress):$($_.RemotePort)" } | Write-Host
        }
        $last = $count
    }
    Start-Sleep -Seconds 1
}
