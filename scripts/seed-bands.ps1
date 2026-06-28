$tags = @(
  "heavy metal", "death metal", "black metal", "doom metal", "thrash metal",
  "power metal", "progressive metal", "metalcore", "deathcore", "sludge metal",
  "stoner metal", "post-metal", "djent", "symphonic metal", "folk metal",
  "viking metal", "melodic death metal", "technical death metal", "brutal death metal",
  "nu metal", "groove metal", "industrial metal", "gothic metal", "alternative metal",
  "hard rock", "classic rock", "progressive rock", "psychedelic rock", "stoner rock",
  "post-rock", "punk rock", "hardcore punk", "post-hardcore", "screamo",
  "grindcore", "crust punk", "metal", "rock", "alternative rock", "indie rock"
)

$url = "https://vzghxgfrxqwuxwmnretm.supabase.co/functions/v1/seed-bands-by-genre"
$secret = "42Nk3OpSZjeFCAba10BUdnGRIJw7frlm"

$totalInserted = 0
$totalUpdated = 0
$totalFetched = 0

foreach ($tag in $tags) {
  Write-Host "-> Seeding: $tag" -ForegroundColor Cyan

  $body = @{ tag = $tag; limit = 500 } | ConvertTo-Json

  try {
    $response = Invoke-RestMethod -Method Post -Uri $url `
      -Headers @{ "Authorization" = "Bearer $secret"; "Content-Type" = "application/json" } `
      -Body $body `
      -TimeoutSec 120

    Write-Host "   fetched=$($response.fetched) inserted=$($response.inserted) updated=$($response.updated) ($($response.elapsed_ms)ms)" -ForegroundColor Green

    $totalFetched += $response.fetched
    $totalInserted += $response.inserted
    $totalUpdated += $response.updated
  }
  catch {
    Write-Host "   ERROR: $_" -ForegroundColor Red
  }

  Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "===============================" -ForegroundColor Yellow
Write-Host "TOTAL fetched:  $totalFetched" -ForegroundColor Yellow
Write-Host "TOTAL inserted: $totalInserted" -ForegroundColor Yellow
Write-Host "TOTAL updated:  $totalUpdated" -ForegroundColor Yellow
Write-Host "===============================" -ForegroundColor Yellow