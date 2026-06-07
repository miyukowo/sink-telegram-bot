import { webhookCallback } from 'grammy';
import { createBot } from './bot.js';

export default {
  async fetch(request, env, ctx) {
    // Basic route handling
    const url = new URL(request.url);

    // Provide a simple healthcheck / info endpoint
    if (url.pathname === '/') {
      return new Response('Sink Telegram Bot is running.', { status: 200 });
    }

    // Ensure environment variables are set
    if (!env.TELEGRAM_BOT_TOKEN || !env.SINK_API_URL || !env.SINK_API_TOKEN) {
      return new Response('Missing environment variables configuration.', { status: 500 });
    }

    const bot = createBot(env.TELEGRAM_BOT_TOKEN, env);

    // Route for the Telegram Webhook
    if (request.method === 'POST' && url.pathname === '/webhook') {
      try {
        const update = await request.json();
        // Initialize bot before handling update manually
        await bot.init();
        // Use ctx.waitUntil to ensure background tasks like KV writes finish
        ctx.waitUntil(bot.handleUpdate(update));
        return new Response('ok', { status: 200 });
      } catch (err) {
        console.error('Webhook error:', err);
        return new Response('Webhook handling error', { status: 500 });
      }
    }

    // Helper endpoint to set the webhook (optional, you can also use curl)
    if (url.pathname === '/setWebhook') {
      const webhookUrl = `https://${url.host}/webhook`;
      const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
      const data = await response.json();
      return new Response(JSON.stringify({ webhookUrl, telegramResponse: data }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
