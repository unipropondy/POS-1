#!/usr/bin/env pwsh
# Test order save endpoint

$json = @{
    orderId = "#NEWORD"
    totalAmount = 450
    subTotal = 450
    taxAmount = 0
    discountAmount = 0
    paymentMethod = "CASH"
    items = @(@{DishName = "Chicken Biryani"; Qty = 1; Price = 450})
    orderType = "DINE-IN"
    tableNo = "10"
    section = "Section 3"
    cashierId = "CASHIER1"
} | ConvertTo-Json

Write-Host "Sending order: $json" -ForegroundColor Cyan

try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/sales/save" `
        -Method POST `
        -Body $json `
        -ContentType "application/json" `
        -UseBasicParsing `
        -ErrorAction Stop
    
    Write-Host "✅ SUCCESS!" -ForegroundColor Green
    Write-Host "Status Code: $($resp.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($resp.Content)" -ForegroundColor Green
    
    $result = $resp.Content | ConvertFrom-Json
    Write-Host "Settlement ID: $($result.settlementId)" -ForegroundColor Cyan
    Write-Host "Bill No: $($result.billNo)" -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ ERROR!" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    $errorMsg = $reader.ReadToEnd()
    Write-Host "Error Message: $errorMsg" -ForegroundColor Red
}
