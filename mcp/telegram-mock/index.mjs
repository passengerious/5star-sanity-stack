#!/usr/bin/env node

/**
 * Universal Telegram Mock MCP Server (Zero-Dependency Stdio Transport)
 * Part of the 5-Star Sanity + Next.js App Router Stack.
 *
 * Exposes interactive tools and preset scenarios to simulate Telegram Bot interactions:
 * - Inbound client messages and booking form leads
 * - Manager interactive inline button actions (confirm/cancel)
 * - In-memory client card emulator reflecting in-place Telegram message updates
 * - Local webhook delivery without requiring BotFather tokens or public HTTPS tunnels
 */

import readline from 'node:readline';

// ── In-Memory Telegram Card Store ───────────────────────────────────────────
const simulatedCards = new Map();
let lastActiveLeadId = 'lead_101';

// Seed initial demo card
simulatedCards.set('lead_101', {
  leadId: 'lead_101',
  messageId: 42,
  chatId: 10001,
  clientName: 'Олександр Коваленко',
  clientPhone: '+380501234567',
  serviceOrNotes: 'Консультація та підбір послуг',
  status: 'new', // 'new' | 'confirmed' | 'cancelled'
  assignedManager: null,
  updatedAt: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
  reason: null,
});

function renderCardPreview(card) {
  const time = card.updatedAt || new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  const statusLine =
    card.status === 'confirmed'
      ? `🟢 ПІДТВЕРДЖЕНО (Взяв у роботу: ${card.assignedManager || 'Менеджер'} о ${time})`
      : card.status === 'cancelled'
      ? `🔴 СКАСОВАНО (Менеджер: ${card.assignedManager || 'Менеджер'} о ${time}${card.reason ? ` — Причина: ${card.reason}` : ''})`
      : '🟡 ОЧІКУЄ ПІДТВЕРДЖЕННЯ (Новий запит)';

  const buttonsLine =
    card.status === 'new'
      ? '[ ✅ Підтвердити ]   [ ❌ Скасувати ]'
      : '[ 🔒 Дії заблоковано: картку зафіксовано в Telegram ]';

  return [
    '================= 📱 TELEGRAM MESSAGE CARD PREVIEW =================',
    `🔔 ЛІД / ЗАМОВЛЕННЯ: #${card.leadId} (Message ID: ${card.messageId})`,
    `👤 Клієнт: ${card.clientName}`,
    `📱 Телефон: ${card.clientPhone}`,
    `💬 Послуга / Запит: ${card.serviceOrNotes}`,
    '-------------------------------------------------------------------',
    `Статус: ${statusLine}`,
    '-------------------------------------------------------------------',
    'Інлайн-кнопки:',
    buttonsLine,
    '===================================================================',
  ].join('\n');
}

