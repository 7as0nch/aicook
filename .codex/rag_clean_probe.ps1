$text = Get-Content 'rag.txt' -Raw
$clean = $text -replace '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', ''
$clean = $clean.Replace([string][char]0xFFFD, '')
$lines = $clean -split "`r?`n"
$lines | Select-Object -First 40
