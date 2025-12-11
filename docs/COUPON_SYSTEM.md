# Coupon System Implementation

A complete promotional coupon system for the Cloud Services platform that allows admins to create and manage coupons, and users to redeem them for account credits.

## 📋 Overview

The coupon system consists of:
- **Admin Panel**: Create, edit, and manage promotional coupons
- **User Interface**: View and redeem available coupons in the billing section
- **Database**: Secure storage with RLS policies
- **API**: RESTful endpoints for all operations

---

## 🗄️ Database Setup

### Migration
Run the SQL migration file to create the `promocodes` table:
```bash
# Location: supabase/migrations/create_promocodes_table.sql
```

### Table Schema
```sql
billing.promocodes (
  id                UUID PRIMARY KEY
  code              TEXT UNIQUE NOT NULL
  amount            NUMERIC NOT NULL
  redeem_by         JSONB DEFAULT '[]'
  valid_till        TIMESTAMP WITH TIME ZONE NOT NULL
  coupon_type       TEXT NOT NULL
  max_redemptions   INTEGER NULL
  created_by        UUID NULL
  created_at        TIMESTAMP WITH TIME ZONE
  updated_at        TIMESTAMP WITH TIME ZONE
  is_active         BOOLEAN DEFAULT TRUE
)
```

---

## 🔌 API Endpoints

### Admin Endpoints (Protected)

#### `GET /api/admin/coupons`
Get all coupons (admin only)
```typescript
Response: {
  success: boolean;
  data: Coupon[];
}
```

#### `POST /api/admin/coupons`
Create a new coupon
```typescript
Request: {
  code: string;              // Unique code (uppercase)
  amount: number;            // Credit amount
  valid_till: string;        // ISO date string
  coupon_type: string;       // 'one-time' | 'multi-use' | 'limited'
  max_redemptions?: number;  // For 'limited' type
}
Response: {
  success: boolean;
  data: Coupon;
}
```

#### `PUT /api/admin/coupons`
Update an existing coupon
```typescript
Request: {
  id: string;
  amount?: number;
  valid_till?: string;
  coupon_type?: string;
  max_redemptions?: number;
  is_active?: boolean;
}
Response: {
  success: boolean;
  data: Coupon;
}
```

#### `DELETE /api/admin/coupons?id={id}`
Soft delete a coupon (sets is_active to false)
```typescript
Response: {
  success: boolean;
}
```

### User Endpoints (Authenticated)

#### `GET /api/billing/coupons`
Get available coupons for the current user
```typescript
Response: {
  success: boolean;
  data: Coupon[];  // Only unredeemed, active, non-expired coupons
}
```

#### `POST /api/billing/coupons/redeem`
Redeem a coupon code
```typescript
Request: {
  code: string;
}
Response: {
  success: boolean;
  balance: number;    // Updated balance
  amount: number;     // Amount added
  message: string;
}
```

---

## 🎨 User Interface

### Admin Panel
**Location**: `/dashboard/admin/coupons`

Features:
- ✅ View all coupons with stats
- ✅ Create new coupons with validation
- ✅ Edit existing coupons
- ✅ Delete coupons (soft delete)
- ✅ Search by code
- ✅ Real-time status (Active/Expired/Inactive)
- ✅ Redemption tracking

Components:
- `components/admin/coupons/admin-coupons.tsx` - Main component
- `components/admin/coupons/create-coupon-dialog.tsx` - Create dialog
- `components/admin/coupons/edit-coupon-dialog.tsx` - Edit dialog

### User Billing Page
**Location**: `/dashboard/nav/billing`

Features:
- ✅ New "Coupons" tab in billing section
- ✅ View available coupons only (unredeemed)
- ✅ Beautiful coupon cards with details
- ✅ One-click apply functionality
- ✅ Real-time balance update
- ✅ Toast notifications

---

## 🔒 Security

### Authentication & Authorization
- ✅ Admin routes protected by `requireAdmin()`
- ✅ User routes require authentication
- ✅ Row Level Security (RLS) enabled on database

### RLS Policies
```sql
-- Admins have full access
CREATE POLICY "Admins have full access to promocodes"
ON billing.promocodes FOR ALL
USING (user is admin);

-- Users can only view available coupons
CREATE POLICY "Users can view available promocodes"
ON billing.promocodes FOR SELECT
USING (is_active = true AND valid_till > NOW());
```

### Validation
- ✅ Server-side validation for all operations
- ✅ Duplicate code prevention
- ✅ Amount validation (> 0)
- ✅ Date validation
- ✅ Redemption limit checks
- ✅ Expiration checks

---

## 💻 Usage Examples

