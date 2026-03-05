$path = $PSScriptRoot
$port = 3333
Write-Host "Starting server on http://localhost:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

while($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response
        
        $localPath = $req.Url.LocalPath.TrimStart('/')
        if ($localPath -eq "") { $localPath = "index.html" }
        $filePath = [System.IO.Path]::Combine($path, $localPath.Replace('/', '\'))
        
        if ([System.IO.File]::Exists($filePath)) {
            $res.StatusCode = 200
            if ($filePath.EndsWith(".html")) { $res.ContentType = "text/html; charset=utf-8" }
            elseif ($filePath.EndsWith(".css")) { $res.ContentType = "text/css; charset=utf-8" }
            elseif ($filePath.EndsWith(".js")) { $res.ContentType = "text/javascript; charset=utf-8" }
            elseif ($filePath.EndsWith(".png")) { $res.ContentType = "image/png" }
            
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $res.ContentLength64 = $content.Length
            $res.OutputStream.Write($content, 0, $content.Length)
        } else {
            $res.StatusCode = 404
            $message = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $res.OutputStream.Write($message, 0, $message.Length)
        }
        $res.OutputStream.Close()
    } catch {
        # ignore context errors on shutdown
    }
}
