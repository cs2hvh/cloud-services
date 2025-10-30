# Database Integration & DBaaS Service - Testing Checklist

## Overview
This document outlines comprehensive test cases for the Database-as-a-Service (DBaaS) integration with DigitalOcean and Supabase. All tests should be performed before merging database-integration branch with production.

---

## 1. DATABASE CLUSTER CREATION

### 1.1 API Endpoint Testing (`/api/services/database/create`)

#### Positive Test Cases:
- [ ] **TC-DB-001**: Create MySQL database cluster with valid parameters
  - Engine: MySQL 8
  - Size: db-s-1vcpu-1gb
  - Region: nyc3
  - Nodes: 1
  - Expected: 201 status, cluster created in DigitalOcean and Supabase

- [ ] **TC-DB-002**: Create PostgreSQL database cluster
  - Engine: PostgreSQL 15
  - Size: db-s-2vcpu-4gb
  - Region: sfo3
  - Nodes: 2
  - Expected: Success with HA configuration

- [ ] **TC-DB-003**: Create MongoDB database cluster
  - Engine: MongoDB 6
  - Size: db-s-1vcpu-2gb
  - Region: lon1
  - Nodes: 1
  - Expected: Successful creation

- [ ] **TC-DB-004**: Create Redis cluster
  - Engine: Redis 7
  - Size: db-s-1vcpu-1gb
  - Region: tor1
  - Expected: Successful creation

- [ ] **TC-DB-005**: Create cluster with project association
  - Verify project_id is correctly linked
  - Verify owner_id is set
  - Expected: Cluster appears in correct project

#### Negative Test Cases:
- [ ] **TC-DB-006**: Create cluster without authentication token
  - Expected: 401 Unauthorized

- [ ] **TC-DB-007**: Create cluster with invalid region
  - Region: "invalid-region"
  - Expected: 400 Bad Request with appropriate error message

- [ ] **TC-DB-008**: Create cluster with invalid engine
  - Engine: "unsupported-db"
  - Expected: 400 Bad Request

- [ ] **TC-DB-009**: Create cluster with insufficient parameters
  - Missing required fields (name, engine, size)
  - Expected: 400 Bad Request

- [ ] **TC-DB-010**: Create cluster without project_id
  - Expected: Should handle gracefully (null project)

- [ ] **TC-DB-011**: Create cluster with invalid owner_id
  - Expected: 403 Forbidden or validation error

#### Data Validation:
- [ ] **TC-DB-012**: Verify connection strings are saved correctly
  - Check public_connection object structure
  - Verify host, port, user, database, password fields
  - Check private_connection is saved

- [ ] **TC-DB-013**: Verify cluster_id mapping
  - DigitalOcean cluster ID matches Supabase cluster_id
  - UUID is properly generated for Supabase record

- [ ] **TC-DB-014**: Verify status field is set correctly
  - Initial status should be "creating"
  - Status should update to "online" when ready

---

## 2. DATABASE CLUSTER READING/RETRIEVAL

### 2.1 Read Single Cluster (`/api/services/database/read`)

- [ ] **TC-DB-015**: Read cluster by ID with valid authentication
  - Expected: Full cluster details returned

- [ ] **TC-DB-016**: Read cluster belonging to different user
  - Expected: 403 Forbidden (authorization check)

- [ ] **TC-DB-017**: Read non-existent cluster
  - Expected: 404 Not Found

- [ ] **TC-DB-018**: Verify returned data structure
  - All connection details present
  - Network rules included
  - Database users list included
  - Database list included

### 2.2 Read All User Clusters (`/api/services/database/read_all_owner`)

- [ ] **TC-DB-019**: List all clusters for authenticated user
  - Expected: Array of user's clusters

- [ ] **TC-DB-020**: Verify pagination works correctly
  - Test with >10 clusters
  - Verify page and limit parameters

- [ ] **TC-DB-021**: Verify filtering by project
  - Filter clusters by project_id
  - Expected: Only project-specific clusters

- [ ] **TC-DB-022**: Verify empty state
  - User with no clusters
  - Expected: Empty array, not error

- [ ] **TC-DB-023**: Verify cluster stats calculation
  - Total servers, game servers, clusters count
  - Expected: Accurate counts

