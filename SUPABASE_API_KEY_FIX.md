# Supabase API Key Validation & Fix Script

## Issue: "Invalid API key" Error

Your bot detects all environment variables are set, but Supabase rejects the API key. This guide helps you identify and fix the problem.

---

## Root Cause Analysis

### Why is the API key invalid?

1. **Supabase project was deleted** - The URL points to a non-existent project
2. **API key is corrupted** - Extra spaces, wrong encoding, or truncated
3. **URL/Key mismatch** - Using a key from a different Supabase project
4. **Key permissions issue** - The anon key might not have table access
5. **Expired or revoked key** - Old credentials that are no longer valid

---

## Diagnostic Script

Run this to check your Supabase setup:

```bash
# 1. Extract and display current Supabase config
echo "=== Current Environment ==="
echo "URL: $VITE_SUPABASE_URL"
echo "Key Length: ${#VITE_SUPABASE_ANON_KEY}"
echo "Key First 20 chars: ${VITE_SUPABASE_ANON_KEY:0:20}..."

# 2. Test with curl if URL is accessible
echo ""
echo "=== Testing Supabase Endpoint ==="
curl -s -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  "$VITE_SUPABASE_URL/rest/v1/?select=*" | head -100

# 3. If curl fails, try node test
echo ""
echo "=== Testing with Node.js ==="
node << 'EOF'
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

console.log('URL:', url);
console.log('Key valid:', key && key.length > 0);

try {
    const supabase = createClient(url, key);
    console.log('✅ Client created successfully');
    
    // Try to ping the database
    const { data, error } = await supabase.from('information_schema.tables').select('count');
    if (error) {
        console.log('❌ Query failed:', error.message);
    } else {
        console.log('✅ Database accessible');
    }
} catch (err) {
    console.error('❌ Error:', err.message);
}
EOF
```

---

## Solution Steps

### Quick Fix (Most Common)

**Problem**: You may have used the wrong API key format

**Solution**: 
1. Delete the current `VITE_SUPABASE_ANON_KEY` value in Render
2. Go to supabase.com → Your Project → Settings → API
3. Under **Project API keys**, find the row with **anon** label
4. Click the key icon to copy the full JWT token
5. Paste it exactly (no spaces) into Render

---

## Detailed Fix for Render

### Via Render Dashboard (Recommended)

1. **Stop the service**
   - Go to [render.com](https://render.com) → labour-bot
   - Click **Settings** → **Instance Type**
   - Set to free tier (or click Suspend if available)

2. **Fix environment variables**
   - Click **Settings** → **Environment**
   - Verify these 4 variables exist:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
     - `VITE_GROQ_API_KEY`
     - `TELEGRAM_BOT_TOKEN`

3. **Delete & recreate the key**
   - Click **VITE_SUPABASE_ANON_KEY**
   - Click **X** to delete
   - Click **Add Environment Variable**
   - Key: `VITE_SUPABASE_ANON_KEY`
   - Value: [Paste fresh key from supabase.com]

4. **Deploy**
   - Click **Save** (triggers auto-redeploy)
   - Wait 2-3 minutes
   - Check **Logs** tab

---

## Alternative: Use service_role Instead of anon

If anon key continues to fail:

```
1. In Supabase Settings → API → Scroll down
2. Find the line labeled "service_role" or "Service role secret"
3. Copy that key value
4. In Render, set VITE_SUPABASE_ANON_KEY to this service_role key
5. Save and redeploy
```

This key has full database access (more permissive for backend apps).

---

## Validate Before Pushing to Render

Test locally to confirm credentials work:

```bash
# 1. Create a test file
cat > test-supabase.js << 'EOF'
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
);

try {
    const { data, error } = await supabase.from('sites').select('count').limit(1);
    if (error) {
        console.log('❌ Error:', error.message);
        process.exit(1);
    }
    console.log('✅ Supabase connection successful!');
    console.log('Data:', data);
} catch (err) {
    console.error('❌ Exception:', err.message);
    process.exit(1);
}
EOF

# 2. Run the test
npm install
node test-supabase.js

# 3. If successful, then deploy to Render
```

---

## Debugging Output to Watch For

### ✅ Success
```
✅ All environment variables are set. Testing connections...
✅ Supabase connection successful
✅ Groq connection successful
🎉 All connections successful! Starting bot...
🚀 Jarvis Telegram Bot is running...
```

### ❌ Invalid Key Error
```
❌ Supabase connection failed: Supabase error: Invalid API key
```
→ Check URL + Key match in Supabase Settings → API

### ❌ Network Error
```
❌ Supabase connection failed: Supabase error: Failed to connect
```
→ Supabase service down or URL is wrong

### ❌ Missing Variables
```
❌ Missing required environment variables. Please check your environment variables.
```
→ One or more env vars not set in Render

---

## Next Steps

1. **Verify Supabase project exists** - Can you log into supabase.com and see the project?
2. **Copy fresh credentials** - Get the latest URL and anon key from Settings → API
3. **Update Render** - Paste into environment variables
4. **Redeploy** - Click Save to trigger new build
5. **Monitor logs** - Check the Logs tab for success/failure messages

Share the error message if it persists and we can debug further!
