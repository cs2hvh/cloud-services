# Next Steps - UI Integration & Testing

## 🎯 Immediate Next Steps

### Phase 1: Environment & Database Setup (BLOCKING)

**Timeline**: ~1 hour

1. **Set Proxmox Credentials**
   ```bash
   # Add to .env.local
   PROXMOX_HOST_URL=https://your-proxmox.com:8006
   PROXMOX_TOKEN_ID=root@pam!vm-provisioner
   PROXMOX_TOKEN_SECRET=<your-token>
   # OR (for password auth):
   PROXMOX_USERNAME=root@pam
   PROXMOX_PASSWORD=password
   ```

2. **Push Database Migrations**
   ```bash
   supabase db push
   ```

3. **Seed Proxmox Configuration** (via Supabase dashboard or SQL)
   ```sql
   -- Add your Proxmox host
   INSERT INTO proxmox_hosts (
     id, name, host_url, node, storage, bridge, is_active
   ) VALUES (
     'prod-pve1',
     'Production Proxmox 1',
     'https://pve1.example.com:8006',
     'pve1',
     'local',
     'vmbr0',
     true
   );
   
   -- Add IP pool
   INSERT INTO public_ip_pools (host_id, ip_range, gateway_ip, is_active)
   VALUES (
     'prod-pve1',
     '203.0.113.0/24',
     '203.0.113.1',
     true
   );
   
   -- Add individual IPs
   INSERT INTO public_ips (host_id, ip, pool_id, is_used)
   SELECT 'prod-pve1', host(ip), (SELECT id FROM public_ip_pools WHERE host_id='prod-pve1'),
     false
   FROM generate_series('203.0.113.10'::inet, '203.0.113.254'::inet) as ip;
   
   -- Add OS templates
   INSERT INTO proxmox_templates (host_id, vmid, name, os_type, is_active)
   VALUES
     ('prod-pve1', 9001, 'ubuntu-22.04', 'ubuntu-22.04', true),
     ('prod-pve1', 9002, 'debian-12', 'debian-12', true);
   ```

---

### Phase 2: Form UI Integration (Current)

**Timeline**: ~1-2 hours  
**File**: `components/dashboard/compute/vps/new.tsx`

#### What needs to change:

1. **Load Dynamic Options**
   ```tsx
   // Add at top of component
   const [computeOptions, setComputeOptions] = useState<any>(null);
   const [loadingOptions, setLoadingOptions] = useState(true);
   
   useEffect(() => {
     fetch('/api/services/compute/options')
       .then(r => r.json())
       .then(d => {
         setComputeOptions(d.data);
         setLoadingOptions(false);
       })
       .catch(err => {
         console.error('Failed to load options:', err);
         setLoadingOptions(false);
       });
   }, []);
   ```

2. **Update Location Selection**
   - Replace `locations` prop with `computeOptions.locations`
   - Map `{ id, name }` from Proxmox hosts instead of locations table
   - Update location names to show host info

3. **Update OS Selection**
   - Replace hardcoded `operatingSystems` with `computeOptions.osTemplates`
   - Map template names to OS display (e.g., "ubuntu-22.04" → "Ubuntu 22.04 LTS")
   - Use `os_type` for display, `name` for API

4. **Update Plans Logic**
   - **Option A (Simpler)**: Keep existing fixed plans, just map to specs
   - **Option B (Better)**: Fetch dynamic pricing from pricing tier endpoint
   - For now, map fixed plans to resource specs:
     ```tsx
     const planToSpecs = {
       'vps-basic': { cpuCores: 1, memoryMB: 2048, diskGB: 50 },
       'vps-standard': { cpuCores: 2, memoryMB: 4096, diskGB: 80 },
       // ...
     };
     ```

5. **Replace Mock onSubmit()**
   ```tsx
   const onSubmit = async () => {
     if (!termsAccepted) {
       toast.error("Please accept the terms of service");
       return;
     }
     
     const plan = vpsPlans.find(p => p.id === selectedPlan);
     const specs = planToSpecs[selectedPlan];
     
     setIsLoading(true);
     try {
       const response = await fetch('/api/services/compute/vms/create', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           hostname: vpsName,
           location: selectedLocation,
           os: selectedOS,
           cpuCores: specs.cpuCores,
           memoryMB: specs.memoryMB,
           diskGB: specs.diskGB,
           sshPassword: rootPassword,  // Add this field to form!
           // ownerEmail: user.email, // Get from auth context
           // ownerId: user.id,
         }),
       });
       
       if (!response.ok) {
         const error = await response.json();
         throw new Error(error.error || 'Deployment failed');
       }
       
       const { serverId, vmid, ip, status } = await response.json();
       
       toast.success(`VPS created! VMID: ${vmid}, IP: ${ip}`);
       // Redirect to servers page or show details
       // router.push(`/dashboard/services/compute/vms/${serverId}`);
     } catch (error) {
       toast.error(error instanceof Error ? error.message : 'Failed to deploy');
     } finally {
       setIsLoading(false);
     }
   };
   ```

6. **Add Missing Form Fields**
   - **SSH Root Password**: Add secure password input (Step 1)
   - Validation: min 12 chars, complexity requirements
   - Show password strength indicator