// ── MCP Tool Definitions ────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'telegram_scenario_new_booking',
    description:
      'Preset Scenario: Simulates a new incoming client booking or lead (from website form or bot). Creates an active Telegram client card in the manager group with interactive confirmation buttons.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: {
          type: 'string',
          description: 'Unique identifier for the booking/lead (default: auto-generated or "lead_102")',
        },
        clientName: {
          type: 'string',
          description: 'Client full name',
          default: 'Олександр Коваленко',
        },
        clientPhone: {
          type: 'string',
          description: 'Client contact phone number',
          default: '+380501234567',
        },
        serviceOrNotes: {
          type: 'string',
          description: 'Requested service, package, or note',
          default: 'Консультація та підбір послуг',
        },
        dispatchWebhook: {
          type: 'boolean',
          description: 'Whether to dispatch simulated notification to local Next.js webhook endpoint (default: true)',
          default: true,
        },
        webhookUrl: {
          type: 'string',
          description: 'Target webhook endpoint URL',
          default: 'http://localhost:3005/api/telegram/webhook',
        },
        secretToken: {
          type: 'string',
          description: 'Optional Telegram webhook secret token matching TELEGRAM_WEBHOOK_SECRET',
        },
      },
    },
  },
  {
    name: 'telegram_scenario_manager_confirm',
    description:
      'Preset Scenario: Simulates a manager clicking [Підтвердити] on a client card. Dispatches callback_query update to Next.js webhook, transitions card status to CONFIRMED, records which manager took the lead, and freezes buttons.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: {
          type: 'string',
          description: 'Lead/booking ID to confirm (defaults to the last active lead)',
        },
        managerName: {
          type: 'string',
          description: 'Display name of the manager taking the lead',
          default: 'Олена (Менеджер)',
        },
        managerUsername: {
          type: 'string',
          description: 'Telegram username of the manager',
          default: 'olena_mgr',
        },
        webhookUrl: {
          type: 'string',
          description: 'Target webhook endpoint URL',
          default: 'http://localhost:3005/api/telegram/webhook',
        },
        secretToken: {
          type: 'string',
          description: 'Optional Telegram webhook secret token matching TELEGRAM_WEBHOOK_SECRET',
        },
      },
    },
  },
  {
    name: 'telegram_scenario_manager_cancel',
    description:
      'Preset Scenario: Simulates a manager clicking [Скасувати] on a client card. Dispatches callback_query update to Next.js webhook, transitions card status to CANCELLED, records manager name and reason, and freezes buttons.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: {
          type: 'string',
          description: 'Lead/booking ID to cancel (defaults to the last active lead)',
        },
        managerName: {
          type: 'string',
          description: 'Display name of the manager cancelling the lead',
          default: 'Дмитро (Менеджер)',
        },
        reason: {
          type: 'string',
          description: 'Cancellation reason',
          default: 'Скасовано за проханням клієнта',
        },
        managerUsername: {
          type: 'string',
          description: 'Telegram username of the manager',
          default: 'dmytro_mgr',
        },
        webhookUrl: {
          type: 'string',
          description: 'Target webhook endpoint URL',
          default: 'http://localhost:3005/api/telegram/webhook',
        },
        secretToken: {
          type: 'string',
          description: 'Optional Telegram webhook secret token matching TELEGRAM_WEBHOOK_SECRET',
        },
      },
    },
  },
  {
    name: 'telegram_get_card_preview',
    description:
      'Inspects and renders the current Telegram message card(s) and button states currently stored in the mock emulator.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: {
          type: 'string',
          description: 'Specific lead ID to inspect (omit to see all active cards)',
        },
      },
    },
  },
  {
    name: 'telegram_simulate_message',
    description:
      'Low-level: Simulates an incoming direct user text message update sent to the local Next.js Telegram webhook endpoint (e.g. "/start", commands, text queries).',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text message from the client (e.g. "/start", "Послуги", "Контакти")',
        },
        chatId: {
          type: 'number',
          description: 'Telegram chat ID (default: 10001)',
          default: 10001,
        },
        userId: {
          type: 'number',
          description: 'Telegram user ID (default: 10001)',
          default: 10001,
        },
        userName: {
          type: 'string',
          description: 'Sender display name (default: "Тестовий Клієнт")',
          default: 'Тестовий Клієнт',
        },
        webhookUrl: {
          type: 'string',
          description: 'Target webhook endpoint URL (default: "http://localhost:3005/api/telegram/webhook")',
          default: 'http://localhost:3005/api/telegram/webhook',
        },
        secretToken: {
          type: 'string',
          description: 'Telegram webhook secret token matching TELEGRAM_WEBHOOK_SECRET',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'telegram_simulate_button_click',
    description:
      'Low-level: Simulates an arbitrary inline keyboard button click (CallbackQuery) update sent to the local Telegram webhook endpoint.',
    inputSchema: {
      type: 'object',
      properties: {
        callbackData: {
          type: 'string',
          description: 'The callback_data payload attached to the clicked button (e.g. "confirm:lead_101", "cancel:lead_101")',
        },
        messageId: {
          type: 'number',
          description: 'ID of the message containing the button (default: 42)',
          default: 42,
        },
        chatId: {
          type: 'number',
          description: 'Telegram chat ID (default: 10001)',
          default: 10001,
        },
        webhookUrl: {
          type: 'string',
          description: 'Target webhook endpoint URL (default: "http://localhost:3005/api/telegram/webhook")',
          default: 'http://localhost:3005/api/telegram/webhook',
        },
        secretToken: {
          type: 'string',
          description: 'Telegram webhook secret token matching TELEGRAM_WEBHOOK_SECRET',
        },
      },
      required: ['callbackData'],
    },
  },
  {
    name: 'telegram_check_webhook',
    description: 'Pings the local Telegram webhook endpoint to verify accessibility, latency, and readiness.',
    inputSchema: {
      type: 'object',
      properties: {
        webhookUrl: {
          type: 'string',
          description: 'Target webhook endpoint URL (default: "http://localhost:3005/api/telegram/webhook")',
          default: 'http://localhost:3005/api/telegram/webhook',
        },
        secretToken: {
          type: 'string',
          description: 'Telegram webhook secret token matching TELEGRAM_WEBHOOK_SECRET',
        },
      },
    },
  },
];