---

## 3. DATABASE CLUSTER DELETION

### 3.1 Delete Cluster (`/api/services/database/delete`)

- [ ] **TC-DB-024**: Delete cluster with valid authentication
  - Expected: Cluster deleted from DigitalOcean
  - Expected: Cluster marked as deleted in Supabase

- [ ] **TC-DB-025**: Delete cluster with active connections
  - Expected: Warning or force delete option

- [ ] **TC-DB-026**: Delete non-existent cluster
  - Expected: 404 Not Found

- [ ] **TC-DB-027**: Delete cluster owned by different user
  - Expected: 403 Forbidden

- [ ] **TC-DB-028**: Verify cascade deletion
  - Check if associated records are cleaned up
  - Verify network rules are deleted
  - Verify user associations removed

- [ ] **TC-DB-029**: Verify deletion sync between DigitalOcean and Supabase
  - If DigitalOcean delete succeeds but Supabase fails
  - Expected: Proper error handling and rollback

---

## 4. DATABASE CLUSTER STATUS UPDATES

### 4.1 Status Synchronization (`/api/services/database/update_status`)

- [ ] **TC-DB-030**: Update cluster status from "creating" to "online"
  - Expected: Status updated in both systems

- [ ] **TC-DB-031**: Handle status "migrating"
  - Verify UI shows appropriate message
  - Expected: Some operations disabled during migration

- [ ] **TC-DB-032**: Handle status "failed"
  - Expected: Error message displayed
  - Verify cleanup or retry options

- [ ] **TC-DB-033**: Periodic status polling
  - Verify status updates automatically
  - Check polling interval (not too frequent)

---

## 5. DATABASE USER MANAGEMENT

### 5.1 Create Database User (`/api/services/database/users/create`)

- [ ] **TC-DB-034**: Create new database user with password
  - Username: "testuser"
  - Expected: User created in DigitalOcean
  - Expected: User synced to Supabase

- [ ] **TC-DB-035**: Create user with MySQL-specific roles
  - Role: "normal" vs "primary"
  - Expected: Correct permissions assigned

- [ ] **TC-DB-036**: Create user without password (auto-generate)
  - Expected: Strong password generated
  - Expected: Password returned in response

- [ ] **TC-DB-037**: Create duplicate username
  - Expected: 409 Conflict or appropriate error

- [ ] **TC-DB-038**: Create user with special characters in username
  - Username: "test-user_123"
  - Expected: Success or validation error

### 5.2 List Database Users (`/api/services/database/users/list`)

- [ ] **TC-DB-039**: List all users for a cluster
  - Expected: Array of users with roles

- [ ] **TC-DB-040**: Verify default users are included
  - DigitalOcean creates default "doadmin" user
  - Expected: Default users visible

### 5.3 Delete Database User (`/api/services/database/users/delete`)

- [ ] **TC-DB-041**: Delete custom database user
  - Expected: User removed from DigitalOcean
  - Expected: User removed from Supabase sync

- [ ] **TC-DB-042**: Attempt to delete default admin user
  - Expected: 400 Bad Request (protected user)

- [ ] **TC-DB-043**: Delete non-existent user
  - Expected: 404 Not Found

### 5.4 Reset Database User Password (`/api/services/database/users/reset`)

- [ ] **TC-DB-044**: Reset user password
  - Expected: New password generated
  - Expected: Password updated in DigitalOcean
  - Expected: New password returned securely

- [ ] **TC-DB-045**: Reset password for primary user
  - Expected: Success with appropriate warnings

---

## 6. DATABASE INSTANCE MANAGEMENT (Databases within Cluster)

### 6.1 Create Database (`/api/services/database/dbs/create`)

- [ ] **TC-DB-046**: Create new database in cluster
  - Database name: "production_db"
  - Expected: Database created successfully

- [ ] **TC-DB-047**: Create database with reserved name
  - Name: "mysql", "sys", "information_schema"
  - Expected: Validation error

- [ ] **TC-DB-048**: Create duplicate database name
  - Expected: 409 Conflict

### 6.2 List Databases (`/api/services/database/dbs/list`)

- [ ] **TC-DB-049**: List all databases in cluster
  - Expected: Array including default databases

