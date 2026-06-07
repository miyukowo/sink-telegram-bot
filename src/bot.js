import { Bot, InlineKeyboard } from 'grammy';
import { SinkAPI } from './sink.js';

export function createBot(token, env) {
  const bot = new Bot(token);
  
  // Access control middleware
  bot.use(async (ctx, next) => {
    const allowedUsersStr = env.ALLOWED_USER_IDS || '';
    const allowedUsers = allowedUsersStr.split(',').map(u => u.trim()).filter(Boolean);
    
    if (allowedUsers.length > 0) {
      const userId = ctx.from?.id.toString();
      if (!userId || !allowedUsers.includes(userId)) {
        console.warn(`Unauthorized access attempt from user ID: ${userId}`);
        return; // Silently ignore unauthorized users
      }
    } else {
      // If no ALLOWED_USER_IDS is set, maybe warn them but allow.
      // We will allow it but advise to set it.
    }
    await next();
  });

  const getSinkApi = () => {
    return new SinkAPI(env.SINK_API_URL, env.SINK_API_TOKEN);
  };

  // Error boundary
  bot.catch((err) => {
    console.error(`Error while handling update ${err.ctx.update.update_id}:`);
    console.error(err.error);
    err.ctx.reply(`❌ An error occurred: ${err.error.message || err.error}`).catch(() => {});
  });

  // Welcome / Menu
  bot.command('start', async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text('📊 Stats', 'action_stats')
      .text('📋 List Links', 'action_list')
      .row()
      .text('💾 Trigger Backup', 'action_backup');
      
    await ctx.reply(
      `👋 Welcome to Sink Bot!\n\n` +
      `Here are the available commands:\n` +
      `➕ /create <url> [slug] [comment] - Create a link\n` +
      `🔍 /query <slug> - Get link details\n` +
      `🗑 /delete <slug> - Delete a link\n` +
      `🤖 /ai_slug <url> - Generate AI slug\n` +
      `📊 /stats - View statistics\n\n` +
      `Or use the menu below:`,
      { reply_markup: keyboard }
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `📚 **Sink Bot Help**\n\n` +
      `**Create Link:**\n\`/create https://example.com\`\n\`/create https://example.com myslug\`\n\`/create https://example.com myslug "My custom comment"\`\n\n` +
      `**Get Link:**\n\`/query myslug\`\n\n` +
      `**Delete Link:**\n\`/delete myslug\`\n\n` +
      `**AI Slug:**\n\`/ai_slug https://example.com\`\n\n` +
      `**List Links:**\n\`/list\`\n\n` +
      `**Stats:**\n\`/stats\``,
      { parse_mode: 'Markdown' }
    );
  });

  // Create Link
  bot.command('create', async (ctx) => {
    const args = ctx.match.split(/\s+/);
    if (!ctx.match || args.length === 0 || !args[0]) {
      return ctx.reply('❌ Usage: `/create <url> [slug] [comment]`\nExample: `/create https://example.com myslug "My comment"`', { parse_mode: 'Markdown' });
    }

    const url = args[0];
    const slug = args[1];
    
    // Parse comment which might be in quotes
    let comment = undefined;
    const commentMatch = ctx.match.match(/["']([^"']+)["']/);
    if (commentMatch) {
      comment = commentMatch[1];
    } else if (args.length > 2) {
      comment = args.slice(2).join(' ');
    }

    const api = getSinkApi();
    const payload = { url };
    if (slug) payload.slug = slug;
    if (comment) payload.comment = comment;

    try {
      const msg = await ctx.reply('⏳ Creating link...');
      const res = await api.createLink(payload);
      const link = res.link || res;
      const shortUrl = `${env.SINK_API_URL}/${link.slug}`;
      await ctx.api.editMessageText(ctx.chat.id, msg.message_id, `✅ **Link Created!**\n\n🔗 Short: ${shortUrl}\n🎯 Target: ${link.url}\n🏷 Slug: \`${link.slug}\`\n📝 Comment: ${link.comment || 'N/A'}`, { parse_mode: 'Markdown' });
    } catch (e) {
      await ctx.reply(`❌ Failed to create link: ${e.message}`);
    }
  });

  // Query Link
  bot.command('query', async (ctx) => {
    const slug = ctx.match.trim();
    if (!slug) return ctx.reply('❌ Usage: `/query <slug>`', { parse_mode: 'Markdown' });

    try {
      const api = getSinkApi();
      const res = await api.queryLink(slug);
      const link = res.link || res;
      
      const shortUrl = `${env.SINK_API_URL}/${link.slug}`;
      const text = `🔍 **Link Details:**\n\n` +
                   `🏷 Slug: \`${link.slug}\`\n` +
                   `🔗 Short: ${shortUrl}\n` +
                   `🎯 Target: ${link.url}\n` +
                   `📝 Comment: ${link.comment || 'N/A'}\n` +
                   `📅 Created: ${new Date(link.createdAt * 1000).toLocaleString()}`;
                   
      const keyboard = new InlineKeyboard().text('🗑 Delete', `delete_${link.slug}`);
      await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard, disable_web_page_preview: true });
    } catch (e) {
      await ctx.reply(`❌ Failed to query link: ${e.message}`);
    }
  });

  // Delete Link
  bot.command('delete', async (ctx) => {
    const slug = ctx.match.trim();
    if (!slug) return ctx.reply('❌ Usage: `/delete <slug>`', { parse_mode: 'Markdown' });

    const keyboard = new InlineKeyboard()
      .text('✅ Yes, delete it', `confirm_delete_${slug}`)
      .text('❌ Cancel', 'cancel_delete');
      
    await ctx.reply(`Are you sure you want to delete the link \`${slug}\`?`, { parse_mode: 'Markdown', reply_markup: keyboard });
  });

  // AI Slug
  bot.command('ai_slug', async (ctx) => {
    const url = ctx.match.trim();
    if (!url) return ctx.reply('❌ Usage: `/ai_slug <url>`', { parse_mode: 'Markdown' });

    try {
      const msg = await ctx.reply('🤖 Generating slug...');
      const api = getSinkApi();
      const res = await api.aiSlug(url);
      await ctx.api.editMessageText(ctx.chat.id, msg.message_id, `🤖 **AI Suggestion:**\n\n\`${res.slug}\`\n\nUse this to create your link:\n\`/create ${url} ${res.slug}\``, { parse_mode: 'Markdown' });
    } catch (e) {
      await ctx.reply(`❌ Failed to generate AI slug: ${e.message}`);
    }
  });

  // List Links
  bot.command('list', async (ctx) => {
    await sendLinkList(ctx, 1);
  });

  // Stats
  bot.command('stats', async (ctx) => {
    await sendStats(ctx);
  });

  // Callback Queries (Buttons)
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;

    try {
      if (data === 'action_stats') {
        await ctx.answerCallbackQuery();
        await sendStats(ctx);
      } else if (data === 'action_list') {
        await ctx.answerCallbackQuery();
        await sendLinkList(ctx, 1);
      } else if (data === 'action_backup') {
        const api = getSinkApi();
        await api.triggerBackup();
        await ctx.answerCallbackQuery({ text: '✅ Backup triggered successfully!', show_alert: true });
      } else if (data.startsWith('delete_')) {
        const slug = data.replace('delete_', '');
        const keyboard = new InlineKeyboard()
          .text('✅ Yes, delete it', `confirm_delete_${slug}`)
          .text('❌ Cancel', 'cancel_delete');
        await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      } else if (data.startsWith('confirm_delete_')) {
        const slug = data.replace('confirm_delete_', '');
        const api = getSinkApi();
        await api.deleteLink(slug);
        await ctx.editMessageText(`✅ Link \`${slug}\` deleted successfully.`, { parse_mode: 'Markdown' });
      } else if (data === 'cancel_delete') {
        await ctx.editMessageText('❌ Deletion cancelled.');
      } else if (data.startsWith('list_page_')) {
        const page = parseInt(data.replace('list_page_', ''), 10);
        await sendLinkList(ctx, page, true);
      } else {
        await ctx.answerCallbackQuery();
      }
    } catch (e) {
      await ctx.answerCallbackQuery({ text: `❌ Error: ${e.message}`, show_alert: true });
    }
  });

  async function sendStats(ctx) {
    const api = getSinkApi();
    const counters = await api.getCounters();
    
    const text = `📊 **Sink Statistics:**\n\n` +
                 `🔗 Total Links: **${counters.links || 0}**\n` +
                 `👀 Total Clicks: **${counters.clicks || 0}**\n` +
                 `🌍 Unique Visitors: **${counters.uniqueVisitors || 0}**\n`;
                 
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(text, { parse_mode: 'Markdown' });
    }
  }

  async function sendLinkList(ctx, page, isEdit = false) {
    const api = getSinkApi();
    const limit = 5;
    const res = await api.listLinks(page, limit);
    // Depending on Sink's exact response structure (e.g. { links: [...], total: ... } or just array)
    const links = Array.isArray(res) ? res : res.links || res.records || [];
    const total = res.total || links.length; // Approximate if no total is given

    if (links.length === 0) {
      const text = page === 1 ? '📭 No links found.' : '📭 No more links.';
      if (isEdit) await ctx.editMessageText(text);
      else await ctx.reply(text);
      return;
    }

    let text = `📋 **Links (Page ${page}):**\n\n`;
    links.forEach(link => {
      text += `🏷 \`${link.slug}\` -> [Target](${link.url})\n`;
    });

    const keyboard = new InlineKeyboard();
    if (page > 1) {
      keyboard.text('⬅️ Prev', `list_page_${page - 1}`);
    }
    // Very basic pagination check, assuming if we get `limit` items there might be more
    if (links.length === limit) {
      keyboard.text('Next ➡️', `list_page_${page + 1}`);
    }

    if (isEdit) {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard, disable_web_page_preview: true });
    } else {
      await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard, disable_web_page_preview: true });
    }
  }

  return bot;
}