// ── Tool Call Handler ───────────────────────────────────────────────────────
async function handleToolCall(name, args = {}) {
  const webhookUrl = args.webhookUrl || 'http://localhost:3005/api/telegram/webhook';
  const secretToken = args.secretToken || process.env.TELEGRAM_WEBHOOK_SECRET;
  const startTime = Date.now();

  const headers = {
    'Content-Type': 'application/json',
    'x-telegram-mock': 'true',
  };
  if (secretToken) {
    headers['x-telegram-bot-api-secret-token'] = secretToken.trim();
  }

  // 1. Health Check
  if (name === 'telegram_check_webhook') {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ update_id: 0, mock_ping: true }),
      });
      const text = await res.text();
      return {
        success: res.ok,
        status: res.status,
        statusText: res.statusText,
        latencyMs: Date.now() - startTime,
        webhookUrl,
        responseSnippet: text.slice(0, 500),
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        webhookUrl,
        hint: 'Ensure your dev server is running on the specified port (e.g. pnpm dev:all or port 3005).',
      };
    }
  }

  // 2. Preset Scenario: New Client Booking / Lead
  if (name === 'telegram_scenario_new_booking') {
    const leadId = args.leadId || `lead_${Date.now().toString().slice(-4)}`;
    const clientName = args.clientName || 'Олександр Коваленко';
    const clientPhone = args.clientPhone || '+380501234567';
    const serviceOrNotes = args.serviceOrNotes || 'Консультація та підбір послуг';
    const messageId = Math.floor(Math.random() * 9000) + 1000;

    const card = {
      leadId,
      messageId,
      chatId: 10001,
      clientName,
      clientPhone,
      serviceOrNotes,
      status: 'new',
      assignedManager: null,
      updatedAt: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
      reason: null,
    };

    simulatedCards.set(leadId, card);
    lastActiveLeadId = leadId;

    let webhookResult = null;
    if (args.dispatchWebhook !== false) {
      const update = {
        update_id: Date.now(),
        message: {
          message_id: messageId,
          from: {
            id: 10001,
            is_bot: false,
            first_name: clientName,
            username: 'test_client',
            language_code: 'uk',
          },
          chat: { id: 10001, type: 'group', title: 'Manager Group' },
          date: Math.floor(Date.now() / 1000),
          text: `[Новий лід]: ${clientName} (${clientPhone}) — ${serviceOrNotes}`,
        },
      };

      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(update),
        });
        const resText = await res.text();
        webhookResult = { ok: res.ok, status: res.status, snippet: resText.slice(0, 200) };
      } catch (err) {
        webhookResult = { ok: false, error: err.message };
      }
    }

    return {
      success: true,
      leadId,
      status: 'new',
      card,
      webhookNotification: webhookResult,
      renderedTelegramCard: renderCardPreview(card),
      nextActionHint: `Call telegram_scenario_manager_confirm({ leadId: "${leadId}" }) to simulate a manager taking this lead into work.`,
    };
  }

  // 3. Preset Scenario: Manager Confirm
  if (name === 'telegram_scenario_manager_confirm') {
    const leadId = args.leadId || lastActiveLeadId;
    const managerName = args.managerName || 'Олена (Менеджер)';
    const managerUsername = args.managerUsername || 'olena_mgr';

    let card = simulatedCards.get(leadId);
    if (!card) {
      card = {
        leadId,
        messageId: 42,
        chatId: 10001,
        clientName: 'Олександр Коваленко',
        clientPhone: '+380501234567',
        serviceOrNotes: 'Консультація та підбір послуг',
        status: 'new',
        assignedManager: null,
        updatedAt: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
        reason: null,
      };
      simulatedCards.set(leadId, card);
    }

    // Update in-memory card state
    card.status = 'confirmed';
    card.assignedManager = managerName;
    card.updatedAt = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

    const update = {
      update_id: Date.now(),
      callback_query: {
        id: `query_${Date.now()}`,
        from: {
          id: 20002,
          is_bot: false,
          first_name: managerName,
          username: managerUsername,
        },
        message: {
          message_id: card.messageId,
          chat: { id: card.chatId, type: 'group' },
          date: Math.floor(Date.now() / 1000),
          text: `🔔 ЛІД #${leadId}\n👤 ${card.clientName}\n📱 ${card.clientPhone}`,
        },
        data: `confirm:${leadId}`,
      },
    };

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(update),
      });
      const responseBody = await res.text();
      let parsedJson = null;
      try {
        parsedJson = JSON.parse(responseBody);
      } catch {
        // keep text
      }

      return {
        success: res.ok,
        status: res.status,
        leadId,
        action: 'confirmed',
        assignedManager: managerName,
        latencyMs: Date.now() - startTime,
        webhookResponse: parsedJson || responseBody,
        renderedTelegramCard: renderCardPreview(card),
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        leadId,
        card,
        renderedTelegramCard: renderCardPreview(card),
        webhookUrl,
        hint: 'Connection refused. Verify your dev server is running.',
      };
    }
  }

  // 4. Preset Scenario: Manager Cancel
  if (name === 'telegram_scenario_manager_cancel') {
    const leadId = args.leadId || lastActiveLeadId;
    const managerName = args.managerName || 'Дмитро (Менеджер)';
    const managerUsername = args.managerUsername || 'dmytro_mgr';
    const reason = args.reason || 'Скасовано за проханням клієнта';

    let card = simulatedCards.get(leadId);
    if (!card) {
      card = {
        leadId,
        messageId: 42,
        chatId: 10001,
        clientName: 'Олександр Коваленко',
        clientPhone: '+380501234567',
        serviceOrNotes: 'Консультація та підбір послуг',
        status: 'new',
        assignedManager: null,
        updatedAt: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
        reason: null,
      };
      simulatedCards.set(leadId, card);
    }

    card.status = 'cancelled';
    card.assignedManager = managerName;
    card.reason = reason;
    card.updatedAt = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

    const update = {
      update_id: Date.now(),
      callback_query: {
        id: `query_${Date.now()}`,
        from: {
          id: 20003,
          is_bot: false,
          first_name: managerName,
          username: managerUsername,
        },
        message: {
          message_id: card.messageId,
          chat: { id: card.chatId, type: 'group' },
          date: Math.floor(Date.now() / 1000),
          text: `🔔 ЛІД #${leadId}\n👤 ${card.clientName}\n📱 ${card.clientPhone}`,
        },
        data: `cancel:${leadId}`,
      },
    };

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(update),
      });
      const responseBody = await res.text();
      let parsedJson = null;
      try {
        parsedJson = JSON.parse(responseBody);
      } catch {
        // keep text
      }

      return {
        success: res.ok,
        status: res.status,
        leadId,
        action: 'cancelled',
        assignedManager: managerName,
        reason,
        latencyMs: Date.now() - startTime,
        webhookResponse: parsedJson || responseBody,
        renderedTelegramCard: renderCardPreview(card),
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        leadId,
        card,
        renderedTelegramCard: renderCardPreview(card),
        webhookUrl,
      };
    }
  }

  // 5. Get Card Preview
  if (name === 'telegram_get_card_preview') {
    if (args.leadId) {
      const card = simulatedCards.get(args.leadId);
      if (!card) {
        return {
          found: false,
          leadId: args.leadId,
          availableLeads: Array.from(simulatedCards.keys()),
        };
      }
      return {
        found: true,
        leadId: args.leadId,
        card,
        renderedTelegramCard: renderCardPreview(card),
      };
    }

    const allCards = Array.from(simulatedCards.values());
    return {
      totalCards: allCards.length,
      cards: allCards,
      renderedPreviews: allCards.map(renderCardPreview).join('\n\n'),
    };
  }

  // 6. Low-level: Simulate User Text Message
  if (name === 'telegram_simulate_message') {
    const chatId = args.chatId ?? 10001;
    const userId = args.userId ?? 10001;
    const userName = args.userName || 'Тестовий Клієнт';
    const update = {
      update_id: Date.now(),
      message: {
        message_id: Math.floor(Math.random() * 10000) + 1,
        from: {
          id: userId,
          is_bot: false,
          first_name: userName,
          username: 'test_client',
          language_code: 'uk',
        },
        chat: {
          id: chatId,
          first_name: userName,
          type: 'private',
        },
        date: Math.floor(Date.now() / 1000),
        text: args.text,
      },
    };

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(update),
      });
      const responseBody = await res.text();
      let parsedJson = null;
      try {
        parsedJson = JSON.parse(responseBody);
      } catch {
        // keep as text
      }

      return {
        success: res.ok,
        status: res.status,
        latencyMs: Date.now() - startTime,
        dispatchedUpdate: update,
        webhookResponse: parsedJson || responseBody,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        dispatchedUpdate: update,
        webhookUrl,
        hint: 'Connection refused. Verify your local server is running.',
      };
    }
  }

  // 7. Low-level: Simulate Button Click
  if (name === 'telegram_simulate_button_click') {
    const chatId = args.chatId ?? 10001;
    const messageId = args.messageId ?? 42;
    const update = {
      update_id: Date.now(),
      callback_query: {
        id: `query_${Date.now()}`,
        from: {
          id: 10001,
          is_bot: false,
          first_name: 'Тестовий Менеджер',
          username: 'test_manager',
        },
        message: {
          message_id: messageId,
          chat: {
            id: chatId,
            type: 'private',
          },
          date: Math.floor(Date.now() / 1000),
        },
        data: args.callbackData,
      },
    };

    // Update in-memory card if data matches confirm/cancel pattern
    if (args.callbackData) {
      const [action, leadId] = args.callbackData.split(':');
      if (leadId && (action === 'confirm' || action === 'cancel')) {
        let card = simulatedCards.get(leadId);
        if (card) {
          card.status = action === 'confirm' ? 'confirmed' : 'cancelled';
          card.assignedManager = 'Тестовий Менеджер';
          card.updatedAt = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
        }
      }
    }

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(update),
      });
      const responseBody = await res.text();
      let parsedJson = null;
      try {
        parsedJson = JSON.parse(responseBody);
      } catch {
        // keep as text
      }

      return {
        success: res.ok,
        status: res.status,
        latencyMs: Date.now() - startTime,
        dispatchedUpdate: update,
        webhookResponse: parsedJson || responseBody,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        dispatchedUpdate: update,
        webhookUrl,
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
}

function sendJson(response) {
  process.stdout.write(JSON.stringify(response) + '\n');
}

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false,
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const request = JSON.parse(trimmed);
    const { id, method, params } = request;

    // Handle JSON-RPC Notifications
    if (id === undefined || id === null) {
      if (method === 'notifications/initialized') {
        // Client acknowledgment
      }
      return;
    }

    if (method === 'initialize') {
      sendJson({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'telegram-mock',
            version: '2.0.0',
          },
        },
      });
      return;
    }

    if (method === 'tools/list') {
      sendJson({
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      });
      return;
    }

    if (method === 'tools/call') {
      const { name, arguments: toolArgs } = params || {};
      const result = await handleToolCall(name, toolArgs);
      sendJson({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        },
      });
      return;
    }

    // Unhandled method
    sendJson({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    });
  } catch (err) {
    console.error('[telegram-mock-mcp] Error processing request:', err);
    sendJson({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
      },
    });
  }
});
