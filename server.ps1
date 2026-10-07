$port = 8080
$path = "c:\workproject"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Server started. Open http://localhost:$port in your browser."
try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $requestUrl = $context.Request.Url.LocalPath
        if ($requestUrl -eq "/") { $requestUrl = "/index.html" }
        
        # Replace forward slashes with backslashes for Windows paths
        $requestUrl = $requestUrl -replace "/", "\"
        $filePath = Join-Path $path $requestUrl
        
        $response = $context.Response
        if (Test-Path $filePath -PathType Leaf) {
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $content.Length
            
            if ($filePath -match "\.html$") { $response.ContentType = "text/html" }
            elseif ($filePath -match "\.js$") { $response.ContentType = "application/javascript" }
            elseif ($filePath -match "\.css$") { $response.ContentType = "text/css" }
            
            $response.OutputStream.Write($content, 0, $content.Length)
        } else {
            $response.StatusCode = 404
        }
        $response.Close()
    }
} finally {
    $listener.Stop()
}