- [ ] **TC-DB-050**: Verify default databases are present
  - MySQL: mysql, sys, information_schema, performance_schema
  - PostgreSQL: postgres, template0, template1

### 6.3 Retrieve Database (`/api/services/database/dbs/retrieve`)

- [ ] **TC-DB-051**: Get specific database details
  - Expected: Database name and metadata

### 6.4 Delete Database (`/api/services/database/dbs/delete`)

- [ ] **TC-DB-052**: Delete custom database
  - Expected: Database removed successfully

- [ ] **TC-DB-053**: Attempt to delete system database
  - Expected: 400 Bad Request (protected)

---

## 7. NETWORK & FIREWALL RULES

### 7.1 Read Network Rules (`/api/services/database/network/read`)

- [ ] **TC-DB-054**: Read firewall rules for cluster
  - Expected: Array of network rules with UUIDs

- [ ] **TC-DB-055**: Verify default rules (if any)
  - Check if trusted sources are pre-configured

### 7.2 Update Network Rules (`/api/services/database/network/update`)

- [ ] **TC-DB-056**: Add IP whitelist rule
  - IP: "203.0.113.0/24"
  - Expected: Rule added successfully

- [ ] **TC-DB-057**: Add multiple IP rules
  - Expected: All rules applied

- [ ] **TC-DB-058**: Remove IP whitelist rule
  - Expected: Rule removed

- [ ] **TC-DB-059**: Add invalid IP format
  - IP: "invalid-ip"
  - Expected: 400 Bad Request with validation error

- [ ] **TC-DB-060**: Verify IP blocking
  - Add restrictive rules
  - Test connection from blocked IP
  - Expected: Connection refused

- [ ] **TC-DB-061**: Verify IP allowing
  - Add allowed IP
  - Test connection from allowed IP
  - Expected: Connection successful

---

## 8. HOST RESOLUTION

### 8.1 Host to IP Conversion (`/api/services/database/host`)

- [ ] **TC-DB-062**: Resolve DigitalOcean database hostname
  - Input: "db-mysql-nyc3-12345.ondigitalocean.com"
  - Expected: Public IP address returned

- [ ] **TC-DB-063**: Resolve private hostname
  - Expected: Private IP address returned

- [ ] **TC-DB-064**: Handle DNS resolution failure
  - Expected: Appropriate error message

---

## 9. FRONTEND INTEGRATION

### 9.1 Database List Page (`/dashboard/services/database`)

- [ ] **TC-DB-065**: Display empty state correctly
  - User with no databases
  - Expected: "No Databases Found" message with CTA

- [ ] **TC-DB-066**: Display list of user's databases
  - Expected: Table with all clusters

- [ ] **TC-DB-067**: Verify database card information
  - Name, engine icon, location, version, status badge
  - Expected: All data displayed correctly

- [ ] **TC-DB-068**: Click "View Cluster" button
  - Expected: Navigate to cluster detail page

- [ ] **TC-DB-069**: Disable actions during migration
  - Status: "migrating"
  - Expected: "View Cluster" button disabled with tooltip

- [ ] **TC-DB-070**: Search/filter databases
  - Expected: Results filtered correctly

### 9.2 Create Database Page (`/dashboard/services/database/new`)

- [ ] **TC-DB-071**: Load database creation form
  - Expected: All engine options visible
  - Expected: Locations populated
  - Expected: Sizes available

- [ ] **TC-DB-072**: Select database engine
  - Test MySQL, PostgreSQL, MongoDB, Redis
  - Expected: Engine-specific options shown

- [ ] **TC-DB-073**: Select cluster size
  - Expected: Pricing displayed correctly

- [ ] **TC-DB-074**: Select region/location
  - Expected: Available regions listed

- [ ] **TC-DB-075**: Submit form with valid data
  - Expected: Loading state
  - Expected: Redirect to cluster detail on success
  - Expected: Toast notification

- [ ] **TC-DB-076**: Submit form with missing fields
  - Expected: Validation errors displayed

- [ ] **TC-DB-077**: Handle creation failure
  - Expected: Error message displayed
  - Expected: Form remains editable

### 9.3 Database Cluster Detail Page (`/dashboard/services/database/clusters/[databaseId]`)

