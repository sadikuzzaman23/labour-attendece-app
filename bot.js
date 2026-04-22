import express from 'express';
import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

// Environment Variables Validation
console.log('🔍 Checking environment variables...');
console.log('TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? '✅ Set' : '❌ Missing');
console.log('VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL ? '✅ Set' : '❌ Missing');
console.log('VITE_SUPABASE_ANON_KEY:', process.env.VITE_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing');
console.log('VITE_GROQ_API_KEY:', process.env.VITE_GROQ_API_KEY ? '✅ Set' : '❌ Missing');

if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY || !process.env.VITE_GROQ_API_KEY) {
    console.error('❌ Missing required environment variables. Please check your environment variables.');
    process.exit(1);
}

console.log('✅ All environment variables are set. Testing connections...');

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Jarvis Telegram Bot is running.');
});

app.listen(port, () => {
    console.log(`🌐 HTTP server listening on port ${port}`);
});

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const groq = new Groq({ apiKey: process.env.VITE_GROQ_API_KEY });

// Test connections before starting bot
try {
    console.log('🔍 Testing Supabase connection...');
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

    const { data, error } = await supabase.from('sites').select('count').limit(1);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    console.log('✅ Supabase connection successful');
} catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    process.exit(1);
}

try {
    console.log('🔍 Testing Groq connection...');
    const Groq = (await import('groq-sdk')).default;
    const groq = new Groq({ apiKey: process.env.VITE_GROQ_API_KEY });

    await groq.models.list();
    console.log('✅ Groq connection successful');
} catch (error) {
    console.error('❌ Groq connection failed:', error.message);
    process.exit(1);
}

console.log('🎉 All connections successful! Starting bot...');

const JARVIS_PERSONA = `You are Jarvis, a brilliant Civil Engineering Assistant. 
You help manage construction sites, labour work, and technical calculations.
Be professional, helpful, and concise. 
If asked about site data, use the information provided in the context.`;

// --- Helpers ---
async function getSiteSummary() {
    const { data: sites } = await supabase.from('sites').select('*');
    if (!sites || sites.length === 0) return "No sites found.";

    let summary = "🏗️ **Site Overview**\n\n";
    for (const site of sites) {
        const { count } = await supabase.from('workers').select('*', { count: 'exact', head: true }).eq('site_id', site.id);
        summary += `📍 *${site.name}*\n👥 Workers: ${count}\n📍 Location: ${site.location || 'N/A'}\n\n`;
    }
    return summary;
}

// --- Bot Commands ---

bot.start((ctx) => {
    ctx.replyWithMarkdown(
        "👋 *Welcome to Jarvis AI Assistant!*\n\n" +
        "I am your site management partner. You can use the following commands:\n" +
        "📊 /status - View site health and summaries\n" +
        "👷 /workers - List active workers\n" +
        "📑 /attendance - Today's attendance report\n\n" +
        "Or just talk to me about site issues!"
    );
});

bot.command('status', async (ctx) => {
    try {
        const summary = await getSiteSummary();
        ctx.replyWithMarkdown(summary);
    } catch (error) {
        ctx.reply("❌ Error fetching status: " + error.message);
    }
});

bot.command('workers', async (ctx) => {
    try {
        const { data: workers } = await supabase.from('workers').select('name, category, is_active').eq('is_active', true).limit(20);
        if (!workers || workers.length === 0) return ctx.reply("No active workers found.");

        let list = "👷 **Active Workers (Top 20)**\n\n";
        workers.forEach(w => {
            list += `• ${w.name} (${w.category})\n`;
        });
        ctx.replyWithMarkdown(list);
    } catch (error) {
        ctx.reply("❌ Error fetching workers: " + error.message);
    }
});

bot.command('attendance', async (ctx) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const { data: attendance } = await supabase.from('attendance').select('status').eq('date', today);
        
        const present = attendance ? attendance.reduce((sum, a) => sum + Number(a.status), 0) : 0;
        const total = attendance ? attendance.length : 0;

        ctx.replyWithMarkdown(`📑 **Attendance Report (${today})**\n\n✅ Present: ${present}\n📝 Total Records: ${total}`);
    } catch (error) {
        ctx.reply("❌ Error fetching attendance: " + error.message);
    }
});

// --- Jarvis AI Chat ---

bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;

    try {
        const userMsg = ctx.message.text;
        
        // Context Gathering
        const { data: sites } = await supabase.from('sites').select('name');
        const siteNames = sites ? sites.map(s => s.name).join(', ') : 'None';

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: `${JARVIS_PERSONA}\n\nCurrent Sites: ${siteNames}` },
                { role: "user", content: userMsg }
            ],
            model: "llama-3.3-70b-versatile",
        });

        const response = chatCompletion.choices[0].message.content;
        ctx.reply(response);
    } catch (error) {
        console.error(error);
        ctx.reply("🤖 Jarvis is currently having trouble processing that request. Please try again later.");
    }
});

// --- Launch ---
try {
    bot.launch();
    console.log('🚀 Jarvis Telegram Bot is running...');
} catch (error) {
    console.error('❌ Failed to launch bot:', error.message);
    process.exit(1);
}

// Global error handler
bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    if (ctx) {
        ctx.reply('🤖 Jarvis encountered an error. Please try again later.');
    }
});

// Enable graceful stop
process.once('SIGINT', () => {
    console.log('🛑 Shutting down bot...');
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    console.log('🛑 Shutting down bot...');
    bot.stop('SIGTERM');
});
