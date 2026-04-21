# Telegram Bot Integration: Jarvis AI

I have successfully integrated your Telegram Bot with the **Labour App**. Jarvis is now multi-platform! He can manage your construction sites via the web and Telegram.

## 🚀 Getting Started

1.  **Open Telegram**: Find your bot (the one you created with the token).
2.  **Start Chatting**: Send `/start` to see the available commands.

## 🛠️ Bot Capabilities

| Command | Description |
| :--- | :--- |
| `/start` | Quick introduction and command list. |
| `/status` | Get a real-time summary of all construction sites, including worker counts and locations. |
| `/workers` | List current active workers (shows the top 20). |
| `/attendance` | Get today's attendance report (Present count vs Total records). |
| **Direct Chat** | Speak naturally with **Jarvis**. He uses Groq (Llama-3.3-70b) and has context about your sites. |

## ⚙️ Technical Details

-   **Backend**: The bot runs on Node.js using the `telegraf` library.
-   **Database**: It connects directly to your **Supabase** instance to fetch real-time data.
-   **AI Intelligence**: Powered by **Groq**, same as your web assistant.
-   **File**: All logic is contained in `bot.js`.

### How to Run the Bot

The bot is currently running in your terminal. If you need to restart it later:
```bash
npm run bot
```

### Environment Variables Added
I have added the following to your `.env` file:
- `TELEGRAM_BOT_TOKEN`: Your private bot token.

---
> [!TIP]
> You can now ask Jarvis questions like *"How many workers are at the Default Construction Site?"* or *"What is the status of my projects?"* directly via Telegram!