- [ ] **TC-DB-078**: Display cluster overview
  - Name, engine, version, region, status
  - Connection strings (masked)
  - Resource usage stats

- [ ] **TC-DB-079**: Display connection information tab
  - Public connection details
  - Private connection details
  - Copy connection string button

- [ ] **TC-DB-080**: Display users management tab
  - List of database users
  - Add user button
  - Delete user button
  - Reset password button

- [ ] **TC-DB-081**: Display databases tab
  - List of databases in cluster
  - Create database button
  - Delete database button

- [ ] **TC-DB-082**: Display network/firewall tab
  - List of IP rules
  - Add IP rule button
  - Delete IP rule button

- [ ] **TC-DB-083**: Display settings tab
  - Cluster name edit
  - Resize cluster option
  - Delete cluster button (with confirmation)

- [ ] **TC-DB-084**: Test real-time status updates
  - Status changes from "creating" to "online"
  - Expected: UI updates without refresh

---

## 10. DATA PERSISTENCE & SYNCHRONIZATION

### 10.1 Supabase Integration

- [ ] **TC-DB-085**: Verify cluster data saved to Supabase
  - Check database_clusters table
  - Verify all fields populated correctly

- [ ] **TC-DB-086**: Verify connection strings are encrypted/secured
  - Check if passwords are hashed or encrypted
  - Expected: No plain text passwords in database

- [ ] **TC-DB-087**: Verify cluster ownership
  - owner_id correctly set
  - Foreign key relationship valid

- [ ] **TC-DB-088**: Verify project association
  - project_id correctly set
  - Nullable field works correctly

- [ ] **TC-DB-089**: Test RLS (Row Level Security) policies
  - User A cannot access User B's clusters
  - Expected: 403 or filtered results

### 10.2 DigitalOcean Synchronization

- [ ] **TC-DB-090**: Verify cluster creation in DigitalOcean
  - Login to DigitalOcean console
  - Verify cluster exists with correct specs

- [ ] **TC-DB-091**: Verify updates sync between systems
  - Update in DigitalOcean
  - Expected: Reflects in application (via polling or webhook)

- [ ] **TC-DB-092**: Verify deletion removes from both systems
  - Delete via application
  - Check DigitalOcean console
  - Expected: Cluster not visible

---

## 11. CONNECTION STRING & CREDENTIALS

### 11.1 Connection String Generation

- [ ] **TC-DB-093**: Verify MySQL connection string format
  - Format: `mysql://user:password@host:port/database`
  - Expected: Valid connection string

- [ ] **TC-DB-094**: Verify PostgreSQL connection string format
  - Format: `postgresql://user:password@host:port/database?sslmode=require`
  - Expected: SSL enabled by default

- [ ] **TC-DB-095**: Verify MongoDB connection string format
  - Format: `mongodb://user:password@host:port/database?ssl=true`

- [ ] **TC-DB-096**: Verify Redis connection string format
  - Format: `rediss://default:password@host:port`

- [ ] **TC-DB-097**: Test actual database connection
  - Use generated connection string
  - Connect via database client (mysql, psql, mongosh)
  - Expected: Successful connection

### 11.2 Password Management

- [ ] **TC-DB-098**: Verify initial password is generated
  - Expected: Strong password returned on creation

- [ ] **TC-DB-099**: Verify password reset generates new password
  - Expected: Different password from original

- [ ] **TC-DB-100**: Verify password is not exposed in logs
  - Check server logs
  - Expected: No plaintext passwords

---

## 12. ERROR HANDLING & EDGE CASES

### 12.1 API Error Handling

- [ ] **TC-DB-101**: Handle DigitalOcean API timeout
  - Simulate slow network
  - Expected: Timeout error with retry option

- [ ] **TC-DB-102**: Handle DigitalOcean API rate limiting
  - Expected: 429 Too Many Requests with retry-after

- [ ] **TC-DB-103**: Handle DigitalOcean API down
  - Expected: Service unavailable error with graceful message

- [ ] **TC-DB-104**: Handle Supabase database connection failure
  - Expected: Error logged, user notified

- [ ] **TC-DB-105**: Handle partial failures
  - Cluster created in DigitalOcean but Supabase save fails
  - Expected: Rollback or manual sync option

