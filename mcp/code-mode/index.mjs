#!/usr/bin/env node

/**
 * 5STAR Code Mode MCP Server (Zero-Dependency Stdio Transport)
 * Cloudflare Code Mode Pattern for 5-Star Sanity + Next.js App Router Stack.
 *
 * Implements the 2-tool Code Mode architecture:
 * 1. search({ query }): Search typed API references and usage recipes for 5STAR services.
 * 2. execute({ code }): Execute multi-step JS/TS code with pre-injected SDKs (sanity, supabase, telegram).
 *
 * Slashes prompt context token footprint by ~95% and enables 1-turn multi-service orchestration.
 */

import readline from 'node:readline';

// ── Documentation Index for search() ─────────────────────────────────────────
const API_DOCS = [
  {
    service: 'telegram',
    title: 'telegram.simulateBooking(options)',
    signature: 'await telegram.simulateBooking({ leadId?, clientName?, clientPhone?, serviceOrNotes?, webhookUrl? })',
    description: 'Simulates a client booking form submission. Creates an active Telegram message card in the manager group with [Підтвердити]/[Скасувати] buttons.',
    example: `const res = await telegram.simulateBooking({
  leadId: 'lead_201',
  clientName: 'Олена Петренко',
  clientPhone: '+380501234567',
  serviceOrNotes: 'Консультація та підбір послуг'
});
console.log(res.renderedTelegramCard);`,
  },
  {
    service: 'telegram',
    title: 'telegram.simulateConfirm(options)',
    signature: 'await telegram.simulateConfirm({ leadId?, managerName?, webhookUrl? })',
    description: 'Simulates manager clicking [Підтвердити] in Telegram. Dispatches callback_query to Next.js webhook, transitions card to CONFIRMED, attributes action to manager, and freezes buttons.',
    example: `const res = await telegram.simulateConfirm({
  leadId: 'lead_201',
  managerName: 'Менеджер Олена'
});
console.log('Confirmed:', res.status, res.renderedTelegramCard);`,
  },
  {
    service: 'telegram',
    title: 'telegram.simulateCancel(options)',
    signature: 'await telegram.simulateCancel({ leadId?, managerName?, reason?, webhookUrl? })',
    description: 'Simulates manager clicking [Скасувати] in Telegram. Dispatches callback_query to Next.js webhook, transitions card to CANCELLED with reason, and freezes buttons.',
    example: `const res = await telegram.simulateCancel({
  leadId: 'lead_201',
  managerName: 'Менеджер Дмитро',
  reason: 'Клієнт переніс візит'
});
console.log(res.renderedTelegramCard);`,
  },
  {
    service: 'telegram',
    title: 'telegram.getCardPreview(leadId?)',
    signature: 'telegram.getCardPreview(leadId?)',
    description: 'Returns the current state and rendered ASCII preview of the simulated Telegram card in the manager group.',
    example: `const card = telegram.getCardPreview('lead_201');
console.log(card.renderedTelegramCard);`,
  },
  {
    service: 'telegram',
    title: 'telegram.checkWebhook(url?)',
    signature: 'await telegram.checkWebhook(url?)',
    description: 'Pings local Next.js webhook endpoint (/api/telegram/webhook) with mock verification header.',
    example: `const health = await telegram.checkWebhook();
console.log('Webhook reachable:', health.success, health.latencyMs);`,
  },
  {
    service: 'sanity',
    title: 'sanity.fetch(groqQuery, params?)',
    signature: 'await sanity.fetch(query, params?)',
    description: 'Executes a read GROQ query against Sanity Content Lake using project credentials from environment.',
    example: `const doctors = await sanity.fetch(
  \`*[_type == "doctor" && !(_id in path("drafts.**"))] {
    name,
    "slug": slug.current,
    specialization
  }\`
);
console.log('Doctors count:', doctors?.length);`,
  },
  {
    service: 'supabase',
    title: 'supabase.from(tableName)',
    signature: 'await supabase.from(table).select(cols?).eq(col, val)...',
    description: 'Lightweight PostgREST query builder for Supabase tables (e.g. appointments, profiles).',
    example: `const { data, error } = await supabase
  .from('appointments')
  .select('id, patient_name, status, created_at')
  .eq('status', 'confirmed')
  .limit(5);
console.log('Appointments:', data);`,
  },
  {
    service: 'recipes',
    title: 'Cross-Service Recipe: Verify Lead and Sync Status',
    signature: 'Chaining Supabase, Sanity, and Telegram in 1 Turn',
    description: 'Demonstrates verifying a booking from Supabase, checking doctor data in Sanity, and confirming in Telegram.',
    example: `// 1. Fetch lead from Supabase
const { data: lead } = await supabase.from('appointments').select('*').limit(1).single();

// 2. Fetch doctor from Sanity
const doctor = await sanity.fetch('*[_type == "doctor"][0] { name, specialization }');

// 3. Confirm in Telegram
const tg = await telegram.simulateConfirm({
  leadId: lead?.id || 'lead_demo',
  managerName: 'Менеджер Олена'
});

return {
  leadId: lead?.id,
  assignedDoctor: doctor?.name,
  telegramStatus: tg.action,
  preview: tg.renderedTelegramCard
};`,
  },
];

