# 🚀 Deploy to Render in 5 Minutes

## Prerequisites
- GitHub account ✅ (you have this)
- Repository pushed to main ✅ (already done)
- Your `.env` credentials ready ✅ (you have these)

## Quick Deploy Steps

### Step 1: Go to Render Dashboard
Open this link in your browser:
https://dashboard.render.com/

### Step 2: Connect GitHub (if not already done)
- Click **"New +"** button
- Select **"Web Service"**
- Click **"Connect Account"** → GitHub
- Authorize Render to access your GitHub

### Step 3: Select Your Repository
- Search for: `labour-attendece-app`
- Click to select it

### Step 4: Configure Service
Fill in these details:

```
Name:                  labour-bot
Environment:           Docker
Branch:                main
Root Directory:        (leave empty)
Auto-deploy:           (check this box)
```

### Step 5: Add Environment Variables
**IMPORTANT:** Scroll down to **"Environment"** section and add **4 variables:**

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | (from your `.env` file) |
| `VITE_SUPABASE_ANON_KEY` | (from your `.env` file) |
| `VITE_GROQ_API_KEY` | (from your `.env` file) |
| `TELEGRAM_BOT_TOKEN` | (from your `.env` file) |

**Copy the values from your local `.env` file and paste them into Render.**

### Step 6: Create & Deploy
1. Click **"Create Web Service"** button
2. Wait 2-3 minutes for deployment
3. You'll see a green checkmark ✅ when live

### Step 7: Verify It's Running
1. In Render dashboard, click your service
2. Go to **"Logs"** tab
3. You should see: `🚀 Jarvis Telegram Bot is running...`
4. ✅ Your bot is now live 24/7!

## Test Your Bot
- Open Telegram
- Search for your bot
- Send `/start`
- It should respond instantly!

## Monitoring
- **Logs**: Check real-time logs in Render dashboard
- **Status**: Green dot = running, Yellow = deploying, Red = error
- **Restart**: Click "Manual Deploy" to restart anytime

## Cost
- **Free tier**: First 750 hours/month (covers 1 service)
- **Paid tier**: $7/month for always-on

Congratulations! Your bot is now running 24/7 in the cloud! 🎉
