# Corrige concert_bands.is_headliner en conciertos ya sincronizados.
# Antes, sync-concerts marcaba como headliner a la primera "attraction" que
# devolvia Ticketmaster, pero ese orden no es fiable (no es billing order).
# Este script llama a fix-concert-headliners en bucle (paginado por offset)
# hasta que devuelva done=true.
#
# Requiere la variable de entorno CRON_SECRET (el mismo secreto configurado
# en el proyecto de Supabase para las funciones cron-*). Ejecutar antes:
#   $env:CRON_SECRET = "..."

$url = "https://vzghxgfrxqwuxwmnretm.supabase.co/functions/v1/fix-concert-headliners"
$secret = "42Nk3OpSZjeFCAba10BUdnGRIJw7frlm"

if (-not $secret) {
  Write-Host "Falta la variable de entorno CRON_SECRET. Define `$env:CRON_SECRET` y vuelve a ejecutar." -ForegroundColor Red
  exit 1
}

$batch = 15
$offset = 0

$totalProcessed = 0
$totalUpdated = 0
$totalUnmatched = 0
$totalTourName = 0
$totalMbid = 0
$totalExpired = 0
$totalErrors = 0
$iteration = 0
$maxIterations = 500

do {
  $iteration++
  Write-Host "-> Lote $iteration (offset=$offset)..." -ForegroundColor Cyan

  try {
    $response = Invoke-RestMethod -Method Post -Uri "$url`?offset=$offset&batch=$batch" `
      -Headers @{ "Authorization" = "Bearer $secret"; "Content-Type" = "application/json" } `
      -Body "{}" `
      -TimeoutSec 120

    Write-Host "   processed=$($response.processed) headliner_updated=$($response.headliner_updated) headliner_unmatched=$($response.headliner_unmatched) tour_name_updated=$($response.tour_name_updated) mbid_updated=$($response.mbid_updated) expired_on_tm=$($response.expired_on_tm) errors=$($response.errors)" -ForegroundColor Green

    $totalProcessed += $response.processed
    $totalUpdated += $response.headliner_updated
    $totalUnmatched += $response.headliner_unmatched
    $totalTourName += $response.tour_name_updated
    $totalMbid += $response.mbid_updated
    $totalExpired += $response.expired_on_tm
    $totalErrors += $response.errors

    if ($response.done) {
      Write-Host "   Todos los conciertos revisados." -ForegroundColor Green
      break
    }

    $offset = $response.next_offset
    Start-Sleep -Seconds 1
  }
  catch {
    Write-Host "   ERROR: $_" -ForegroundColor Red
    Start-Sleep -Seconds 10
  }
} while ($iteration -lt $maxIterations)

Write-Host ""
Write-Host "================================" -ForegroundColor Yellow
Write-Host "TOTAL processed:         $totalProcessed" -ForegroundColor Yellow
Write-Host "TOTAL headliner_updated: $totalUpdated" -ForegroundColor Yellow
Write-Host "TOTAL headliner_unmatch: $totalUnmatched" -ForegroundColor Yellow
Write-Host "TOTAL tour_name_updated: $totalTourName" -ForegroundColor Yellow
Write-Host "TOTAL mbid_updated:      $totalMbid" -ForegroundColor Yellow
Write-Host "TOTAL expired_on_tm:     $totalExpired" -ForegroundColor Yellow
Write-Host "TOTAL errors:            $totalErrors" -ForegroundColor Yellow
Write-Host "================================" -ForegroundColor Yellow
