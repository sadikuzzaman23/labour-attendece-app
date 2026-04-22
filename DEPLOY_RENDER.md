# Deploy Telegram Bot to Render (24/7)

Follow these steps to deploy your bot to Render so it runs 24/7:

## Step 1: Prepare Your Repository
Your bot is ready to deploy. Make sure to commit and push to GitHub:
```bash
git add .
git commit -m "Add bot deployment files"
git push origin main
```

## Step 2: Create a Render Account
1. Go to [render.com](https://render.com)
2. Sign up with GitHub (easier for deployment)

## Step 3: Create a New Service
1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository (`labour-attendece-app`)
3. Select the repository

## Step 4: Configure the Service
Fill in these settings:

| Setting | Value |
|---------|-------|
| **Name** | `labour-bot` or any name you want |
| **Environment** | `Docker` |
| **Region** | Choose closest to you |
| **Branch** | `main` |

## Step 5: Set Environment Variables
1. Scroll to **"Environment"** section
2. Click **"Add Environment Variable"**
3. Add these variables from your `.env` file:

```
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
VITE_GROQ_API_KEY=your_groq_api_key_here
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
```

**Get these values from:**
- SUPABASE variables: Your Supabase project settings
- GROQ_API_KEY: Your Groq API console
- TELEGRAM_BOT_TOKEN: From @BotFather on Telegram

## Step 6: Deploy
1. Click **"Create Web Service"**
2. Wait 2-3 minutes for the deployment to complete
3. You'll see a green checkmark when it's live ✅

## Step 7: Verify Bot is Running
1. Check the Render dashboard for your service logs
2. Look for: `🚀 Jarvis Telegram Bot is running...`
3. Test your bot on Telegram - it should respond instantly!

## Important Notes

- ✅ The bot will run **24/7** automatically
- ✅ If it crashes, Render will restart it automatically
- ⚠️ Free tier has some limitations. For production, consider upgrading to Paid tier
- 💰 Cost: Free tier is sufficient, or $7/month for guaranteed uptime

## Monitoring & Updates

To update your bot code:
1. Push changes to GitHub
2. Render auto-deploys on push (optional auto-deploy can be enabled)
3. Check logs in Render dashboard

## Need Help?
- **Logs**: Check Render dashboard → your service → "Logs" tab
- **Status**: Check "Events" tab for deployment status
- **Restart**: Dashboard → your service → "Manual Deploy"