#### Form Flow After Changes:
```
Step 1: Name (vpsName) + Root Password (NEW)
Step 2: Location (from computeOptions.locations)
Step 3: Plan (fixed plans, maps to specs)
Step 4: OS (from computeOptions.osTemplates)
Step 5: Review (show all selections + estimated cost)
→ Submit → Call /api/services/compute/vms/create
```

---

### Phase 3: API Testing

**Timeline**: ~30 minutes  
**Tools**: Postman, curl, or VS Code REST Client

#### Test Cases:

1. **Test Options Endpoint**
   ```bash
   curl http://localhost:3000/api/services/compute/options
   # Should return: { ok: true, data: { locations: [], osTemplates: [], specs: {} } }
   ```

2. **Test VM Creation - Success Path**
   ```bash
   curl -X POST http://localhost:3000/api/services/compute/vms/create \
     -H "Content-Type: application/json" \
     -d '{
       "hostname": "test-vm-1",
       "location": "prod-pve1",
       "os": "ubuntu-22.04",
       "cpuCores": 2,
       "memoryMB": 2048,
       "diskGB": 50,
       "sshPassword": "Test@1234567",
       "ownerEmail": "test@example.com"
     }'
   # Should return: { ok: true, serverId: 1, vmid: 100, ip: "203.0.113.10", status: "running", ... }
   ```

3. **Test VM Creation - Error Cases**
   - Missing fields → 400 Bad Request
   - Invalid host → 404 Not Found
   - No IPs available → 409 Conflict
   - Proxmox error → 500 with error message

4. **Test Power Management**
   ```bash
   curl -X POST http://localhost:3000/api/services/compute/vms/power \
     -H "Content-Type: application/json" \
     -d '{ "action": "stop", "serverId": 1 }'
   # Should return: { ok: true, action: "stop", status: "stopped" }
   ```

5. **Verify Database**
   ```sql
   SELECT id, name, vmid, ip, status, owner_email FROM servers ORDER BY created_at DESC LIMIT 5;
   SELECT * FROM public_ips WHERE is_used = true;
   ```

---

### Phase 4: Full Integration Testing

**Timeline**: ~1-2 hours

1. **End-to-End User Flow**
   - [ ] Login to dashboard
   - [ ] Navigate to Create VPS
   - [ ] Fill form with valid data
   - [ ] Submit and watch provisioning
   - [ ] Verify server appears in list with correct status
   - [ ] Check Proxmox console to verify VM exists
   - [ ] Test power controls
   - [ ] Delete VM and verify cleanup

2. **Error Scenarios**
   - [ ] Invalid hostname
   - [ ] Low memory allocation
   - [ ] No locations available
   - [ ] Network timeout during provisioning
   - [ ] Proxmox API errors

3. **Edge Cases**
   - [ ] Multiple concurrent VM creations
   - [ ] Very large disk allocation
   - [ ] Special characters in hostname
   - [ ] Rapid power state changes

---

### Phase 5: Performance & Monitoring

**Timeline**: TBD

- [ ] Monitor API response times
- [ ] Check database query performance
- [ ] Setup error logging
- [ ] Monitor Proxmox API rate limits
- [ ] Track provisioning success rate

---

## 📋 Checklist Before Production

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Proxmox host configured and tested
- [ ] OS templates created and registered
- [ ] IP pools created and seeded
- [ ] UI form updated
- [ ] API endpoints tested manually
- [ ] End-to-end flow tested
- [ ] Error handling verified
- [ ] User authentication integrated
- [ ] Error logging enabled
- [ ] Documentation updated
- [ ] Ready for production deployment

---

## 🚀 Quick Start Commands

```bash
# 1. Start local development server
npm run dev

# 2. Apply database migrations
supabase db push

# 3. View logs
supabase functions list

# 4. Test API (in another terminal)
curl http://localhost:3000/api/services/compute/options

# 5. Check database
supabase gen types typescript > lib/supabase/types.ts
```

---

## 📊 Progress Tracking

| Component | Status | Notes |
|-----------|--------|-------|
| Pricing utils | ✅ Done | Ready to use |
| Proxmox utils | ✅ Done | 15+ helper functions |
| VM create API | ✅ Done | Awaiting env config |
| Power mgmt API | ✅ Done | Tested logic |
| Options API | ✅ Done | Returns dynamic data |
| Database schema | ✅ Done | Migration ready |
| UI integration | 🔄 Next | Form needs updates |
| Manual testing | ⏳ Pending | After UI |
| Full testing | ⏳ Pending | Before launch |
| Production | ⏳ Pending | After all tests |

---

## ❓ Questions & Answers

**Q: Do I need to create OS templates manually?**  
A: Yes, they must exist on Proxmox first, then registered in `proxmox_templates` table.

**Q: How do I handle SSH passwords?**  
A: For cloud-init templates, the password is set via cloud-init. Consider using SSH keys instead for production.

**Q: Can users delete VMs?**  
A: Delete API not implemented yet. Should add before production.

**Q: How is billing calculated?**  
A: Via `hourly_cost` in database. Wallet/charging is NOT included (per requirements).

**Q: What if Proxmox goes down?**  
A: VM creation will fail. Server record marked as "failed". User can retry.

---

## 🎓 Learning Resources

- [Proxmox API Docs](https://pve.proxmox.com/pve-docs/api-viewer/)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Zod Validation](https://zod.dev/)

---

**Owner**: Implementation Team  
**Updated**: 2024  
**Status**: Ready for Phase 2 (UI Integration)
