param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('balanced', 'quality', 'novelty')]
  [string]$Winner,
  [string]$EnvPath = "C:\\SocialProject\\apps\\api\\.env",
  [switch]$DryRun
)

$weights = @{
  balanced = @{
    keyword = 0.6
    glowup = 0.3
    recency = 0.1
    studio_keyword = 0.7
    studio_impact = 0.3
  }
  quality = @{
    keyword = 0.45
    glowup = 0.45
    recency = 0.1
    studio_keyword = 0.6
    studio_impact = 0.4
  }
  novelty = @{
    keyword = 0.5
    glowup = 0.2
    recency = 0.3
    studio_keyword = 0.65
    studio_impact = 0.35
  }
}

if (-not (Test-Path $EnvPath)) {
  Write-Host "ENV file not found: $EnvPath"
  exit 1
}

$selected = $weights[$Winner]
$updates = @{
  SEARCH_RELEVANCE_WEIGHT_KEYWORD = $selected.keyword
  SEARCH_RELEVANCE_WEIGHT_GLOWUP = $selected.glowup
  SEARCH_RELEVANCE_WEIGHT_RECENCY = $selected.recency
  SEARCH_RELEVANCE_WEIGHT_STUDIO_KEYWORD = $selected.studio_keyword
  SEARCH_RELEVANCE_WEIGHT_STUDIO_IMPACT = $selected.studio_impact
}

$lines = Get-Content $EnvPath
$updated = New-Object System.Collections.Generic.List[string]
$found = @{}

foreach ($line in $lines) {
  $trimmed = $line.Trim()
  if ($trimmed.StartsWith("#") -or $trimmed.Length -eq 0) {
    $updated.Add($line)
    continue
  }

  $parts = $line.Split("=", 2)
  if ($parts.Length -ne 2) {
    $updated.Add($line)
    continue
  }

  $key = $parts[0].Trim()
  if ($updates.ContainsKey($key)) {
    $value = $updates[$key]
    $updated.Add("$key=$value")
    $found[$key] = $true
  } else {
    $updated.Add($line)
  }
}

foreach ($key in $updates.Keys) {
  if (-not $found.ContainsKey($key)) {
    $updated.Add("$key=$($updates[$key])")
  }
}

Write-Host "Winner profile: $Winner"
Write-Host "Updated weights:"
foreach ($key in $updates.Keys) {
  Write-Host "  $key = $($updates[$key])"
}

if ($DryRun) {
  Write-Host "DryRun: no changes written."
  exit 0
}

Set-Content -Path $EnvPath -Value $updated -Encoding utf8
Write-Host "Saved to $EnvPath"

