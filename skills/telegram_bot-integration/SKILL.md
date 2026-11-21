---
name: telegram_bot-integration
description: Production-grade 2-way Telegram Bot back-office integration, webhook handlers, interactive inline keyboards, in-place message state updates, and secure database sync for Next.js 15.
---

# Telegram Bot Integration: 2-Way Serverless Back-Office

This skill provides architectural patterns, security standards, and implementation guides for using Telegram as an **instant, zero-cost, mobile-first two-way back-office** in Next.js 15+ applications.

---

## 1. Architectural Vision: Telegram as a Serverless Admin UI

Instead of building, hosting, and securing a complex custom admin dashboard for operations (approvals, order processing, booking confirmations, lead dispatch):

```mermaid
flowchart LR
    subgraph WebApp["Next.js 15 Application"]
        Form["User Submits Form / Order"]
        Webhook["POST /api/telegram/webhook"]
        Cache["revalidatePath('/dashboard')"]
    end

    subgraph Database["Database (Supabase / PostgreSQL)"]
        DB[("Orders / Bookings Table")]
    end

    subgraph TelegramCloud["Telegram Cloud Infrastructure ($0/mo)"]
        Bot["Telegram Bot API"]
        Group["Operator / Manager Chat Group"]
    end

    Form -->|1. Insert Record| DB
    Form -->|2. Send Interactive Card| Bot
    Bot -->|3. Push Notification + Inline Buttons| Group
    Group -->|4. Manager clicks [Approve / Cancel]| Bot
    Bot -->|5. HTTP Webhook Event| Webhook
    Webhook -->|6. Admin Client Updates Status| DB
    Webhook -->|7. editMessageText (Freeze Card)| Bot
    Webhook -->|8. Revalidate Frontend| Cache
```

### Key Advantages:
1. **$0 / Month:** Free push notifications, free global delivery, unlimited messages within API limits.
2. **Mobile Native:** Managers and staff receive instant notifications on iOS/Android/Desktop with zero custom mobile app development.
3. **Idempotency by Design:** Updating the Telegram message in-place (`editMessageText`) replaces actionable buttons with a static audit trail (e.g. `Approved by @jane at 14:30`), permanently preventing double-clicks and race conditions.

---

## 2. Environment Variables & Bot Setup

