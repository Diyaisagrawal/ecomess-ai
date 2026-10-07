# EcoMess AI - one-click local run (Windows)
# Starts Postgres (Docker), the ML service, the API and the frontend, each in its own window.
# Usage: double-click start-local.bat   (or: powershell -ExecutionPolicy Bypass -File start-local.ps1)

$ErrorActionPreference = 'Continue'  # native tools write warnings to stderr
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "`nERROR: $msg" -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# ---------- 1. prerequisites ----------
Step 'Checking prerequisites'
if (-not (Has node))   { Fail 'Node.js not found. Install Node 20+ from https://nodejs.org' }
if (-not (Has python)) { Fail 'Python not found. Install Python 3.11 or 3.12 from https://python.org' }
if (-not (Has docker)) { Fail 'Docker not found. Install Docker Desktop (used for Postgres), then start it.' }
$pyVer = (python -c "import sys;print(f'{sys.version_info[0]}.{sys.version_info[1]}')")
Write-Host "Node $(node -v) | Python $pyVer | $(docker --version)"
if ([version]$pyVer -lt [version]'3.10') { Fail "Python $pyVer is too old - need 3.10+." }

docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail 'Docker Desktop is installed but not running. Start it, wait for the whale icon, then rerun.' }

# ---------- 2. database ----------
Step 'Starting Postgres (docker compose)'
docker compose up -d postgres
if ($LASTEXITCODE -ne 0) { Fail 'Could not start Postgres. Is port 5432 already used by another Postgres?' }
for ($i = 0; $i -lt 30; $i++) {
  docker exec ecomess_postgres pg_isready -U ecomess *> $null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 1
}
Write-Host 'Postgres is ready on localhost:5432'

# ---------- 3. env files ----------
Step 'Checking env files'
if (-not (Test-Path 'backend\.env'))         { Copy-Item 'backend\.env.example' 'backend\.env';               Write-Host 'Created backend\.env' }
if (-not (Test-Path 'frontend\.env.local'))  { Copy-Item 'frontend\.env.example' 'frontend\.env.local';        Write-Host 'Created frontend\.env.local' }
$dbLine = Get-Content 'backend\.env' | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $dbLine) { Fail 'DATABASE_URL missing in backend\.env' }
$dbUrl = ($dbLine -split '=', 2)[1].Trim().Trim('"')
Write-Host "Using DATABASE_URL from backend\.env"

# ---------- 4. backend ----------
Step 'Backend: installing packages, migrating, seeding demo data'
Push-Location backend
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'npm install failed in backend' }
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'Prisma migrate failed - check DATABASE_URL in backend\.env' }
npm run seed
Pop-Location

# ---------- 5. ML service ----------
Step 'ML service: preparing Python venv'
Push-Location ml-service
if (-not (Test-Path 'venv\Scripts\python.exe')) { python -m venv venv }
& .\venv\Scripts\python.exe -m pip install --upgrade pip -q
& .\venv\Scripts\python.exe -m pip install -r requirements.txt -q
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Install into old venv failed - recreating venv' -ForegroundColor Yellow
  Remove-Item -Recurse -Force venv
  python -m venv venv
  & .\venv\Scripts\python.exe -m pip install -r requirements.txt -q
  if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'pip install failed in ml-service' }
}
Pop-Location

# ---------- 6. frontend ----------
Step 'Frontend: installing packages'
Push-Location frontend
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'npm install failed in frontend' }
Pop-Location

# ---------- 7. launch ----------
Step 'Launching services in separate windows'
Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle='EcoMess ML :8000'; cd '$root\ml-service'; `$env:DATABASE_URL='$dbUrl'; .\venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000"
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle='EcoMess API :5000'; cd '$root\backend'; npm run dev"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle='EcoMess Web :3000'; cd '$root\frontend'; npm run dev"

Step 'Waiting for the frontend to come up'
for ($i = 0; $i -lt 60; $i++) {
  try { Invoke-WebRequest 'http://localhost:3000/login' -UseBasicParsing -TimeoutSec 2 *> $null; break } catch { Start-Sleep -Seconds 2 }
}
Start-Process 'http://localhost:3000'

Write-Host "`nEcoMess AI is running:" -ForegroundColor Green
Write-Host '  App       http://localhost:3000   (click "Try the demo account")'
Write-Host '  API       http://localhost:5000/health'
Write-Host '  ML docs   http://localhost:8000/docs'
Write-Host "`nTo stop: close the three service windows. Postgres keeps running in Docker (docker compose stop)."
Read-Host "`nPress Enter to close this window"
