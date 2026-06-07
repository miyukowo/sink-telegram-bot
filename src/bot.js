import { Bot, InlineKeyboard, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { SinkAPI } from './sink.js';
import { KvAdapter } from './kv-adapter.js';

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

// Conversation Builder
async function createLinkConversation(conversation, ctx) {
  await ctx.reply("Let's create a link! First, what is the target URL?");
  const urlCtx = await conversation.wait();
  const url = urlCtx.message?.text;
  if (!url) return ctx.reply("Action cancelled.");

  await ctx.reply("Do you want a custom slug? (Type the slug, or 'skip' to auto-generate)");
  const slugCtx = await conversation.wait();
  const slugInput = slugCtx.message?.text;
  const slug = slugInput.toLowerCase() !== 'skip' ? slugInput : undefined;

  await ctx.reply("Any comment/note for this link? (Type note, or 'skip')");
  const commentCtx = await conversation.wait();
  const commentInput = commentCtx.message?.text;
  const comment = commentInput.toLowerCase() !== 'skip' ? commentInput : undefined;

  await ctx.reply("Do you want to add a password? (Type password, or 'skip')");
  const pwdCtx = await conversation.wait();
  const pwdInput = pwdCtx.message?.text;
  const password = pwdInput.toLowerCase() !== 'skip' ? pwdInput : undefined;

  const payload = { url, slug, comment, password };

  const msg = await ctx.reply('⏳ Creating link...');
  try {
    const api = new SinkAPI(ctx.env.SINK_API_URL, ctx.env.SINK_API_TOKEN);
    const res = await api.createLink(payload);
    const link = res.link || res;
    await ctx.api.editMessageText(ctx.chat.id, msg.message_id, `✅ **Link Created!**\n\n🔗 Short: ${ctx.env.SINK_API_URL}/${link.slug}\n🎯 Target: ${link.url}`, { parse_mode: 'Markdown' });
  } catch (e) {
    await ctx.api.editMessageText(ctx.chat.id, msg.message_id, `❌ Failed: ${e.message}`);
  }
}

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

  if (env.BOT_SESSIONS) {
    bot.use(session({
      initial: () => ({}),
      storage: new KvAdapter(env.BOT_SESSIONS)
    }));
    bot.use(conversations());
    bot.use(createConversation(createLinkConversation, 'create_chat'));
  }

  const getApi = () => new SinkAPI(env.SINK_API_URL, env.SINK_API_TOKEN);

  bot.catch((err) => {
    console.error(err.error);
    err.ctx.reply(`❌ Error: ${err.error.message || err.error}`).catch(() => {});
  });

  // Welcome
  bot.command('start', async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text('📊 Stats', 'action_stats')
      .text('📋 List Links', 'action_list')
      .row()
      .text('💾 Backup KV', 'action_backup');
      
    await ctx.reply(
      `👋 Welcome to Sink Bot V2!\n\n` +
      `Commands:\n` +
      `➕ /create_chat - Create link step-by-step\n` +
      `➕ /create <url> [--slug xyz] [--password 123]\n` +
      `✏️ /edit <slug> <url> [--password 123]\n` +
      `♻️ /upsert <slug> <url>\n` +
      `🔍 /query <slug> - Get details\n` +
      `🔎 /search <text>\n` +
      `🗑 /delete <slug>\n\n` +
      `**Advanced:**\n` +
      `/metrics, /views, /events, /locations, /export, /import`,
      { reply_markup: keyboard }
    );
  });

  bot.command('create_chat', async (ctx) => {
    if (!env.BOT_SESSIONS) return ctx.reply("❌ KV binding `BOT_SESSIONS` is not configured.");
    await ctx.conversation.enter('create_chat');
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
      await ctx.api.editMessageText(ctx.chat.id, msg.message_id, `✅ **Success!**\n\n🔗 Short: ${env.SINK_API_URL}/${link.slug}\n🎯 Target: ${link.url}`, { parse_mode: 'Markdown' });
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
      await ctx.reply(`🔍 **Details:**\nSlug: \`${link.slug}\`\nTarget: ${link.url}\nComment: ${link.comment || '-'}`, { parse_mode: 'Markdown' });
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
      await ctx.reply(`🔎 **Search Results:**\n\n${text}`, { parse_mode: 'Markdown', disable_web_page_preview: true });
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
  bot.command('metrics', async (ctx) => {
    const dim = ctx.match.trim() || 'os';
    try {
      const res = await getApi().getMetrics(dim);
      let text = `📊 **Metrics (${dim}):**\n`;
      (res.metrics || res).slice(0, 15).forEach(m => { text += `- ${m.element}: ${m.views}\n`; });
      await ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (e) { await ctx.reply(`❌ Failed: ${e.message}`); }
  });

  bot.command('events', async (ctx) => {
    try {
      const res = await getApi().getEvents();
      let text = `⚡️ **Recent Events:**\n`;
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
        await ctx.api.editMessageText(ctx.chat.id, msg.message_id, `✅ **Import Complete!**\nInserted: ${res.inserted || 'N/A'}`);
      } catch (e) { await ctx.reply(`❌ Failed: ${e.message}`); }
    }
  });

  // Callbacks for inline menus
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    try {
      if (data === 'action_stats') {
        const counters = await getApi().getCounters();
        await ctx.editMessageText(`📊 **Sink Statistics:**\n🔗 Links: ${counters.links || 0}\n👀 Clicks: ${counters.clicks || 0}\n🌍 Visitors: ${counters.uniqueVisitors || 0}`, { parse_mode: 'Markdown' });
      } else if (data === 'action_backup') {
        await getApi().triggerBackup();
        await ctx.answerCallbackQuery({ text: '✅ Backup triggered!', show_alert: true });
      } else if (data.startsWith('confirm_delete_')) {
        const slug = data.replace('confirm_delete_', '');
        await getApi().deleteLink(slug);
        await ctx.editMessageText(`✅ Deleted \`${slug}\``, { parse_mode: 'Markdown' });
      } else if (data === 'cancel_delete') {
        await ctx.editMessageText('❌ Cancelled.');
      } else {
        await ctx.answerCallbackQuery();
      }
    } catch (e) { await ctx.answerCallbackQuery({ text: `❌ Error: ${e.message}`, show_alert: true }); }
  });

  return bot;
}