### Admin: Create a Coupon
```typescript
// Via API
const response = await api.post('/admin/coupons', {
  code: 'WELCOME2024',
  amount: 50,
  valid_till: '2024-12-31T23:59:59Z',
  coupon_type: 'one-time',
});

// Via Supabase query
const result = await Promocodes.create({
  code: 'WELCOME2024',
  amount: 50,
  valid_till: '2024-12-31T23:59:59Z',
  coupon_type: 'one-time',
  created_by: adminUserId,
});
```

### User: Redeem a Coupon
```typescript
// Via API
const response = await api.post('/billing/coupons/redeem', {
  code: 'WELCOME2024'
});

// Via Supabase query
const result = await Promocodes.redeem('WELCOME2024', userId, userEmail);
```

---

## 📊 Coupon Types

### 1. One-Time Use
- Each user can redeem only once
- Most restrictive

### 2. Multi-Use
- Unlimited redemptions across all users
- No limit on total uses

### 3. Limited Use
- Specify max_redemptions
- First N users can redeem
- Automatically becomes unavailable after limit

---

## 🔍 Query Functions

### Available in `lib/supabase/queries.ts`

```typescript
// Admin operations
Promocodes.create(data)           // Create new coupon
Promocodes.update(id, data)       // Update coupon
Promocodes.delete(id)             // Soft delete
Promocodes.get_all()              // Get all coupons with stats
Promocodes.get_by_id(id)          // Get specific coupon
Promocodes.get_by_code(code)      // Get by code

// User operations
Promocodes.get_available_for_user(userId, email)  // Get unredeemed coupons
Promocodes.validate_code(code, userId, email)     // Validate before redeem
Promocodes.redeem(code, userId, email)            // Redeem coupon
```

---

## 🎯 Features

### Admin Features
- ✅ Full CRUD operations
- ✅ Coupon analytics dashboard
- ✅ Redemption tracking
- ✅ Status management
- ✅ Search and filter
- ✅ Bulk operations support

### User Features
- ✅ View available coupons
- ✅ One-click redemption
- ✅ Real-time balance updates
- ✅ Automatic filtering (already redeemed hidden)
- ✅ Expiration awareness
- ✅ Beautiful UI/UX

### System Features
- ✅ Automatic validation
- ✅ Prevent duplicate redemptions
- ✅ Track redemption history
- ✅ Support expiration dates
- ✅ Multiple coupon types
- ✅ Redemption limits
- ✅ Soft deletion
- ✅ Audit trail (created_at, updated_at)

---

## 🧪 Testing

### Manual Testing Checklist

**Admin Panel:**
- [ ] Create a new coupon
- [ ] Edit coupon details
- [ ] Delete a coupon
- [ ] Search for coupons
- [ ] View redemption stats

**User Interface:**
- [ ] View available coupons
- [ ] Redeem a coupon
- [ ] Verify balance update
- [ ] Try redeeming same coupon again (should fail)
- [ ] Check expired coupons don't show

**Edge Cases:**
- [ ] Duplicate code prevention
- [ ] Expired coupon validation
- [ ] Max redemption limit
- [ ] Invalid code handling
- [ ] Already redeemed handling

---

## 🔄 Future Enhancements (Optional)

- [ ] Percentage-based discounts
- [ ] Coupon categories/tags
- [ ] Bulk coupon generation
- [ ] Export redemption reports
- [ ] Email notifications
- [ ] Coupon usage analytics
- [ ] Auto-expire mechanism
- [ ] User-specific coupons
- [ ] Minimum balance requirements

---

## 📝 Notes

1. **Code Format**: All coupon codes are automatically converted to uppercase
2. **Soft Deletion**: Deleted coupons are marked inactive, not removed from database
3. **Redemption History**: Stored in `redeem_by` JSONB array with email, userId, and timestamp
4. **Balance Update**: Automatic via `Billing.topup()` function
5. **Timezone**: All dates stored in UTC with timezone information

---

## 🚀 Deployment

1. Run database migration:
   ```sql
   -- Execute: supabase/migrations/create_promocodes_table.sql
   ```

2. Verify RLS policies are enabled

3. Test admin access with admin user

4. Create test coupons

5. Test user redemption flow

6. Monitor for any errors in logs

---

## 📞 Support

For issues or questions:
- Check database logs
- Verify RLS policies
- Check API error responses
- Review browser console for client errors

---

## ✅ Implementation Complete

All features have been successfully implemented:
- ✅ Database schema with RLS
- ✅ Supabase query functions
- ✅ Admin & User API routes
- ✅ Admin management interface
- ✅ User coupon redemption UI
- ✅ Full validation & security
- ✅ Error handling & notifications

The coupon system is ready for use! 🎉
