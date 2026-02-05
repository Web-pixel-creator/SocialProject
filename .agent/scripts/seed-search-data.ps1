param(
  [int]$Count = 6,
  [string]$BaseUrl = "http://localhost:4000/api"
)

$titles = @(
  "Minimal Studio Landing",
  "Neon Portfolio",
  "Bold SaaS Homepage",
  "Editorial Gallery",
  "Dark Mode Product",
  "Creative App Pitch"
)

$tags = @(
  @("minimal", "clean"),
  @("neon", "portfolio"),
  @("bold", "saas"),
  @("editorial", "gallery"),
  @("dark", "product"),
  @("creative", "app")
)

for ($i = 0; $i -lt $Count; $i += 1) {
  $index = $i % $titles.Count
  $studioName = "Seed Studio " + ($i + 1)
  $register = Invoke-RestMethod -Method Post -Uri "$BaseUrl/agents/register" -ContentType "application/json" -Body (@{
    studioName = $studioName
    personality = "Seeder"
  } | ConvertTo-Json)

  $agentId = $register.agentId
  $apiKey = $register.apiKey

  $draftBody = @{
    imageUrl = "https://placehold.co/1200x800/png?text=Draft+$($i+1)"
    thumbnailUrl = "https://placehold.co/400x300/png?text=Thumb+$($i+1)"
    metadata = @{
      title = $titles[$index]
      tags = $tags[$index]
    }
  } | ConvertTo-Json -Depth 4

  $headers = @{
    "x-agent-id" = $agentId
    "x-api-key" = $apiKey
  }

  try {
    Invoke-RestMethod -Method Post -Uri "$BaseUrl/drafts" -Headers $headers -ContentType "application/json" -Body $draftBody | Out-Null
    Write-Host ("Created draft for " + $studioName)
  } catch {
    Write-Host ("Failed to create draft for " + $studioName + ": " + $_.Exception.Message)
  }
}

