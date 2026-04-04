# Manual Test Scripts

These are ad-hoc development scripts used to verify specific backend
behaviours against a live environment. **They are not part of the
automated test suite** and are not run by CI.

## Files

| Script | Purpose |
|---|---|
| `test_admin_create.py` | Verify admin.create_user via the Supabase admin client |
| `test_rls_bypass.py` | Confirm the service-role client bypasses RLS |
| `test_signup.py` | Exercise the standard user signup flow |
| `test_signup_admin.py` | Exercise admin-initiated signup |
| `test_user_insert.py` | Direct row insert via the admin client |

## Running

```bash
# From neumas-backend/ with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set:
python tests/manual/test_admin_create.py
```

> **Note:** These scripts require real Supabase credentials and will make
> live requests. Never run them against the production database without
> intent.
