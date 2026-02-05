param(
  [int]$Hours = 48,
  [int]$IntervalMinutes = 15,
  [string]$BaseUrl = "http://localhost:4000",
  [string]$OutDir = "",
  [string]$AdminToken = "",
  [switch]$Once
)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $OutDir) {
  $OutDir = Join-Path $scriptRoot "..\\metrics"
}

if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
}

if (-not $AdminToken) {
  if ($env:ADMIN_API_TOKEN) {
    $AdminToken = $env:ADMIN_API_TOKEN
  }
}

if (-not $AdminToken) {
  $envFile = Join-Path $scriptRoot "..\\..\\apps\\api\\.env"
  if (Test-Path $envFile) {
    $lines = Get-Content $envFile
    foreach ($line in $lines) {
      if ($line -match "^\s*#") { continue }
      if ($line -match "^\s*$") { continue }
      $parts = $line.Split("=", 2)
      if ($parts.Length -eq 2 -and $parts[0].Trim() -eq "ADMIN_API_TOKEN") {
        $AdminToken = $parts[1].Trim()
        break
      }
    }
  }
}

if (-not $AdminToken) {
  $AdminToken = "change-me"
}

$headers = @{ "x-admin-token" = $AdminToken }
$outFile = Join-Path $OutDir ("ab-search-" + (Get-Date -Format "yyyyMMdd") + ".jsonl")

function Write-Record($data) {
  $record = @{
    timestamp = (Get-Date).ToString("o")
    windowHours = $Hours
    data = $data
  }
  $json = $record | ConvertTo-Json -Depth 8 -Compress
  Add-Content -Path $outFile -Value $json
}

function Collect-Once {
  $uri = "$BaseUrl/api/admin/ux/similar-search?hours=$Hours"
  try {
    $result = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
    Write-Record $result
    Write-Host ("Collected A/B metrics: " + (Get-Date))
  } catch {
    $errorRecord = @{
      error = $_.Exception.Message
    }
    Write-Record $errorRecord
    Write-Host ("Failed to collect metrics: " + $_.Exception.Message)
  }
}

if ($Once -or $IntervalMinutes -le 0) {
  Collect-Once
  exit 0
}

while ($true) {
  Collect-Once
  Start-Sleep -Seconds ($IntervalMinutes * 60)
}