### 12.2 Data Validation

- [ ] **TC-DB-106**: Validate cluster name length
  - Max 63 characters
  - Expected: Validation error if exceeded

- [ ] **TC-DB-107**: Validate cluster name format
  - Alphanumeric and hyphens only
  - Expected: Validation error for special chars

- [ ] **TC-DB-108**: Validate database name format
  - No spaces, special SQL keywords
  - Expected: Validation error

- [ ] **TC-DB-109**: Validate IP address format in firewall rules
  - CIDR notation validation
  - Expected: Error for invalid formats

---

## 13. SECURITY TESTING

### 13.1 Authentication & Authorization

- [ ] **TC-DB-110**: Access database API without authentication
  - Expected: 401 Unauthorized

- [ ] **TC-DB-111**: Access another user's cluster
  - Expected: 403 Forbidden

- [ ] **TC-DB-112**: SQL injection in database name
  - Input: `'; DROP TABLE users; --`
  - Expected: Sanitized or rejected

- [ ] **TC-DB-113**: XSS in cluster name
  - Input: `<script>alert('xss')</script>`
  - Expected: Sanitized on display

- [ ] **TC-DB-114**: Verify CORS policies
  - Request from unauthorized origin
  - Expected: CORS error

### 13.2 Data Protection

- [ ] **TC-DB-115**: Verify SSL/TLS for database connections
  - Expected: All connections use SSL

- [ ] **TC-DB-116**: Verify connection strings are not exposed in client
  - Check browser network tab
  - Expected: Credentials masked or encrypted

- [ ] **TC-DB-117**: Verify sensitive data in URLs
  - Check for passwords in query params
  - Expected: No sensitive data in URLs

---

## 14. PERFORMANCE TESTING

### 14.1 Load Testing

- [ ] **TC-DB-118**: Create 10 clusters simultaneously
  - Expected: All succeed without errors

- [ ] **TC-DB-119**: List 100+ clusters
  - Expected: Pagination works, no timeout

- [ ] **TC-DB-120**: Test database list page load time
  - Expected: <2 seconds to load

### 14.2 Resource Usage

- [ ] **TC-DB-121**: Monitor memory usage during cluster creation
  - Expected: No memory leaks

- [ ] **TC-DB-122**: Monitor API response times
  - Expected: Average <500ms

---

## 15. MIGRATION & SCALING

### 15.1 Cluster Resizing

- [ ] **TC-DB-123**: Resize cluster to larger size
  - Expected: Status changes to "migrating"
  - Expected: Cluster accessible after migration

- [ ] **TC-DB-124**: Resize cluster to smaller size
  - Expected: Warning if data loss possible

### 15.2 Data Migration

- [ ] **TC-DB-125**: Test backup and restore functionality
  - Expected: Data integrity maintained

- [ ] **TC-DB-126**: Test cluster failover (HA clusters)
  - Simulate node failure
  - Expected: Automatic failover

---

## 16. MONITORING & LOGGING

### 16.1 Logging

- [ ] **TC-DB-127**: Verify all API calls are logged
  - Check server logs for timestamp, user, action
  - Expected: Complete audit trail

- [ ] **TC-DB-128**: Verify error logging
  - Trigger error scenario
  - Expected: Error logged with stack trace

### 16.2 Monitoring

- [ ] **TC-DB-129**: Check cluster resource metrics
  - CPU, memory, disk usage
  - Expected: Metrics displayed in dashboard

- [ ] **TC-DB-130**: Check connection count metrics
  - Expected: Current connections displayed

---

## 17. USER EXPERIENCE

### 17.1 Loading States

- [ ] **TC-DB-131**: Verify loading spinners during async operations
  - Expected: Spinner visible during API calls

- [ ] **TC-DB-132**: Verify disabled states during operations
  - Expected: Buttons disabled during processing

### 17.2 Error Messages

- [ ] **TC-DB-133**: User-friendly error messages
  - Technical errors translated to user language
  - Expected: Clear, actionable error messages

- [ ] **TC-DB-134**: Success notifications
  - Expected: Toast notifications for successful operations

### 17.3 Responsive Design

