# Render Deployment Troubleshooting Guide

## Error: "Invalid API key" from Supabase

### Root Cause
The Supabase API key in your Render environment variables is invalid or doesn't match your project.

### Solution

#### Step 1: Verify Your Supabase Credentials
1. Log in to [supabase.com](https://supabase.com)
2. Navigate to your project: **iplgwdzvkrwhsacapzuq**
3. Go to **Settings** → **API**
4. You should see:
   - **Project URL** (e.g., `https://iplgwdzvkrwhsacapzuq.supabase.co`)
   - **anon public** key (the public key for frontend/bot use)
   - **service_role** key (use this for server-side operations)

#### Step 2: Determine Which Key to Use
- **For Telegram Bot (Render deployment)**: Use **service_role** key (not anon)
  - This key has full access and is meant for server-side applications
  - More secure for backend services like your bot

#### Step 3: Update Render Environment Variables
1. Go to [dashboard.render.com](https://dashboard.render.com/)
2. Select your **labour-bot** service
3. Click **Settings** → **Environment**
4. Update these variables:

| Variable | Value | Source |
|----------|-------|--------|
| `VITE_SUPABASE_URL` | `https://iplgwdzvkrwhsacapzuq.supabase.co` | From Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | **Leave as is or use service_role** | Consider using service_role key instead |
| `VITE_GROQ_API_KEY` | Your Groq API key | From [console.groq.com](https://console.groq.com) |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token | From @BotFather on Telegram |

#### Step 4: Save and Redeploy
1. After updating the environment variables, click **Save**
2. Render will automatically trigger a new deployment
3. Monitor the deployment logs in **Logs** tab

---

## Other Issues

### Issue: "Node.js 18 and below are deprecated"
✅ **FIXED** - Dockerfile now uses Node.js 20

### Issue: "@supabase/storage-js requires Node.js >=20.0.0"
✅ **FIXED** - Upgraded to Node.js 20-alpine

### Issue: Service keeps crashing on startup
- Check **Logs** in Render dashboard
- Verify all 4 environment variables are set (check for typos)
- Verify Supabase project still exists and is accessible
- Test locally: `npm run bot` with your `.env` file

---

## Testing Locally Before Render Deployment

```bash
# 1. Update your local .env file with the correct Supabase credentials
nano .env

# 2. Run the bot locally
npm run bot

# 3. Check for connection errors
# The bot should print:
#   ✅ All environment variables are set
#   ✅ Supabase connection successful
#   ✅ Groq connection successful
#   🚀 Jarvis Telegram Bot is running...
```

---

## Getting the Correct Supabase Key

### Using ANON Key (Current Setup)
- Public, safe to expose in client code
- Limited permissions for users
- **May not have permission to write to certain tables**

### Using SERVICE_ROLE Key (Recommended for Bot)
- Secret, keep private
- Full database access
- Meant for backend/server applications
- **More secure for persistent services like Render**

**Recommendation**: Update your bot.js to use `VITE_SUPABASE_ANON_KEY` OR use the service_role key instead for better permissions.

---

## Render Dashboard Checks

1. **Logs Tab**: Shows real-time deployment and runtime logs
2. **Health Tab**: Shows if service is running (should be green)
3. **Environment Tab**: Double-check all 4 variables are present
4. **Events Tab**: Shows deployment history and events

---

## Contact Supabase Support
If the credentials are correct but still getting "Invalid API key":
1. Generate a new API key in Supabase Settings
2. Update Render environment variables
3. Trigger a new deployment