### Telegram Bot Setup
1. Create a bot with [@BotFather](https://t.me/BotFather) and obtain the `TELEGRAM_BOT_TOKEN`.
2. Create a group for managers/coordinators, invite your bot, and obtain the `TELEGRAM_CHAT_ID` (e.g. negative numbers for groups like `-100123456789`).
3. Generate a strong random string for `TELEGRAM_WEBHOOK_SECRET`.

### Scoped Configuration (`.env`)
```env
# Server-only (Never prefix with NEXT_PUBLIC_)
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ
TELEGRAM_CHAT_ID=-1001234567890
TELEGRAM_WEBHOOK_SECRET=your_super_secret_alphanumeric_string_32chars
```

> [!TIP]
> **Multiple Chat Routing:** Support comma-separated IDs in `TELEGRAM_CHAT_ID` (e.g. `8160938065, -100123456789`) so notifications can reach both a central group and backup manager concurrently.

---

### Pre-BotFather Testing with Universal Telegram Mock MCP

You do NOT need to wait for human BotFather credentials or public ngrok tunnels to test your webhook handler! The `5star-sanity-stack` plugin provides the `telegram-mock` MCP server with universal preset scenarios and in-memory message emulation:
- `telegram_scenario_new_booking({ clientName, clientPhone, serviceOrNotes })`: Creates an active client card in the manager group with interactive action buttons.
- `telegram_scenario_manager_confirm({ leadId, managerName })`: Dispatches a `confirm` callback query to your Next.js webhook, transitions the card to `🟢 CONFIRMED`, attributes the action to the manager, and freezes the buttons.
- `telegram_scenario_manager_cancel({ leadId, managerName, reason })`: Dispatches a `cancel` callback query, transitions to `🔴 CANCELLED`, and records the cancellation reason.
- `telegram_get_card_preview({ leadId })`: Renders the live ASCII/Telegram message card preview reflecting real-time state changes.
- `telegram_simulate_message({ text, userName, chatId })`: Dispatches raw direct client text messages (`/start`, etc.).
- `telegram_simulate_button_click({ callbackData, messageId })`: Dispatches arbitrary raw `callback_query` updates.
- `telegram_check_webhook({ webhookUrl })`: Pings your local Next.js webhook route with development mock headers.

#### Testing & Debugging with MCP Inspector

You can inspect, interact with, and verify the mock server visually using the official `@modelcontextprotocol/inspector`:

##### Copy-Pasteable CLI Commands:
```bash
# Recommended: node with $HOME
npx -y @modelcontextprotocol/inspector node "$HOME/.gemini/config/plugins/5star-sanity-stack/mcp/telegram-mock/index.mjs"

# Or direct executable:
npx -y @modelcontextprotocol/inspector "$HOME/.gemini/config/plugins/5star-sanity-stack/mcp/telegram-mock/index.mjs"
```

> [!WARNING]
> **Do NOT Use Bare `~` in Inspector Commands:**  
> `child_process.spawn()` (used internally by MCP Inspector) does NOT invoke a shell to expand `~`. Using `~` causes Node to search for a literal directory named `~` in `process.cwd()` and fails with `MODULE_NOT_FOUND`. Always use `"$HOME/..."` or full absolute paths.

##### MCP Inspector v2 Authentication Note
Inspector v2 generates a tokenized URL with a session authentication token (e.g. `http://127.0.0.1:XXXX?MCP_INSPECTOR_API_TOKEN=...`). Always open that exact URL from terminal output to avoid "Failed to fetch" errors.

##### 1-Click Preset Scenarios & In-Place State Verification
The `telegram-mock` server enables end-to-end webhook verification in the Inspector UI:
1. Run **`telegram_scenario_new_booking`** to create an initial simulated booking message with interactive action buttons (`[✅ Підтвердити] [❌ Скасувати]`).
2. Run **`telegram_scenario_manager_confirm`** or **`telegram_scenario_manager_cancel`** to dispatch an authentic `callback_query` payload to your local Next.js webhook endpoint.
3. Call **`telegram_get_card_preview`** to observe how the rendered ASCII card reflects in-place updates: the status updates to `🟢 CONFIRMED` or `🔴 CANCELLED`, the acting manager's name and timestamp are recorded, and interactive buttons are frozen/removed, mirroring Telegram's `editMessageText` behavior.

---

## 3. Outbound Notification Service

Create a dedicated bot utility module:

```typescript
// src/lib/telegram/bot.ts

export interface TelegramInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramInlineKeyboard {
  inline_keyboard: TelegramInlineButton[][];
}

/**
 * Escapes special HTML characters for Telegram HTML parsing.
 */
export function escapeHtml(text: string = ''): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sends a notification with interactive buttons to all configured chats.
 */
export async function sendInteractiveNotification(params: {
  id: string;
  title: string;
  fields: Record<string, string>;
  directPhone?: string;
}): Promise<{ success: boolean; messageId?: number; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const rawChats = process.env.TELEGRAM_CHAT_ID;

  if (!token || !rawChats) {
    console.warn('[Telegram Bot] Credentials not configured. Skipping notification.');
    return { success: false, error: 'Credentials missing' };
  }

  const chatIds = rawChats.split(',').map((id) => id.trim()).filter(Boolean);

  let message = `📦 <b>${escapeHtml(params.title)}</b>\n\n`;
  for (const [key, val] of Object.entries(params.fields)) {
    message += `• <b>${escapeHtml(key)}:</b> ${escapeHtml(val)}\n`;
  }
  message += `\nСтатус: 🟡 <b>Очікує обробки</b>`;

  const cleanPhone = params.directPhone?.replace(/\D/g, '');

  const replyMarkup: TelegramInlineKeyboard = {
    inline_keyboard: [
      [
        { text: '✅ Підтвердити', callback_data: `confirm:${params.id}` },
        { text: '❌ Скасувати', callback_data: `cancel:${params.id}` },
      ],
      ...(cleanPhone
        ? [
            [
              {
                text: `💬 Написати клієнту (+${cleanPhone})`,
                url: `https://t.me/+${cleanPhone}`,
              },
            ],
          ]
        : []),
    ],
  };

  try {
    const promises = chatIds.map(async (chatId) => {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        }),
      });
      return res.json();
    });

    const results = await Promise.allSettled(promises);
    const success = results.find(
      (r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value?.ok
    );

    return {
      success: !!success,
      messageId: success?.value?.result?.message_id,
    };
  } catch (err: any) {
    console.error('[sendInteractiveNotification error]:', err);
    return { success: false, error: err?.message };
  }
}
```

---

## 4. Inbound Interactive Webhook Handler

Implement the POST webhook route in Next.js 15 App Router:

```typescript
// src/app/api/telegram/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate the incoming request using Telegram's secret token header
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret) {
      const headerSecret = req.headers.get('x-telegram-bot-api-secret-token');
      if (headerSecret !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const update = await req.json();

    // 2. Process inline button clicks (callback_query)
    if (update.callback_query) {
      const { id: callbackId, data, from, message } = update.callback_query;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      if (!data) return NextResponse.json({ ok: true });

      const [action, recordId] = data.split(':');
      const isConfirm = action === 'confirm' || action === 'approve';
      const targetStatus = isConfirm ? 'confirmed' : 'cancelled';

      // 3. Update database using Admin Client (bypassing RLS for back-office action)
      const admin = createAdminClient();
      const { error } = await admin
        .from('orders')
        .update({ status: targetStatus })
        .eq('id', recordId);

      if (error) {
        // Send alert toast in Telegram UI
        await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callbackId,
            text: `Помилка: ${error.message}`,
            show_alert: true,
          }),
        });
        return NextResponse.json({ ok: true });
      }

      // 4. Acknowledge callback immediately (stops loading spinner on client button)
      await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackId,
          text: isConfirm ? '✅ Підтверджено!' : '❌ Скасовано!',
        }),
      });

      // 5. In-place message edit: freeze the card and remove action buttons (Idempotency)
      if (message) {
        const actor = from.first_name || 'Менеджер';
        const time = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
        const badge = isConfirm
          ? `Статус: 🟢 <b>ПІДТВЕРДЖЕНО</b> (підтвердив(ла) ${actor} о ${time})`
          : `Статус: 🔴 <b>СКАСОВАНО</b> (скасував(ла) ${actor} о ${time})`;

        const updatedText = message.text.replace(
          /Статус: 🟡 <b>Очікує обробки<\/b>/g,
          badge
        );

        await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: message.chat.id,
            message_id: message.message_id,
            text: updatedText,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [] }, // Remove action buttons
          }),
        });
      }

      // 6. Revalidate frontend paths so client UI updates on next visit
      revalidatePath('/dashboard');
      revalidatePath('/cabinet');
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[Telegram Webhook Error]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