// ── In-Memory Telegram Card Emulator for Code Mode ──────────────────────────
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
  status: 'new',
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

// ── Injected SDK Clients ────────────────────────────────────────────────────
function createTelegramClient() {
  const defaultWebhook = 'http://127.0.0.1:3005/api/telegram/webhook';

  return {
    async checkWebhook(url = defaultWebhook) {
      const start = Date.now();
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-telegram-mock': 'true',
          },
          body: JSON.stringify({ update_id: 0, mock_ping: true }),
          signal: AbortSignal.timeout(1000),
        });
        const snippet = await res.text();
        return {
          success: res.ok,
          status: res.status,
          latencyMs: Date.now() - start,
          snippet: snippet.slice(0, 300),
        };
      } catch (err) {
        return { success: false, error: err.message, latencyMs: Date.now() - start };
      }
    },

    async simulateBooking(opts = {}) {
      const leadId = opts.leadId || `lead_${Date.now().toString().slice(-4)}`;
      const clientName = opts.clientName || 'Олександр Коваленко';
      const clientPhone = opts.clientPhone || '+380501234567';
      const serviceOrNotes = opts.serviceOrNotes || 'Консультація та підбір послуг';
      const webhookUrl = opts.webhookUrl || defaultWebhook;

      const card = {
        leadId,
        messageId: Math.floor(Math.random() * 9000) + 1000,
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

      if (opts.dispatchWebhook === false || opts.skipWebhook === true) {
        return {
          success: true,
          leadId,
          card,
          renderedTelegramCard: renderCardPreview(card),
        };
      }

      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-telegram-mock': 'true' },
          body: JSON.stringify({
            update_id: Date.now(),
            message: {
              message_id: card.messageId,
              from: { id: 10001, is_bot: false, first_name: clientName },
              chat: { id: 10001, type: 'group' },
              date: Math.floor(Date.now() / 1000),
              text: `[Новий лід]: ${clientName} (${clientPhone}) — ${serviceOrNotes}`,
            },
          }),
          signal: AbortSignal.timeout(1000),
        });
        return {
          success: true,
          leadId,
          status: res.status,
          card,
          renderedTelegramCard: renderCardPreview(card),
        };
      } catch (err) {
        return {
          success: true,
          leadId,
          warning: `Webhook dispatch failed: ${err.message}`,
          card,
          renderedTelegramCard: renderCardPreview(card),
        };
      }
    },

    async simulateConfirm(opts = {}) {
      const leadId = opts.leadId || lastActiveLeadId;
      const managerName = opts.managerName || 'Олена (Менеджер)';
      const webhookUrl = opts.webhookUrl || defaultWebhook;

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
        };
        simulatedCards.set(leadId, card);
      }

      card.status = 'confirmed';
      card.assignedManager = managerName;
      card.updatedAt = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

      if (opts.dispatchWebhook === false || opts.skipWebhook === true) {
        return {
          success: true,
          leadId,
          action: 'confirmed',
          assignedManager: managerName,
          renderedTelegramCard: renderCardPreview(card),
        };
      }

      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-telegram-mock': 'true' },
          body: JSON.stringify({
            update_id: Date.now(),
            callback_query: {
              id: `query_${Date.now()}`,
              from: { id: 20002, is_bot: false, first_name: managerName },
              message: { message_id: card.messageId, chat: { id: card.chatId, type: 'group' } },
              data: `confirm:${leadId}`,
            },
          }),
          signal: AbortSignal.timeout(1000),
        });
        let webhookJson = null;
        try {
          webhookJson = await res.json();
        } catch {}

        return {
          success: res.ok,
          status: res.status,
          leadId,
          action: 'confirmed',
          assignedManager: managerName,
          webhookResponse: webhookJson,
          renderedTelegramCard: renderCardPreview(card),
        };
      } catch (err) {
        return {
          success: false,
          error: err.message,
          leadId,
          renderedTelegramCard: renderCardPreview(card),
        };
      }
    },

    async simulateCancel(opts = {}) {
      const leadId = opts.leadId || lastActiveLeadId;
      const managerName = opts.managerName || 'Дмитро (Менеджер)';
      const reason = opts.reason || 'Скасовано за проханням клієнта';
      const webhookUrl = opts.webhookUrl || defaultWebhook;

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
        };
        simulatedCards.set(leadId, card);
      }

      card.status = 'cancelled';
      card.assignedManager = managerName;
      card.reason = reason;
      card.updatedAt = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

      if (opts.dispatchWebhook === false || opts.skipWebhook === true) {
        return {
          success: true,
          leadId,
          action: 'cancelled',
          assignedManager: managerName,
          reason,
          renderedTelegramCard: renderCardPreview(card),
        };
      }

      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-telegram-mock': 'true' },
          body: JSON.stringify({
            update_id: Date.now(),
            callback_query: {
              id: `query_${Date.now()}`,
              from: { id: 20003, is_bot: false, first_name: managerName },
              message: { message_id: card.messageId, chat: { id: card.chatId, type: 'group' } },
              data: `cancel:${leadId}`,
            },
          }),
          signal: AbortSignal.timeout(1000),
        });
        let webhookJson = null;
        try {
          webhookJson = await res.json();
        } catch {}

        return {
          success: res.ok,
          status: res.status,
          leadId,
          action: 'cancelled',
          assignedManager: managerName,
          reason,
          webhookResponse: webhookJson,
          renderedTelegramCard: renderCardPreview(card),
        };
      } catch (err) {
        return {
          success: false,
          error: err.message,
          leadId,
          renderedTelegramCard: renderCardPreview(card),
        };
      }
    },

    getCardPreview(leadId) {
      if (leadId) {
        const card = simulatedCards.get(leadId);
        if (!card) return { found: false, leadId };
        return { found: true, card, renderedTelegramCard: renderCardPreview(card) };
      }
      const all = Array.from(simulatedCards.values());
      return { total: all.length, cards: all, previews: all.map(renderCardPreview).join('\n\n') };
    },
  };
}

