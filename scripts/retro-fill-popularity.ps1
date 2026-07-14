# Retro-rellena lastfm_listeners para todas las bandas.
# Llama a update-band-listeners en bucle hasta que devuelva done=true.
# Cada invocación procesa ~100 bandas (~25 segundos por la latencia de Last.fm).
#
# update-band-popularity ahora exige el CRON_SECRET configurado en el
# proyecto de Supabase (antes se llamaba con la clave anónima, pero la
# función no comprobaba ninguna autorización — ver auditoría de seguridad).
# Define la variable de entorno CRON_SECRET antes de ejecutar este script:
#   $env:CRON_SECRET = "el-valor-real"
#   .\retro-fill-popularity.ps1
# No hardcodees el valor real aquí ni lo subas a git.

$url = "https://vzghxgfrxqwuxwmnretm.supabase.co/functions/v1/update-band-popularity"

if (-not $env:CRON_SECRET) {
  Write-Host "ERROR: falta la variable de entorno CRON_SECRET." -ForegroundColor Red
  Write-Host 'Define primero: $env:CRON_SECRET = "el-valor-real"' -ForegroundColor Yellow
  exit 1
}
$cronSecret = $env:CRON_SECRET

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
      -Headers @{ "Authorization" = "Bearer $cronSecret"; "Content-Type" = "application/json" } `
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