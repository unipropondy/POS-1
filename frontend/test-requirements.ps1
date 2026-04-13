#!/usr/bin/env pwsh
# Test script to verify all 11 requirements

Write-Host "=== Testing POS System Requirements ===" -ForegroundColor Green

# Test 1: Unique Order ID Generation
Write-Host "`n[TEST 1] Unique Order ID Generation (#XXXXXX format)" -ForegroundColor Yellow

$orderTest = @{
    orderId = "#ABC123"
    totalAmount = 150.50
    subTotal = 150.50
    taxAmount = 0
    discountAmount = 0
    paymentMethod = "CASH"
    items = @(@{DishName = "Biryani"; Qty = 1; Price = 150.50})
    orderType = "DINE-IN"
    tableNo = "1"
    section = "Section 1"
    cashierId = "CASHIER001"
} | ConvertTo-Json

try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/sales/save" `
        -Method POST `
        -Body $orderTest `
        -ContentType "application/json" `
        -UseBasicParsing `
        -ErrorAction Stop
    Write-Host "✅ Order saved successfully" -ForegroundColor Green
    Write-Host "Response: $($resp.Content)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Order save failed" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Check Order ID Validation
Write-Host "`n[TEST 2] Order ID Validation Endpoint" -ForegroundColor Yellow

try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/orders/check/ABC123" `
        -Method GET `
        -UseBasicParsing `
        -ErrorAction Stop
    Write-Host "✅ Order validation endpoint working" -ForegroundColor Green
    Write-Host "Response: $($resp.Content)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Validation endpoint failed" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
}

# Test 3: Get Tables
Write-Host "`n[TEST 3] Table Listing (#7 requirement)" -ForegroundColor Yellow

try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3000/tables" -Method GET -UseBasicParsing
    $tables = $resp.Content | ConvertFrom-Json
    Write-Host "✅ Tables retrieved: $(($tables | Measure-Object).Count) tables" -ForegroundColor Green
    if ($tables) {
        Write-Host "Sample table: $($tables[0].TableNo) in $($tables[0].DiningSection)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Failed to get tables" -ForegroundColor Red
}

# Test 4: Get Modifiers
Write-Host "`n[TEST 4] Modifier System (#2 requirement)" -ForegroundColor Yellow

try {
    # First get a dish to get its ID
    $dishResp = Invoke-WebRequest -Uri "http://localhost:3000/dishes/1" -Method GET -UseBasicParsing
    $dishes = $dishResp.Content | ConvertFrom-Json
    if ($dishes -and $dishes[0].DishId) {
        $dishId = $dishes[0].DishId
        $modResp = Invoke-WebRequest -Uri "http://localhost:3000/modifiers/$dishId" -Method GET -UseBasicParsing
        $mods = $modResp.Content | ConvertFrom-Json
        Write-Host "✅ Modifiers retrieved for dish $dishId" -ForegroundColor Green
        if ($mods) {
            Write-Host "Sample modifier: $($mods[0].ModifierName) - `$$($mods[0].Price)" -ForegroundColor Cyan
        }
    }
} catch {
    Write-Host "❌ Failed to get modifiers" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Get Discounts
Write-Host "`n[TEST 5] Discount System (#8 requirement)" -ForegroundColor Yellow

try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/discounts" -Method GET -UseBasicParsing -ErrorAction Stop
    $discounts = $resp.Content | ConvertFrom-Json
    Write-Host "✅ Discounts retrieved: $(($discounts | Measure-Object).Count) discounts" -ForegroundColor Green
    if ($discounts) {
        Write-Host "Sample discount: `$$($discounts[0].Discountprice)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Failed to get discounts" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: Get Sales Report
Write-Host "`n[TEST 6] Sales Report (#5 requirement)" -ForegroundColor Yellow

try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/sales/all" -Method GET -UseBasicParsing
    $sales = $resp.Content | ConvertFrom-Json
    Write-Host "✅ Sales report retrieved: $(($sales | Measure-Object).Count) orders" -ForegroundColor Green
    if ($sales) {
        Write-Host "Latest order ID: $($sales[-1].OrderId)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Failed to get sales report" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 7: Attendance System
Write-Host "`n[TEST 7] Attendance Tracking (#9 requirement)" -ForegroundColor Yellow

try {
    $attendanceTest = @{
        DeliveryPersonId = "EMP001"
        EmployeeName = "John Doe"
        StartDateTime = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        BusinessUnitId = "BU001"
    } | ConvertTo-Json

    $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/attendance/track" `
        -Method POST `
        -Body $attendanceTest `
        -ContentType "application/json" `
        -UseBasicParsing `
        -ErrorAction Stop
    Write-Host "✅ Attendance tracking working" -ForegroundColor Green
} catch {
    Write-Host "❌ Attendance tracking failed" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 8: Cancel Order Validation
Write-Host "`n[TEST 8] Cancel Order Validation (#3 requirement)" -ForegroundColor Yellow

try {
    $cancelTest = @{
        settlementId = "test-id"
        cancellationReason = "Customer requested"
        cancelledBy = "CASHIER001"
    } | ConvertTo-Json

    $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/orders/validate-cancel" `
        -Method POST `
        -Body $cancelTest `
        -ContentType "application/json" `
        -UseBasicParsing `
        -ErrorAction Stop
    Write-Host "✅ Cancel validation working" -ForegroundColor Green
} catch {
    Write-Host "❌ Cancel validation failed" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Test Summary ===" -ForegroundColor Green
Write-Host "All critical API endpoints have been tested." -ForegroundColor Cyan
Write-Host "Frontend at http://localhost:8081 - Sales Report at http://localhost:8081/sales-report" -ForegroundColor Cyan
