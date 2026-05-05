# SST AMS - One-click startup script
# Starts backend + Cloudflare tunnel + deploys frontend + opens app

$CLOUDFLARED = "D:\cloudflared.exe"
$FIREBASE = "D:\npm-global\firebase.cmd"
$PROJECT_ROOT = "d:\SST Application management system"
$BACKEND_DIR = "$PROJECT_ROOT\backend"
$FRONTEND_DIR = "$PROJECT_ROOT\frontend"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   SST Application Management System    " -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Start backend
Write-Host "[1/4] Starting backend server..." -ForegroundColor Yellow
$backendRunning = $false
try {
    $res = Invoke-RestMethod -Uri "http://localhost:5000/api/health" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "      Backend already running" -ForegroundColor Green
    $backendRunning = $true
} catch {}

if (-not $backendRunning) {
    Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $BACKEND_DIR -WindowStyle Minimized
    Start-Sleep -Seconds 3
    Write-Host "      Backend started on port 5000" -ForegroundColor Green
}

# Step 2: Start Cloudflare Tunnel
Write-Host "[2/4] Starting Cloudflare tunnel..." -ForegroundColor Yellow
$cfLog = "$env:TEMP\cf-tunnel.log"
$cfErrLog = "$env:TEMP\cf-err.log"
$cfProcess = Start-Process -FilePath $CLOUDFLARED -ArgumentList "tunnel --url http://localhost:5000 --no-autoupdate" -PassThru -RedirectStandardOutput $cfLog -RedirectStandardError $cfErrLog -WindowStyle Hidden

$tunnelUrl = $null
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    $logs = (Get-Content $cfLog -ErrorAction SilentlyContinue) + (Get-Content $cfErrLog -ErrorAction SilentlyContinue)
    $match = $logs | Select-String "https://[a-z0-9\-]+\.trycloudflare\.com" | Select-Object -First 1
    if ($match) {
        $tunnelUrl = $match.Matches[0].Value
        break
    }
}

if (-not $tunnelUrl) {
    Write-Host "      Failed to get tunnel URL" -ForegroundColor Red
    exit 1
}
Write-Host "      Tunnel: $tunnelUrl" -ForegroundColor Green

# Step 3: Build frontend with tunnel URL
Write-Host "[3/4] Building & deploying frontend..." -ForegroundColor Yellow
"VITE_API_URL=$tunnelUrl" | Set-Content "$FRONTEND_DIR\.env.production" -Encoding utf8
Push-Location $FRONTEND_DIR
npm run build 2>&1 | Out-Null
Pop-Location

# Deploy to Firebase
Push-Location $PROJECT_ROOT
& $FIREBASE deploy --only hosting 2>&1 | Out-Null
Pop-Location
Write-Host "      Deployed to Firebase!" -ForegroundColor Green

# Step 4: Open app
Write-Host "[4/4] Opening app..." -ForegroundColor Yellow
Start-Process "https://southsmart-technologies-web.web.app"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  APP IS LIVE!" -ForegroundColor White
Write-Host ""
Write-Host "  URL: https://southsmart-technologies-web.web.app" -ForegroundColor Cyan
Write-Host "  Backend: $tunnelUrl" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Keep this window open while using the app." -ForegroundColor Yellow
Write-Host "Close this window to stop everything." -ForegroundColor Yellow
Write-Host ""

try {
    while ($true) { Start-Sleep -Seconds 30 }
} finally {
    Write-Host "Stopping tunnel..." -ForegroundColor Yellow
    if ($cfProcess) { Stop-Process -Id $cfProcess.Id -Force -ErrorAction SilentlyContinue }
}
