# SST AMS - Start Backend + Ngrok + Deploy to Firebase
# Run this script to make the app publicly accessible

$NGROK = "C:\Users\WELCOME\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
$FIREBASE = "D:\npm-global\firebase.cmd"
$PROJECT_ROOT = "d:\SST Application management system"
$BACKEND = "$PROJECT_ROOT\backend"
$FRONTEND = "$PROJECT_ROOT\frontend"

Write-Host "=== SST AMS Deploy ===" -ForegroundColor Cyan

# Step 1: Start backend
Write-Host "`n[1/4] Starting backend server..." -ForegroundColor Yellow
$backend = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $BACKEND -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 3
Write-Host "    Backend started (PID: $($backend.Id))" -ForegroundColor Green

# Step 2: Start ngrok
Write-Host "`n[2/4] Starting ngrok tunnel..." -ForegroundColor Yellow
$ngrokProcess = Start-Process -FilePath $NGROK -ArgumentList "http 5000 --log=stdout" -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 4

# Get ngrok URL from local API
$ngrokUrl = $null
for ($i = 0; $i -lt 10; $i++) {
    try {
        $tunnels = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -ErrorAction Stop
        $ngrokUrl = ($tunnels.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1).public_url
        if ($ngrokUrl) { break }
    } catch { Start-Sleep -Seconds 1 }
}

if (-not $ngrokUrl) {
    Write-Host "    Failed to get ngrok URL. Checking ngrok status..." -ForegroundColor Red
    exit 1
}

Write-Host "    ngrok URL: $ngrokUrl" -ForegroundColor Green

# Step 3: Build frontend with ngrok URL
Write-Host "`n[3/4] Building frontend with backend URL..." -ForegroundColor Yellow
$envContent = "VITE_API_URL=$ngrokUrl"
Set-Content -Path "$FRONTEND\.env.production" -Value $envContent -Encoding utf8

Push-Location $FRONTEND
npm run build | Out-Null
Pop-Location
Write-Host "    Frontend built!" -ForegroundColor Green

# Step 4: Deploy to Firebase
Write-Host "`n[4/4] Deploying to Firebase..." -ForegroundColor Yellow
Push-Location $PROJECT_ROOT
& $FIREBASE deploy --only hosting 2>&1 | Select-String "Hosting URL|complete|Error"
Pop-Location

Write-Host "`n=============================" -ForegroundColor Cyan
Write-Host " APP IS LIVE!" -ForegroundColor Green
Write-Host " Public URL: https://southsmart-technologies-web.web.app" -ForegroundColor White
Write-Host " Backend:    $ngrokUrl" -ForegroundColor White
Write-Host "=============================" -ForegroundColor Cyan
Write-Host "`nKeep this window open while using the app." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop all servers." -ForegroundColor Yellow

# Wait
try {
    while ($true) { Start-Sleep -Seconds 60 }
} finally {
    Write-Host "`nStopping servers..." -ForegroundColor Yellow
    if ($backend) { Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue }
    if ($ngrokProcess) { Stop-Process -Id $ngrokProcess.Id -Force -ErrorAction SilentlyContinue }
}