function createSanityClient() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
  const token = process.env.SANITY_API_READ_TOKEN;

  return {
    async fetch(query, params = {}) {
      if (!projectId) {
        return {
          error: 'NEXT_PUBLIC_SANITY_PROJECT_ID not set in environment.',
          hint: 'Ensure your environment has NEXT_PUBLIC_SANITY_PROJECT_ID configured.',
        };
      }

      let encodedQuery = encodeURIComponent(query);
      for (const [k, v] of Object.entries(params)) {
        encodedQuery += `&$${k}=${encodeURIComponent(JSON.stringify(v))}`;
      }

      const url = `https://${projectId}.api.sanity.io/v2024-01-01/data/query/${dataset}?query=${encodedQuery}`;
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      try {
        const res = await fetch(url, { headers });
        if (!res.ok) {
          return { error: `Sanity HTTP ${res.status}: ${await res.text()}` };
        }
        const json = await res.json();
        return json.result;
      } catch (err) {
        return { error: err.message };
      }
    },
  };
}

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return {
    from(table) {
      const state = {
        table,
        select: '*',
        filters: [],
      };

      const builder = {
        select(columns = '*') {
          state.select = columns;
          return builder;
        },
        eq(column, value) {
          state.filters.push(`${column}=eq.${encodeURIComponent(value)}`);
          return builder;
        },
        order(column, { ascending = true } = {}) {
          state.filters.push(`order=${column}.${ascending ? 'asc' : 'desc'}`);
          return builder;
        },
        limit(count) {
          state.filters.push(`limit=${count}`);
          return builder;
        },
        async single() {
          const res = await builder.execute();
          if (res.error) return res;
          return {
            data: Array.isArray(res.data) ? res.data[0] || null : res.data,
            error: null,
          };
        },
        async execute() {
          if (!supabaseUrl || !supabaseKey) {
            return {
              data: null,
              error: 'NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured in environment.',
            };
          }
          let url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(state.select)}`;
          if (state.filters.length) {
            url += '&' + state.filters.join('&');
          }
          try {
            const res = await fetch(url, {
              headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
              },
            });
            if (!res.ok) {
              return { data: null, error: `Supabase HTTP ${res.status}: ${await res.text()}` };
            }
            return { data: await res.json(), error: null };
          } catch (err) {
            return { data: null, error: err.message };
          }
        },
        then(resolve, reject) {
          return builder.execute().then(resolve, reject);
        },
      };

      return builder;
    },
  };
}

// ── Code Mode Tools Definition ──────────────────────────────────────────────
const TOOLS = [
  {
    name: 'search',
    description:
      'Search 5STAR SDK APIs, typed method signatures, and cross-service recipes. Call this to look up available methods for sanity, supabase, or telegram before generating code.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keyword (e.g. "telegram", "sanity", "booking", "confirm", "supabase", "recipe")',
        },
      },
    },
  },
  {
    name: 'execute',
    description:
      'Cloudflare Code Mode: Execute a JavaScript snippet with pre-injected SDKs (sanity, supabase, telegram, fetch, console). Performs multi-step orchestration across the 5STAR stack in a single turn.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description:
            'Async JavaScript code snippet to run. Available globals: sanity, supabase, telegram, fetch, console. Return any value to receive it in the tool result.',
        },
      },
      required: ['code'],
    },
  },
];

// ── Tool Call Execution ─────────────────────────────────────────────────────
async function handleToolCall(name, args = {}) {
  const startTime = Date.now();

  // 1. Search Tool
  if (name === 'search') {
    const q = (args.query || '').trim().toLowerCase();
    const results = q
      ? API_DOCS.filter(
          (d) =>
            d.service.toLowerCase().includes(q) ||
            d.title.toLowerCase().includes(q) ||
            d.description.toLowerCase().includes(q) ||
            d.signature.toLowerCase().includes(q)
        )
      : API_DOCS;

    return {
      query: args.query || '*',
      count: results.length,
      availableServices: ['telegram', 'sanity', 'supabase'],
      results,
    };
  }

  // 2. Execute Tool (Code Mode)
  if (name === 'execute') {
    const code = args.code;
    if (!code || typeof code !== 'string') {
      return { success: false, error: 'Parameter "code" must be a non-empty string.' };
    }

    const logs = [];
    const captureConsole = {
      log: (...a) => logs.push(['[LOG]', ...a].map(String).join(' ')),
      warn: (...a) => logs.push(['[WARN]', ...a].map(String).join(' ')),
      error: (...a) => logs.push(['[ERROR]', ...a].map(String).join(' ')),
    };

    const telegram = createTelegramClient();
    const sanity = createSanityClient();
    const supabase = createSupabaseClient();

    try {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const runner = new AsyncFunction(
        'sanity',
        'supabase',
        'telegram',
        'fetch',
        'console',
        `"use strict";\n${code}`
      );

      const result = await Promise.race([
        runner(sanity, supabase, telegram, fetch, captureConsole),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Code execution timed out (30s limit)')), 30000)
        ),
      ]);

      return {
        success: true,
        result: result !== undefined ? result : null,
        logs,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        stack: err.stack ? err.stack.split('\n').slice(0, 3).join('\n') : undefined,
        logs,
        durationMs: Date.now() - startTime,
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

    if (id === undefined || id === null) {
      if (method === 'notifications/initialized') {
        // Init acknowledgment
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
            name: '5star-code-mode',
            version: '1.0.0',
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

    sendJson({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  } catch (err) {
    sendJson({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    });
  }
});
