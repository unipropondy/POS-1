$dishGroupId = "EE092460-64C6-4E97-B6B1-01E77299E9A1"

Write-Host "Testing with DishGroupId: $dishGroupId"
Write-Host ""

# Test dishes endpoint
Write-Host "[1] Testing /dishes endpoint..."
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3000/dishes/$dishGroupId" -Method GET -UseBasicParsing -ErrorAction Stop
    $dishes = $resp.Content | ConvertFrom-Json
    $count = if ($dishes) { @($dishes).Count } else { 0 }
    
    Write-Host "    ✅ Success: $count dishes loaded"
    if ($count -gt 0) {
        Write-Host "    First dish: $($dishes[0].Name) (ID: $($dishes[0].DishId))"
        
        # Test modifiers endpoint with this dish
        Write-Host ""
        Write-Host "[2] Testing /modifiers endpoint..."
        $dishId = $dishes[0].DishId
        
        try {
            $modResp = Invoke-WebRequest -Uri "http://localhost:3000/modifiers/$dishId" -Method GET -UseBasicParsing -ErrorAction Stop
            $modifiers = $modResp.Content | ConvertFrom-Json
            $modCount = if ($modifiers) { @($modifiers).Count } else { 0 }
            Write-Host "    ✅ Success: $modCount modifiers loaded"
            if ($modCount -gt 0) {
                Write-Host "    Sample: $($modifiers[0].ModifierName)"
            }
        } catch {
            Write-Host "    ❌ Error: $($_.Exception.Response.StatusCode)"
            $err = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream()).ReadToEnd()
            Write-Host "    Message: $err"
        }
    }
} catch {
    Write-Host "    ❌ Error: $($_.Exception.Message)"
}
