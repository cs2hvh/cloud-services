# Testing Implementation Checklist

## 🚀 Getting Started

### Prerequisites
- [ ] Node.js installed (v18+)
- [ ] Project dependencies installed (`npm install`)
- [ ] Familiar with existing codebase

### Installation (5 minutes)
- [ ] Run `.\install-testing-deps.ps1` (PowerShell)
  - OR manually: `npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom @vitest/ui @vitest/coverage-v8`
- [ ] Verify installation: `npm test`
- [ ] Check that example tests run successfully

---

## 📋 Phase 1: Critical Path (Week 1)

### Validation Tests ✅ (Already Done!)
- [x] createDatabaseSchema validation
- [x] updateNetworkSchema validation
- [x] validateEngineVersion tests
- [x] All edge cases covered

### API Route Tests - Create
- [ ] `POST /api/services/database/create`
  - [x] Example provided in `tests/integration/api/database-create.test.ts`
  - [ ] Add tests for MongoDB creation
  - [ ] Add tests for Redis creation
  - [ ] Add tests for Kafka creation
  - [ ] Test encryption of all password fields
  - [ ] Test activity log creation

### API Route Tests - Read
- [ ] `POST /api/services/database/read`
  - [ ] Test read without status check
  - [ ] Test read with status check
  - [ ] Test status update from creating to online
  - [ ] Test password decryption
  - [ ] Test hostname resolution
  - [ ] Test error handling

### API Route Tests - Delete
- [ ] `POST /api/services/database/delete`
  - [ ] Test successful deletion
  - [ ] Test activity log creation
  - [ ] Test DO API errors
  - [ ] Test Supabase deletion errors
  - [ ] Test authorization

### API Route Tests - List All
- [ ] `POST /api/services/database/read_all_owner`
  - [ ] Test listing user's clusters
  - [ ] Test filtering by status
  - [ ] Test empty results
  - [ ] Test authorization

### Component Tests - Database Page
- [ ] `app/dashboard/services/database/page.tsx`
  - [ ] Test loading state
  - [ ] Test empty state
  - [ ] Test cluster list display
  - [ ] Test status badge colors
  - [ ] Test navigation to create page
  - [ ] Test navigation to cluster detail
  - [ ] Test disabled view for migrating clusters

---

## 📋 Phase 2: Core Features (Week 2)

### API Route Tests - User Management
- [ ] `POST /api/services/database/users/create`
  - [ ] Test user creation
  - [ ] Test password encryption
  - [ ] Test validation errors
  - [ ] Test duplicate username
  - [ ] Test activity log
  
- [ ] `POST /api/services/database/users/delete`
  - [ ] Test user deletion
  - [ ] Test activity log
  - [ ] Test preventing default user deletion
  
- [ ] `POST /api/services/database/users/reset`
  - [ ] Test password reset
  - [ ] Test new password encryption
  - [ ] Test activity log

- [ ] `POST /api/services/database/users/list`
  - [ ] Test listing users
  - [ ] Test password decryption

### API Route Tests - Database Management
- [ ] `POST /api/services/database/dbs/create`
  - [ ] Test database creation
  - [ ] Test validation
  - [ ] Test activity log

- [ ] `POST /api/services/database/dbs/delete`
  - [ ] Test database deletion
  - [ ] Test preventing default DB deletion
  - [ ] Test activity log

- [ ] `POST /api/services/database/dbs/list`
  - [ ] Test listing databases

### API Route Tests - Network/Firewall
- [ ] `POST /api/services/database/network/update`
  - [ ] Test adding IPv4 rule
  - [ ] Test adding IPv6 rule
  - [ ] Test adding CIDR notation
  - [ ] Test "allow all" special IPs
  - [ ] Test duplicate prevention
  - [ ] Test injection prevention

- [ ] `POST /api/services/database/network/delete`
  - [ ] Test rule deletion
  - [ ] Test activity log

- [ ] `POST /api/services/database/network/read`
  - [ ] Test listing firewall rules

### API Route Tests - Maintenance
- [ ] `PUT /api/services/database/maintenance`
  - [ ] Test updating maintenance window
  - [ ] Test day validation
  - [ ] Test hour validation
  - [ ] Test Supabase sync
  - [ ] Test activity log

- [ ] `POST /api/services/database/maintenance/read`
  - [ ] Test reading maintenance window

### API Route Tests - Update
- [ ] `PUT /api/services/database/update`
  - [ ] Test project reassignment
  - [ ] Test validation
  - [ ] Test activity log
  - [ ] Test authorization

### Component Tests - Create Form
- [ ] `components/dashboard/database/new.tsx`
  - [ ] Test step navigation
  - [ ] Test database type selection
  - [ ] Test form validation (all fields)
  - [ ] Test version filtering
  - [ ] Test pricing calculation
  - [ ] Test terms acceptance
  - [ ] Test form submission
  - [ ] Test error handling
  - [ ] Test success redirect

### Component Tests - Single Database View
- [ ] `components/dashboard/database/singledb.tsx`
  - [ ] Test loading state
  - [ ] Test data display
  - [ ] Test tab navigation
  - [ ] Test auto-refresh (creating status)
  - [ ] Test online toast notification
  - [ ] Test delete modal
  - [ ] Test delete confirmation
  - [ ] Test password visibility toggle
  - [ ] Test connection tab switching

---

## 📋 Phase 3: Edge Cases & Integration (Week 3)

### Component Tests - Tabs
- [ ] `components/dashboard/database/tabs/overview-tab.tsx`
  - [ ] Test connection info display
  - [ ] Test copy to clipboard
  - [ ] Test public/private switching