- [ ] **TC-DB-135**: Test on mobile devices
  - Expected: UI adapts to small screens

- [ ] **TC-DB-136**: Test on tablets
  - Expected: Optimal layout for medium screens

---

## 18. INTEGRATION TESTING

### 18.1 End-to-End Workflows

- [ ] **TC-DB-137**: Complete workflow: Create → Configure → Use → Delete
  1. Create new PostgreSQL cluster
  2. Add firewall rule
  3. Create database user
  4. Create database
  5. Connect via client
  6. Delete database
  7. Delete cluster
  - Expected: All steps complete successfully

- [ ] **TC-DB-138**: Project-based workflow
  1. Create project
  2. Create database in project
  3. List project databases
  4. Delete project
  - Expected: Database associations work correctly

---

## 19. COMPATIBILITY TESTING

### 19.1 Browser Compatibility

- [ ] **TC-DB-139**: Test on Chrome (latest)
- [ ] **TC-DB-140**: Test on Firefox (latest)
- [ ] **TC-DB-141**: Test on Safari (latest)
- [ ] **TC-DB-142**: Test on Edge (latest)

### 19.2 Database Engine Versions

- [ ] **TC-DB-143**: Test MySQL 8.0
- [ ] **TC-DB-144**: Test PostgreSQL 14, 15, 16
- [ ] **TC-DB-145**: Test MongoDB 5, 6
- [ ] **TC-DB-146**: Test Redis 6, 7

---

## 20. DOCUMENTATION & HELP

### 20.1 User Documentation

- [ ] **TC-DB-147**: Verify connection string examples are correct
- [ ] **TC-DB-148**: Verify help tooltips are displayed
- [ ] **TC-DB-149**: Verify error messages include help links

---

## Test Execution Priority

### Critical (P0) - Must Pass Before Release:
- All creation and deletion tests (TC-DB-001 to TC-DB-029)
- Authentication tests (TC-DB-110 to TC-DB-114)
- Data persistence tests (TC-DB-085 to TC-DB-092)
- Connection string tests (TC-DB-093 to TC-DB-097)

### High (P1) - Should Pass Before Release:
- User management tests (TC-DB-034 to TC-DB-045)
- Database instance tests (TC-DB-046 to TC-DB-053)
- Network rules tests (TC-DB-054 to TC-DB-061)
- Frontend integration tests (TC-DB-065 to TC-DB-084)

### Medium (P2) - Can Be Fixed Post-Release:
- Performance tests (TC-DB-118 to TC-DB-122)
- Browser compatibility (TC-DB-139 to TC-DB-142)
- UX tests (TC-DB-131 to TC-DB-136)

### Low (P3) - Nice to Have:
- Documentation tests (TC-DB-147 to TC-DB-149)
- Engine version tests (TC-DB-143 to TC-DB-146)

---

## Test Environment Setup

### Prerequisites:
1. DigitalOcean account with API token
2. Supabase project configured
3. Test user accounts (at least 2 different users)
4. Test projects created
5. Database client tools installed (mysql, psql, mongosh, redis-cli)

### Test Data Cleanup:
- Delete all test clusters after testing
- Clean up test users and databases
- Reset firewall rules to default

---

## Bug Reporting Template

When you find an issue, document it as follows:

```
**Bug ID**: DB-BUG-XXX
**Test Case**: TC-DB-XXX
**Severity**: Critical/High/Medium/Low
**Environment**: Development/Staging/Production
**Steps to Reproduce**:
1. Step 1
2. Step 2
3. Step 3

**Expected Result**: 
What should happen

**Actual Result**: 
What actually happened

**Screenshots/Logs**: 
Attach relevant screenshots or log snippets

**Workaround** (if any):
How to temporarily bypass the issue
```

---

## Sign-off Checklist

Before declaring the database integration feature complete:

- [ ] All P0 tests passed
- [ ] All P1 tests passed
- [ ] Security audit completed
- [ ] Performance benchmarks met
- [ ] Documentation updated
- [ ] Rollback plan prepared
- [ ] Monitoring alerts configured
- [ ] User acceptance testing completed

---

**Document Version**: 1.0  
**Last Updated**: October 30, 2025  
**Maintained By**: Development Team
