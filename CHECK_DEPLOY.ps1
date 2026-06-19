Write-Host "HWBT Academy - controle avant mise en ligne" -ForegroundColor Yellow

$required = @(
  "index.html",
  "netlify.toml",
  "package.json",
  "netlify/functions/state.mts"
)

$ok = $true

foreach ($file in $required) {
  if (Test-Path -LiteralPath $file) {
    Write-Host "OK   $file" -ForegroundColor Green
  } else {
    Write-Host "MISS $file" -ForegroundColor Red
    $ok = $false
  }
}

if ($ok) {
  Write-Host ""
  Write-Host "Tout est pret pour GitHub + Netlify." -ForegroundColor Green
  Write-Host "Envoie tout ce dossier sur GitHub, puis connecte le repo dans Netlify." -ForegroundColor Gray
} else {
  Write-Host ""
  Write-Host "Il manque des fichiers. Ne deploie pas encore." -ForegroundColor Red
}
