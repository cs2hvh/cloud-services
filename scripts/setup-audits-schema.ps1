#!/usr/bin/env pwsh
# ============================================
# Supabase Audits Schema Setup Script
# Purpose: Automate the creation and verification of audits schema
# ============================================

param(
    [Parameter(Mandatory=$false)]
    [string]$ProjectRef = "",
    
    [Parameter(Mandatory=$false)]
    [switch]$LocalOnly = $false,
    
    [Parameter(Mandatory=$false)]
    [switch]$VerifyOnly = $false
)

Write-Host "🔍 Supabase Audits Schema Setup" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check if Supabase CLI is installed
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Supabase CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "   npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

# Verification function
function Test-AuditsSchema {
    Write-Host "🔍 Verifying audits schema..." -ForegroundColor Yellow
    
    $verifyQuery = @"
-- Check schema exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'audits') 
        THEN '✅ Schema exists'
        ELSE '❌ Schema missing'
    END as schema_status;

-- Check table exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'audits' AND tablename = 'audit_logs')
        THEN '✅ Table exists'
        ELSE '❌ Table missing'
    END as table_status;

-- Count partitions
SELECT 
    '📊 Partitions: ' || COUNT(*)::text as partition_count
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child ON pg_inherits.inhrelid = child.oid
WHERE parent.relname = 'audit_logs';

-- Check RLS
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_tables 
            WHERE schemaname = 'audits' 
            AND tablename = 'audit_logs' 
            AND rowsecurity = true
        )
        THEN '✅ RLS enabled'
        ELSE '❌ RLS disabled'
    END as rls_status;
"@

    # Save to temp file
    $tempFile = [System.IO.Path]::GetTempFileName() + ".sql"
    $verifyQuery | Out-File -FilePath $tempFile -Encoding utf8
    
    Write-Host "Running verification queries..." -ForegroundColor Gray
    supabase db execute --file $tempFile
    
    Remove-Item $tempFile -ErrorAction SilentlyContinue
}

# Main execution
if ($VerifyOnly) {
    Test-AuditsSchema
    exit 0
}

# Link to project if not local
if (-not $LocalOnly -and $ProjectRef) {
    Write-Host "🔗 Linking to Supabase project: $ProjectRef" -ForegroundColor Yellow
    supabase link --project-ref $ProjectRef
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to link to project" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "📋 Migration Steps:" -ForegroundColor Cyan
Write-Host "1. Create audits schema" -ForegroundColor White
Write-Host "2. Apply audit_logs migration" -ForegroundColor White
Write-Host "3. Verify setup" -ForegroundColor White
Write-Host ""

# Step 1: Create schema
Write-Host "📦 Step 1: Creating audits schema..." -ForegroundColor Yellow
$setupFile = "supabase/migrations/setup_audits_schema.sql"

if (Test-Path $setupFile) {
    supabase db execute --file $setupFile
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Audits schema created successfully" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Schema creation failed (may already exist)" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  Setup file not found: $setupFile" -ForegroundColor Yellow
    Write-Host "   Skipping schema setup..." -ForegroundColor Gray
}

Write-Host ""

# Step 2: Apply migrations
Write-Host "🚀 Step 2: Applying audit_logs migration..." -ForegroundColor Yellow

if ($LocalOnly) {
    Write-Host "   Using local database..." -ForegroundColor Gray
    supabase db push
} else {
    Write-Host "   Using remote database..." -ForegroundColor Gray
    $migrationFile = "supabase/migrations/20260122_create_audit_logs.sql"
    
    if (Test-Path $migrationFile) {
        supabase db execute --file $migrationFile
    } else {
        Write-Host "❌ Migration file not found: $migrationFile" -ForegroundColor Red
        exit 1
    }
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Migration applied successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Migration failed" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 3: Verify
Write-Host "🔍 Step 3: Verifying setup..." -ForegroundColor Yellow
Test-AuditsSchema

Write-Host ""
Write-Host "✨ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next steps:" -ForegroundColor Cyan
Write-Host "1. Restart your application" -ForegroundColor White
Write-Host "2. Test audit log creation (create a service)" -ForegroundColor White
Write-Host "3. Visit /dashboard/admin/audit-logs to view logs" -ForegroundColor White
Write-Host ""
Write-Host "📚 For more details, see:" -ForegroundColor Cyan
Write-Host "   docs/AUDIT_LOGS_SCHEMA_MIGRATION.md" -ForegroundColor Gray
Write-Host ""
