$cfg = Get-Content 'D:\workspace\goproject\my\aicook\backend\configs\config.yaml' -Raw
$base = ([regex]::Match($cfg, 'base_url:\s*"([^"]+)"')).Groups[1].Value.TrimEnd('/')
$key = ([regex]::Match($cfg, 'api_key:\s*"([^"]+)"')).Groups[1].Value
$model = ([regex]::Match($cfg, 'embedding_model:\s*"([^"]+)"')).Groups[1].Value
$body = @{ model = $model; input = @('test embedding request') } | ConvertTo-Json -Depth 4
try {
  $resp = Invoke-WebRequest -UseBasicParsing -Method Post -Uri ($base + '/embeddings') -Headers @{ Authorization = 'Bearer ' + $key } -ContentType 'application/json' -Body $body -TimeoutSec 30
  Write-Output ('STATUS=' + $resp.StatusCode)
  $content = $resp.Content
  if ($content.Length -gt 800) { Write-Output $content.Substring(0, 800) } else { Write-Output $content }
} catch {
  if ($_.Exception.Response) {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Output ('STATUS=' + $status)
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $bodyText = $reader.ReadToEnd()
    if ($bodyText.Length -gt 800) { Write-Output $bodyText.Substring(0, 800) } else { Write-Output $bodyText }
  } else {
    Write-Output ('ERROR=' + $_.Exception.Message)
  }
}