---

## 5. Deployment & Webhook Registration

### Production Registration
Once your Next.js application is deployed to production:
```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourdomain.com/api/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["callback_query", "message"]
  }'
```

### Inspecting Webhook Status
```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

### Local Development Options
1. **Cloudflare Tunnel / ngrok (Recommended):**  
   Run `cloudflared tunnel --url http://localhost:3000` and register the temporary tunnel URL as the webhook.
2. **Local Long-Polling Bridge Script:**  
   Write a lightweight Node.js script that calls `getUpdates` from Telegram and forwards events to `http://localhost:3000/api/telegram/webhook`. (Note: always delete the webhook via `deleteWebhook` before running local polling).

---

## 6. Security & Operational Checklist

- [ ] **Secret Token Header:** Always validate `x-telegram-bot-api-secret-token` in the webhook route handler.
- [ ] **HTML Escaping:** Run all user-supplied input through `escapeHtml()` before interpolating into HTML messages to avoid Telegram parse errors.
- [ ] **Admin Client Scoping:** Only use the elevated `createAdminClient()` inside authenticated webhook handlers; never export or use it in client components.
- [ ] **Instant ACK:** Always call `answerCallbackQuery` within 3 seconds, or Telegram will show an error indicator to the user.
- [ ] **Audit Trail:** Record the Telegram user's name/ID in database notes or metadata when actions are taken for full traceability.
