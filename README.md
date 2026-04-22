# Labour Attendance App - Telegram Bot

This Space runs the **Jarvis Telegram Bot** for your labour attendance app.

## About

- Uses `telegraf` for Telegram bot integration
- Connects to Supabase for site and attendance data
- Uses Groq for AI chat responses
- Serves a health endpoint on port `7860`

## Deployment

This repository is configured for Hugging Face Docker Spaces.

## Environment Variables

Add these variables under Space settings:

- `TELEGRAM_BOT_TOKEN`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GROQ_API_KEY`

## Status

The bot is ready to run on Hugging Face Spaces when deployed with Docker.
