# Sink Telegram Bot V2

A lightning-fast, serverless Telegram Bot designed to interact seamlessly with your [Sink](https://github.com/ccbikai/sink) URL shortener directly from your chat.

Built to run entirely on **Cloudflare Workers**, offering zero-maintenance and global low-latency performance.

## ✨ Features

- **⚡️ Blazing Fast 1-Line Commands:** Create, edit, and upsert short links in milliseconds using professional CLI-style flags.
- **🛡 Secure & Private:** Only authorized users (configured via User IDs) can interact with the bot.
- **📱 Inline Menus:** Beautiful interactive buttons to check statistics and list recent links.
- **📊 Advanced Analytics:** View metrics, click counters, unique visitors, and real-time events directly in chat.
- **⚙️ Full Flag Support:** Customize your links with custom slugs, passwords, expirations, Geo-routing, iOS/Android specific redirects, and OpenGraph metadata natively.
- **☁️ 100% Serverless:** Runs statelessly on Cloudflare Workers. No databases to maintain, no session sync issues!

## 🚀 Quick Start & Deployment

### 1. Prerequisites
- A Cloudflare account
- A running instance of [Sink](https://github.com/ccbikai/sink)
- A Telegram Bot Token (from [@BotFather](https://t.me/botfather))

### 2. Clone & Install
```bash
git clone https://github.com/miyukowo/sink-telegram-bot.git
cd sink-telegram-bot
npm install
```

### 3. Configure `wrangler.toml`
Rename or edit the `wrangler.toml` file in the root directory to configure your bot:

```toml
name = "sink-telegram-bot"
main = "src/index.js"
compatibility_date = "2024-05-24"

[vars]
SINK_API_URL = "https://your-sink-domain.com"
ALLOWED_USER_IDS = "123456789,987654321" # Your Telegram User ID
# (Optional) You can put secrets here, or use wrangler secret put
```

### 4. Setup Secrets
It is highly recommended to store your sensitive tokens securely using Cloudflare Secrets rather than plaintext in `wrangler.toml`.

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
# Paste your Bot Token

npx wrangler secret put SINK_API_TOKEN
# Paste your Sink API Token
```

### 5. Deploy to Cloudflare
Deploy your worker using wrangler:
```bash
npx wrangler deploy
```

Once deployed, Cloudflare will output a URL like `https://sink-telegram-bot.your-subdomain.workers.dev`.

### 6. Set Webhook
Tell Telegram to send incoming messages to your newly deployed Cloudflare Worker. Open your browser or run a `curl` command to this URL:

```text
https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<YOUR_WORKER_URL>/webhook
```
*(Make sure to replace `<YOUR_TELEGRAM_BOT_TOKEN>` and `<YOUR_WORKER_URL>` with your actual values)*

## 📖 Usage Guide

Type `/start` in the chat to automatically initialize the bot menu.

### Create a link
```text
/create https://google.com
/create https://google.com --slug gg
/create https://google.com --password secret123
```

### Edit a link
```text
/edit gg https://yahoo.com --cloaking true
/edit gg --cloaking false  # Auto-fetches existing URL
```

### Supported Flags
- `--slug "alias"`
- `--password "123"`
- `--comment "My note"`
- `--expiration 1718000000` (Unix timestamp)
- `--apple "https://apps.apple.com/..."` (iOS routing)
- `--google "https://play.google.com/..."` (Android routing)
- `--geo.US "https://us.example.com"` (Geo routing)
- `--title "My Site"` (OpenGraph)
- `--description "Desc"`
- `--image "https://img.url"`
- `--cloaking true`
- `--redirectWithQuery true`

## 🛠 Advanced Management
- `/query <slug>` - Get link details
- `/search <text>` - Search your links
- `/delete <slug>` - Delete a link
- `/list` - List your 10 most recent links
- `/metrics` - View OS, Browser, and Device analytics
- `/events` - View real-time click events
- `/export` - Download all links as JSON
- `/stats_export` - Download all analytics as CSV

---
*Built with ❤️ using grammY and Cloudflare Workers.*
