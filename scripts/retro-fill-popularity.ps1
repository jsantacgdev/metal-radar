# Retro-rellena lastfm_listeners para todas las bandas.
# Llama a update-band-listeners en bucle hasta que devuelva done=true.
# Cada invocación procesa ~100 bandas (~25 segundos por la latencia de Last.fm).

$url = "https://vzghxgfrxqwuxwmnretm.supabase.co/functions/v1/update-band-popularity"
$anonKey = "sb_publishable_PoME-xzyU_mY0ggMoYl0SQ_ItEnjBAc"

$totalProcessed = 0
$totalUpdated = 0
$totalNotFound = 0
$totalErrors = 0
$iteration = 0
$maxIterations = 200 # 200 × 100 = 20.000 bandas, suficiente para 15k

do {
  $iteration++
  Write-Host "-> Iteracion $iteration..." -ForegroundColor Cyan

  try {
    $response = Invoke-RestMethod -Method Post -Uri $url `
      -Headers @{ "Authorization" = "Bearer $anonKey"; "Content-Type" = "application/json" } `
      -Body "{}" `
      -TimeoutSec 120

    Write-Host "   processed=$($response.processed) updated=$($response.updated) not_found=$($response.not_found) errors=$($response.errors) done=$($response.done)" -ForegroundColor Green

    $totalProcessed += $response.processed
    $totalUpdated += $response.updated
    $totalNotFound += $response.not_found
    $totalErrors += $response.errors

    if ($response.rate_limited) {
      Write-Host "   Rate limited por Last.fm. Esperando 60s..." -ForegroundColor Yellow
      Start-Sleep -Seconds 60
    }

    if ($response.done) {
      Write-Host "   Todas las bandas procesadas." -ForegroundColor Green
      break
    }

    Start-Sleep -Seconds 2
  }
  catch {
    Write-Host "   ERROR: $_" -ForegroundColor Red
    Start-Sleep -Seconds 10
  }
} while ($iteration -lt $maxIterations)

Write-Host ""
Write-Host "================================" -ForegroundColor Yellow
Write-Host "TOTAL processed: $totalProcessed" -ForegroundColor Yellow
Write-Host "TOTAL updated:   $totalUpdated" -ForegroundColor Yellow
Write-Host "TOTAL not_found: $totalNotFound" -ForegroundColor Yellow
Write-Host "TOTAL errors:    $totalErrors" -ForegroundColor Yellow
Write-Host "================================" -ForegroundColor Yellow