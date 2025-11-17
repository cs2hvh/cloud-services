# MFA/2FA Quick Reference

## For Developers

### Enable 2FA in Your Component
```tsx
import EnableTotp from "@/components/dashboard/2fa/page";

function SettingsPage() {
  return (
    <div>
      <h1>Security Settings</h1>
      <EnableTotp />
    </div>
  );
}
```

### Check if User Has 2FA Enabled
```tsx
import { getMFAStatus } from "@/lib/api/mfa";

const status = await getMFAStatus();
if (status.hasVerifiedFactor) {
  console.log("2FA is enabled");
}
```

### API Endpoints

#### Enroll New Factor
```bash
POST /api/auth/mfa/enroll
# Returns: { factorId, qrCode, secret, uri }
```

#### Verify Code
```bash
POST /api/auth/mfa/verify
Body: { "factorId": "...", "code": "123456" }
# Returns: { success: true, message: "..." }
```

#### Disable 2FA
```bash
POST /api/auth/mfa/unenroll
Body: { "factorId": "..." } # optional
# Returns: { success: true, message: "..." }
```

#### Check Status
```bash
GET /api/auth/mfa/status
# Returns: { currentLevel, nextLevel, hasVerifiedFactor, factorId, factors }
```

#### Update Profile
```bash
PUT /api/profile/twofa
Body: { "two_factor_enabled": true }
# Returns: { success: true, message: "..." }
```

### Client-Side API Usage

```typescript
import {
  enrollMFA,
  verifyMFA,
  unenrollMFA,
  getMFAStatus,
  update2FAStatus,
} from "@/lib/api/mfa";

// Start enrollment
try {
  const { factorId, qrCode, secret } = await enrollMFA();
  // Show QR code to user
} catch (error) {
  console.error(error.message);
}

// Verify code
try {
  await verifyMFA(factorId, "123456");
  await update2FAStatus(true);
  // Success!
} catch (error) {
  console.error(error.message);
}

// Disable 2FA
try {
  await unenrollMFA();
  await update2FAStatus(false);
  // Disabled!
} catch (error) {
  console.error(error.message);
}
```

### Rate Limits

| Endpoint | Limit | Action |
|----------|-------|--------|
| Enroll | 3/min | Wait 60s |
| Verify | 10/min | Wait 60s |
| Unenroll | 3/min | Wait 60s |
| Profile Update | 5/min | Wait 60s |

### Common Errors

#### "Invalid TOTP code"
→ Check device clock sync, try next code

#### "Rate limit exceeded"
→ Wait 60 seconds, then retry

#### "Factor not found"
→ Re-enroll from scratch

#### "Unauthorized"
→ User must be logged in

### Database Schema

```sql
-- User profile
two_factor_enabled BOOLEAN DEFAULT FALSE

-- Migration
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
```

### Testing

```bash
# Run type check
npm run type-check

# Test API endpoint
curl -X POST http://localhost:3000/api/auth/mfa/status \
  -H "Cookie: ..." \
  -H "Content-Type: application/json"

# Test rate limiting
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/auth/mfa/enroll
done
```

### Troubleshooting

**QR Code not loading?**
→ Use manual secret entry instead

**Rate limit in development?**
→ Clear rate limiter: restart server

**2FA not working after sign-in?**
→ Check AAL level, verify factor status

**Users can't disable 2FA?**
→ Check for verified factors in database

### File Locations

```
app/api/auth/mfa/
├── enroll/route.ts      # Enrollment
├── verify/route.ts      # Verification  
├── unenroll/route.ts    # Disable
└── status/route.ts      # Status check

lib/
├── api/mfa.ts          # Client wrapper
└── rate-limit.ts       # Rate limiter

components/dashboard/2fa/
└── page.tsx            # UI component
```

### Production Checklist

- [ ] Database migration applied
- [ ] Environment variables set
- [ ] Rate limiting configured
- [ ] Redis setup (optional)
- [ ] Error monitoring enabled
- [ ] Audit logging configured
- [ ] Recovery process documented
- [ ] User documentation created

### Security Notes

⚠️ **Never expose:**
- TOTP secrets in logs
- Factor IDs in URLs
- Raw error details to users

✅ **Always:**
- Use HTTPS in production
- Validate all inputs
- Log authentication events
- Implement rate limiting
- Provide recovery options

### Support Resources

- **MFA Implementation**: `/MFA_IMPLEMENTATION.md`
- **Code Review Fixes**: `/CODE_REVIEW_FIXES.md`
- **Supabase MFA Docs**: https://supabase.com/docs/guides/auth/auth-mfa
- **TOTP RFC**: RFC 6238
