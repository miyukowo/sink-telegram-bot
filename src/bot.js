import { Bot, InlineKeyboard } from 'grammy';
import { SinkAPI } from './sink.js';

function parseFlags(argsStr) {
  const args = argsStr.match(/(?:[^\s"']+|["'][^"']*["'])+/g) || [];
  const flags = {};
  let currentKey = null;
  const nonFlags = [];

  for (const arg of args) {
    if (arg.startsWith('--')) {
      currentKey = arg.slice(2);
      flags[currentKey] = true; // Default to true for boolean flags
    } else if (currentKey) {
      let val = arg.replace(/^["']|["']$/g, '');
      if (val === 'false') val = false;
      if (val === 'true') val = true;
      if (!isNaN(val) && val.trim() !== '') val = Number(val);
      
      if (flags[currentKey] === true) {
        flags[currentKey] = val;
      } else {
        flags[currentKey] += ` ${val}`;
      }
      currentKey = null; // Reset to expect next flag
    } else {
      nonFlags.push(arg.replace(/^["']|["']$/g, ''));
    }
  }

  // Group geo fields
  const payload = {};
  for (const key in flags) {
    if (key.startsWith('geo.')) {
      if (!payload.geo) payload.geo = {};
      payload.geo[key.split('.')[1].toUpperCase()] = flags[key];
    } else {
      payload[key] = flags[key];
    }
  }
  return { payload, nonFlags };
}

// No conversational bot due to KV eventual consistency limitations.
export function createBot(token, env) {
  const bot = new Bot(token);

  bot.use(async (ctx, next) => {
    ctx.env = env; // Attach env to context for conversations
    const allowedUsersStr = env.ALLOWED_USER_IDS || '';
    const allowedUsers = allowedUsersStr.split(',').map(u => u.trim()).filter(Boolean);
    if (allowedUsers.length > 0) {
      const userId = ctx.from?.id.toString();
      if (!userId || !allowedUsers.includes(userId)) return;
    }
    await next();
  });

  // Session middleware removed.

  const getApi = () => new SinkAPI(env.SINK_API_URL, env.SINK_API_TOKEN);

  bot.catch((err) => {
    console.error(err.error);
    err.ctx.reply(`❌ Error: ${err.error.message || err.error}`).catch(() => {});
  });

  // Menu configuration
  const getMenuKeyboard = () => new InlineKeyboard()
    .text('📊 Stats', 'action_stats')
    .text('📋 List Links', 'action_list')
    .row()
    .text('💾 Backup KV', 'action_backup');

  const menuText = `👋 Welcome to Sink Bot V2!\n\n` +
    `*⚡️ Create Link:*\n` +
    `\`/create <url>\`\n` +
    `\`/create <url> --slug <custom-slug>\`\n` +
    `\`/create <url> --password <secret>\`\n\n` +
    `*📝 Manage Links:*\n` +
    `✏️ \`/edit <slug> <new-url> [--password 123]\`\n` +
    `♻️ \`/upsert <slug> <url>\`\n` +
    `🔍 \`/query <slug>\` - Get details\n` +
    `🔎 \`/search <text>\`\n` +
    `🗑 \`/delete <slug>\`\n\n` +
    `*📊 Advanced:*\n` +
    `/metrics, /events, /export, /import`;

  // Welcome
  bot.command('start', async (ctx) => {
    // Tự động cài đặt Menu cho bot (bỏ ctx.waitUntil vì không chạy ngầm được ở đây)
    ctx.api.setMyCommands([
      { command: 'start', description: 'Show main menu' },
      { command: 'create', description: 'Create a new short link' },
      { command: 'edit', description: 'Edit an existing link' },
      { command: 'upsert', description: 'Create or edit link' },
      { command: 'query', description: 'Get link details' },
      { command: 'search', description: 'Search links' },
      { command: 'delete', description: 'Delete link' },
      { command: 'list', description: 'List recent links' },
      { command: 'stats', description: 'Show stats metrics' },
      { command: 'events', description: 'Show recent events logs' },
    ]).catch(console.error);

    await ctx.reply(menuText, { reply_markup: getMenuKeyboard(), parse_mode: 'Markdown' });
  });

  const handleLinkAction = async (ctx, actionName, actionMethod) => {
    const match = ctx.match.trim();
    if (!match) return ctx.reply(`❌ Usage: /${actionName} <url or slug depending on command> [--flags]`);
    
    const { payload, nonFlags } = parseFlags(match);
    
    if (actionName === 'create') {
      payload.url = nonFlags[0];
      if (nonFlags[1] && !payload.slug) payload.slug = nonFlags[1];
    } else {
      payload.slug = nonFlags[0];
      if (nonFlags[1]) payload.url = nonFlags[1];
    }

    if (!payload.url && actionName !== 'edit') return ctx.reply("❌ Target URL is required.");

    const msg = await ctx.reply('⏳ Processing...');
    try {
      const res = await getApi()[actionMethod](payload);
      const link = res.link || res;
      await ctx.api.editMessageText(ctx.chat.id, msg.message_id, `✅ *Success!*\n\n🔗 Short: ${env.SINK_API_URL}/${link.slug}\n🎯 Target: ${link.url}`, { parse_mode: 'Markdown' });
    } catch (e) {
      await ctx.api.editMessageText(ctx.chat.id, msg.message_id, `❌ Failed: ${e.message}`);
    }
  };

  bot.command('create', (ctx) => handleLinkAction(ctx, 'create', 'createLink'));
  bot.command('edit', (ctx) => handleLinkAction(ctx, 'edit', 'editLink'));
  bot.command('upsert', (ctx) => handleLinkAction(ctx, 'upsert', 'upsertLink'));

  bot.command('query', async (ctx) => {
    const slug = ctx.match.trim();
    if (!slug) return ctx.reply('❌ Usage: /query <slug>');
    try {
      const res = await getApi().queryLink(slug);
      const link = res.link || res;
      await ctx.reply(`🔍 *Details:*\nSlug: \`${link.slug}\`\nTarget: ${link.url}\nComment: ${link.comment || '-'}`, { parse_mode: 'Markdown' });
    } catch (e) { await ctx.reply(`❌ Failed: ${e.message}`); }
  });

  bot.command('search', async (ctx) => {
    const q = ctx.match.trim();
    if (!q) return ctx.reply('❌ Usage: /search <text>');
    try {
      const res = await getApi().searchLinks(q);
      const links = res.links || res || [];
      if (!links.length) return ctx.reply('📭 No results.');
      const text = links.map(l => `🏷 \`${l.slug}\` -> ${l.url}`).join('\n');
      await ctx.reply(`🔎 *Search Results:*\n\n${text}`, { parse_mode: 'Markdown', disable_web_page_preview: true });
    } catch (e) { await ctx.reply(`❌ Failed: ${e.message}`); }
  });

  bot.command('delete', async (ctx) => {
    const slug = ctx.match.trim();
    if (!slug) return ctx.reply('❌ Usage: /delete <slug>');
    const keyboard = new InlineKeyboard()
      .text('✅ Yes', `confirm_delete_${slug}`)
      .text('❌ Cancel', 'cancel_delete');
    await ctx.reply(`Delete \`${slug}\`?`, { parse_mode: 'Markdown', reply_markup: keyboard });
  });

  // Analytics & Logs
  const handleMetrics = async (ctx) => {
    const dim = ctx.match.trim() || 'os';
    try {
      const res = await getApi().getMetrics(dim);
      let text = `📊 *Metrics (${dim}):*\n`;
      (res.metrics || res).slice(0, 15).forEach(m => { text += `- ${m.element}: ${m.views}\n`; });
      await ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (e) { await ctx.reply(`❌ Failed: ${e.message}`); }
  };
  bot.command('metrics', handleMetrics);
  bot.command('stats', handleMetrics); // Alias

  const handleList = async (ctx) => {
    try {
      const res = await getApi().listLinks(1, 10);
      const links = Array.isArray(res) ? res : res.links || res.records || [];
      const keyboard = new InlineKeyboard().text('⬅️ Back to Menu', 'action_menu');
      
      if (!links.length) {
        if (ctx.callbackQuery) return ctx.editMessageText('📭 No links found.', { reply_markup: keyboard });
        return ctx.reply('📭 No links found.', { reply_markup: keyboard });
      }
      
      const text = links.map(l => `🏷 \`${l.slug}\` -> ${l.url}`).join('\n');
      const opt = { parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: keyboard };
      
      if (ctx.callbackQuery) await ctx.editMessageText(`📋 *Recent Links:*\n\n${text}`, opt);
      else await ctx.reply(`📋 *Recent Links:*\n\n${text}`, opt);
    } catch (e) { 
      if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: `❌ Failed: ${e.message}`, show_alert: true });
      else await ctx.reply(`❌ Failed: ${e.message}`); 
    }
  };
  bot.command('list', handleList);
  bot.command('lists', handleList); // Alias

  bot.command('testkv', async (ctx) => {
    if (!env.BOT_SESSIONS || typeof env.BOT_SESSIONS.put !== 'function') {
      return ctx.reply("❌ KV BOT_SESSIONS is not configured correctly.");
    }
    try {
      await env.BOT_SESSIONS.put('test_key', 'it works', { expirationTtl: 60 });
      const val = await env.BOT_SESSIONS.get('test_key');
      await ctx.reply(`✅ KV Test successful! Read value: ${val}`);
    } catch (e) {
      await ctx.reply(`❌ KV Test failed: ${e.message}`);
    }
  });

  bot.command('events', async (ctx) => {
    try {
      const res = await getApi().getEvents();
      let text = `⚡️ *Recent Events:*\n`;
      (res.events || res).slice(0, 10).forEach(e => { text += `- \`${e.slug}\`: ${e.browser} on ${e.os}\n`; });
      await ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (e) { await ctx.reply(`❌ Failed: ${e.message}`); }
  });

  bot.command('export', async (ctx) => {
    try {
      const msg = await ctx.reply('⏳ Exporting links...');
      const res = await getApi().exportLinks();
      // Send as file
      const buffer = Buffer.from(JSON.stringify(res, null, 2), 'utf-8');
      await ctx.replyWithDocument({
        source: buffer,
        filename: `sink_export_${Date.now()}.json`
      });
      await ctx.api.deleteMessage(ctx.chat.id, msg.message_id).catch(()=>{});
    } catch (e) { await ctx.reply(`❌ Failed: ${e.message}`); }
  });

  bot.command('stats_export', async (ctx) => {
    try {
      const msg = await ctx.reply('⏳ Exporting stats...');
      const now = Math.floor(Date.now() / 1000);
      const res = await getApi().exportStats(now - 86400 * 30, now);
      const buffer = Buffer.from(res, 'utf-8');
      await ctx.replyWithDocument({
        source: buffer,
        filename: `stats_${Date.now()}.csv`
      });
      await ctx.api.deleteMessage(ctx.chat.id, msg.message_id).catch(()=>{});
    } catch (e) { await ctx.reply(`❌ Failed: ${e.message}`); }
  });

  bot.on('message:document', async (ctx) => {
    // Basic import handle
    if (ctx.message.caption === '/import') {
      try {
        const file = await ctx.getFile();
        const url = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        const response = await fetch(url);
        const data = await response.json();
        
        const msg = await ctx.reply('⏳ Importing...');
        const res = await getApi().importLinks(data);
        await ctx.api.editMessageText(ctx.chat.id, msg.message_id, `✅ *Import Complete!*\nInserted: ${res.inserted || 'N/A'}`, { parse_mode: 'Markdown' });
      } catch (e) { await ctx.reply(`❌ Failed: ${e.message}`); }
    }
  });

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    try {
      if (data === 'action_menu') {
        await ctx.editMessageText(menuText, { reply_markup: getMenuKeyboard(), parse_mode: 'Markdown' });
      } else if (data === 'action_stats') {
        const counters = await getApi().getCounters();
        const keyboard = new InlineKeyboard().text('⬅️ Back to Menu', 'action_menu');
        await ctx.editMessageText(`📊 *Sink Statistics:*\n🔗 Links: ${counters.links || 0}\n👀 Clicks: ${counters.clicks || 0}\n🌍 Visitors: ${counters.uniqueVisitors || 0}`, { parse_mode: 'Markdown', reply_markup: keyboard });
      } else if (data === 'action_list') {
        await handleList(ctx);
      } else if (data === 'action_backup') {
        await getApi().triggerBackup();
        await ctx.answerCallbackQuery({ text: '✅ Backup triggered!', show_alert: true });
      } else if (data.startsWith('confirm_delete_')) {
        const slug = data.replace('confirm_delete_', '');
        await getApi().deleteLink(slug);
        const keyboard = new InlineKeyboard().text('⬅️ Back to Menu', 'action_menu');
        await ctx.editMessageText(`✅ Deleted \`${slug}\``, { parse_mode: 'Markdown', reply_markup: keyboard });
      } else if (data === 'cancel_delete') {
        const keyboard = new InlineKeyboard().text('⬅️ Back to Menu', 'action_menu');
        await ctx.editMessageText('❌ Cancelled.', { reply_markup: keyboard });
      } else {
        await ctx.answerCallbackQuery();
      }
    } catch (e) { await ctx.answerCallbackQuery({ text: `❌ Error: ${e.message}`, show_alert: true }); }
  });

  bot.on('message', async (ctx) => {
    // Catch-all to detect if conversations are failing to intercept messages
    await ctx.reply("Lỗi: Bot không hiểu lệnh này (hoặc phiên chat đã bị huỷ do Cloudflare KV lưu không kịp).\nVui lòng gõ lại /start để bắt đầu lại, hoặc dùng lệnh 1 dòng (ví dụ /create https://google.com).");
  });

  return bot;
}
