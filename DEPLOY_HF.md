# Deploy Telegram Bot on Hugging Face Spaces (Docker)

This repository can be deployed to Hugging Face Spaces using a custom Docker container. That lets your bot run continuously and keep responding to Telegram messages.

## What we changed
- Added `express` to serve a health endpoint
- Updated `Dockerfile` to expose port 3000
- Made the bot start in a container-friendly way

## Steps to deploy

### 1. Create a Hugging Face account
If you don't already have one, sign up at https://huggingface.co/join

### 2. Create a new Space
1. Go to https://huggingface.co/spaces
2. Click **"Create new Space"**
3. Choose a name like `labour-bot`
4. Set **SDK** to `Docker`
5. Choose **Hardware**: `CPU` is enough
6. Make the Space **public** or **private** as needed

### 3. Push your repository to GitHub
If not already pushed:
```bash
git add .
git commit -m "Prepare bot for Hugging Face deployment"
git push origin main
```

### 4. Connect the repository
1. In the new Space, select **Repository** → **GitHub**
2. Connect your repo: `sadikuzzaman23/labour-attendece-app`
3. Choose **main** branch

### 5. Add environment variables
In the Space settings, add these variables exactly:

- `TELEGRAM_BOT_TOKEN`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GROQ_API_KEY`

> Do NOT add them to the repo. Use the Hugging Face Secrets / Environment section.

### 6. Deploy
1. Click **Save** or **Create Space**
2. Wait for the build to finish
3. Check the **Logs** tab for:
   - `🌐 HTTP server listening on port 3000`
   - `🚀 Jarvis Telegram Bot is running...`

## Verify the bot
Once the Space is live, test Telegram:
- Send `/start`
- Send `/status`
- Send `/workers`

## Notes
- Spaces support long-running containers, so this should keep the bot active.
- The Express server is only there to keep the container healthy and respond to Hugging Face.
- Telegram messages are still handled by the bot via polling.