- [ ] `components/dashboard/database/tabs/network-tab.tsx`
  - [ ] Test firewall rules display
  - [ ] Test adding IP rule
  - [ ] Test IP validation
  - [ ] Test rule deletion
  - [ ] Test warning for 0.0.0.0/0

- [ ] `components/dashboard/database/tabs/users-dbs-tab.tsx`
  - [ ] Test users list
  - [ ] Test creating user
  - [ ] Test deleting user
  - [ ] Test resetting password
  - [ ] Test databases list
  - [ ] Test creating database
  - [ ] Test deleting database

- [ ] `components/dashboard/database/tabs/settings-tab.tsx`
  - [ ] Test maintenance window display
  - [ ] Test updating maintenance window
  - [ ] Test project display
  - [ ] Test project reassignment
  - [ ] Test delete cluster option

### Error Handling Tests
- [ ] Test all API routes with network errors
- [ ] Test all API routes with DO API errors
- [ ] Test all API routes with Supabase errors
- [ ] Test timeout scenarios
- [ ] Test malformed request bodies
- [ ] Test missing required fields

### Authentication Tests
- [ ] Test all protected routes require auth
- [ ] Test unauthorized access attempts
- [ ] Test session expiration handling

### Authorization Tests
- [ ] Test users can only access their clusters
- [ ] Test users can only modify their clusters
- [ ] Test project membership validation

### Data Integrity Tests
- [ ] Test password encryption/decryption
- [ ] Test data consistency between DO and Supabase
- [ ] Test transaction rollback on errors
- [ ] Test concurrent operations

---

## 📋 Phase 4: E2E & Polish (Week 4)

### E2E Tests (Optional - Playwright)
- [ ] Complete cluster lifecycle
  - [ ] Create cluster
  - [ ] Wait for online status
  - [ ] Add firewall rule
  - [ ] Create user
  - [ ] Update maintenance window
  - [ ] Delete cluster

- [ ] User management flow
  - [ ] Navigate to cluster
  - [ ] Switch to Users tab
  - [ ] Create user
  - [ ] Reset password
  - [ ] Delete user

- [ ] Network configuration flow
  - [ ] Navigate to Network tab
  - [ ] Add IP rule
  - [ ] Verify rule appears
  - [ ] Delete rule

- [ ] Cluster deletion flow
  - [ ] Open delete modal
  - [ ] Type cluster name
  - [ ] Confirm deletion
  - [ ] Verify redirect

### Coverage Goals
- [ ] Achieve 80%+ overall coverage
- [ ] Achieve 90%+ API route coverage
- [ ] Achieve 100% validation coverage
- [ ] Achieve 70%+ component coverage

### Performance Tests
- [ ] Test API response times
- [ ] Test component render times
- [ ] Test large dataset handling

### Security Audit
- [ ] SQL/NoSQL injection prevention
- [ ] XSS protection verification
- [ ] CSRF token validation
- [ ] Rate limiting tests
- [ ] Input sanitization verification
- [ ] Output encoding verification

### CI/CD Setup
- [ ] Create GitHub Actions workflow
- [ ] Run tests on push
- [ ] Run tests on pull request
- [ ] Upload coverage reports
- [ ] Set up status badges
- [ ] Configure automatic deployment on passing tests

### Documentation
- [ ] Update README with testing info
- [ ] Document testing patterns used
- [ ] Create troubleshooting guide
- [ ] Document mock data structure

---

## 📊 Coverage Tracking

### Current Status
- Validation Tests: ✅ 100% (30+ tests)
- API Routes: ⏳ 5% (1 example)
- Components: ⏳ 0%
- E2E: ⏳ 0%
- **Overall: ⏳ ~3%**

### Target Status
- Validation Tests: ✅ 100%
- API Routes: 🎯 90%
- Components: 🎯 70%
- E2E: 🎯 80% of critical flows
- **Overall: 🎯 80%+**

---

## 🎯 Quick Wins (Do These First)

1. ✅ Run existing validation tests
2. ⏳ Add read database API tests (similar to create)
3. ⏳ Add delete database API tests
4. ⏳ Test database listing page
5. ⏳ Add user management API tests

---

## 💡 Tips

- **Use provided templates**: Copy from `database-create.test.ts`
- **Run in watch mode**: `npm test -- --watch`
- **Check coverage frequently**: `npm run test:coverage`
- **Test one thing at a time**: Focus on one API or component
- **Mock external calls**: Use provided mock helpers
- **Write descriptive test names**: Make failures easy to understand

---

## 📅 Estimated Timeline

| Phase | Duration | Tests | Coverage |
|-------|----------|-------|----------|
| Phase 1 | 1 week | ~25 | 40% |
| Phase 2 | 1 week | ~50 | 60% |
| Phase 3 | 1 week | ~40 | 75% |
| Phase 4 | 1 week | ~35 | 80%+ |
| **Total** | **4 weeks** | **~150** | **80%+** |

---

## ✅ When You're Done

You should have:
- [ ] 150+ passing tests
- [ ] 80%+ code coverage
- [ ] All critical paths tested
- [ ] CI/CD pipeline running
- [ ] Documentation updated
- [ ] Team trained on testing practices

---

## 📞 Resources

- `DATABASE_TEST_PLAN.md` - Full test case descriptions
- `TESTING_SUMMARY.md` - Quick overview and examples
- `tests/README.md` - Getting started guide
- `tests/utils/mock-data.ts` - All mock data
- `tests/utils/test-helpers.ts` - Helper functions

---

**Start here:**
```powershell
.\install-testing-deps.ps1
npm test
```

Good luck! 🚀
