# Installation Script for Testing Setup
# Run this in PowerShell: .\install-testing-deps.ps1

Write-Host "🚀 Installing Testing Dependencies for Cloud Services Database Cluster" -ForegroundColor Cyan
Write-Host ""

# Core testing framework
Write-Host "📦 Installing Vitest (core testing framework)..." -ForegroundColor Yellow
npm install -D vitest @vitejs/plugin-react @vitest/ui

# React testing utilities
Write-Host "📦 Installing React Testing Library..." -ForegroundColor Yellow
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event

# DOM simulation
Write-Host "📦 Installing jsdom (DOM simulation)..." -ForegroundColor Yellow
npm install -D jsdom

# Coverage reporting
Write-Host "📦 Installing coverage tools..." -ForegroundColor Yellow
npm install -D @vitest/coverage-v8

Write-Host ""
Write-Host "✅ Installation Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Run tests: npm test" -ForegroundColor White
Write-Host "2. Watch mode: npm test -- --watch" -ForegroundColor White
Write-Host "3. Coverage: npm run test:coverage" -ForegroundColor White
Write-Host "4. UI mode: npm run test:ui" -ForegroundColor White
Write-Host ""
Write-Host "📚 Documentation:" -ForegroundColor Cyan
Write-Host "- TESTING_SUMMARY.md - Quick overview" -ForegroundColor White
Write-Host "- DATABASE_TEST_PLAN.md - Comprehensive test plan" -ForegroundColor White
Write-Host "- tests/README.md - Getting started guide" -ForegroundColor White
Write-Host ""
Write-Host "🎯 Ready to test! Run: npm test" -ForegroundColor Green
