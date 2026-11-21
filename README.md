# 5-Star Sanity + Next.js App Router Stack Plugin

AI coding agent plugin (Rules, Skills, and MCP Servers) for building resilient, high-performance web applications using the **5-Star Architecture**:
- **Next.js 15 App Router** (React 19, Server Components)
- **Sanity CMS v3** with Dual-Tier Fallback Architecture (ADR 0007 anti-shadowing)
- **Supabase** (PostgREST, Row-Level Security, SSR Auth)
- **Telegram Bot Back-Office** (2-way serverless operations, in-place message state)
- **Cloudflare Code Mode MCP** (95% token savings, single-turn multi-step orchestration)

---

## What's Included

### 1. Dual Model Context Protocol (MCP) Suite
- **`telegram-mock`**: High-level declarative emulator with visual in-memory message cards and 1-click preset scenarios (`telegram_scenario_new_booking`, `telegram_scenario_manager_confirm`, `telegram_scenario_manager_cancel`).
- **`code-mode`**: Advanced Cloudflare Code Mode pattern (`search` + `execute`) with pre-injected SDKs (`sanity`, `supabase`, `telegram`, `console`) for multi-step agent workflows.

#### Visual Inspection with MCP Inspector
Inspect, test, and debug Telegram bot interactions and preset scenarios visually using `@modelcontextprotocol/inspector`:

```bash
# Recommended: node with $HOME
npx -y @modelcontextprotocol/inspector node "$HOME/.gemini/config/plugins/5star-sanity-stack/mcp/telegram-mock/index.mjs"

# Or direct executable:
npx -y @modelcontextprotocol/inspector "$HOME/.gemini/config/plugins/5star-sanity-stack/mcp/telegram-mock/index.mjs"
```

> [!WARNING]
> **Do NOT use bare `~` in Inspector commands:**  
> `child_process.spawn()` (used internally by MCP Inspector) does NOT invoke a shell to expand `~`. Using `~` causes Node to search for a literal directory named `~` in `process.cwd()` and fails with `MODULE_NOT_FOUND`. Always use `"$HOME/..."` or full absolute paths.

**MCP Inspector v2 Tokenized URL Authentication:**  
Inspector v2 generates a tokenized URL (e.g. `http://127.0.0.1:XXXX?MCP_INSPECTOR_API_TOKEN=...`). Always open that exact URL from terminal output to avoid "Failed to fetch" errors.

**1-Click Preset Scenarios & In-Place State Verification:**  
Run `telegram_scenario_new_booking` to generate an active lead card with action buttons, followed by `telegram_scenario_manager_confirm` or `telegram_scenario_manager_cancel` to dispatch callbacks to your webhook. Call `telegram_get_card_preview` to observe the rendered ASCII card reflect in-place message state changes (freeze buttons, status badge transition, manager attribution).

### 2. Architectural Invariants (ADR 0007)
Enforced via `rules/AGENTS.md`:
- **Single Normalization Boundary**: Field merging and fallback resolution live strictly in data access layer (`lib/sanity/api.ts`).
- **Zero In-Component Fallbacks**: UI components are pure presentation and never shadow upstream CMS fields with local constants.
- **Runtime Contract Testing**: Data contracts verified against live resolver functions.

### 3. Bundled Skills (12)
- `content-experimentation-best-practices`: A/B testing and variant design.
- `content-modeling-best-practices`: Schema architecture and content reuse.
- `nextjs-seo-structured-data`: Dynamic robots, sitemaps, JSON-LD schema.org.
- `portable-text`: Serialization and rendering of Sanity Portable Text.
- `sanity-best-practices`: GROQ, TypeGen, Visual Editing, ISR revalidation.
- `sanity-migration`: Content migration patterns.
- `sanity-studio-upgrade`: Tailored Studio upgrade guidance.
- `sanity-visual-editing-and-isr`: Presentation Tool and Draft Mode.
- `schemas-fallback`: Dual-Tier fallback resolution methodology.
- `seo-aeo-best-practices`: Search and AI answer engine optimization.
- `supabase-integration`: SSR auth, RLS, and hybrid state patterns.
- `telegram_bot-integration`: 2-way back-office bot architecture and webhook handlers.

---

## Installation

### Global (Machine-Wide)
Clone or symlink into your global agent plugins directory (e.g. `~/.gemini/config/plugins/5star-sanity-stack` or `~/.agents/plugins/5star-sanity-stack`):
```bash
git clone <repository-url> ~/.gemini/config/plugins/5star-sanity-stack
```

### Workspace (Project-Specific)
Clone directly into your project's `.agents` directory:
```bash
git clone <repository-url> .agents/plugins/5star-sanity-stack
```

Both global and workspace installations are automatically detected by the portable launchers in `mcp_config.json`.

---

## Verification & Smoke Test

To verify that all bundled skills, rules, and MCP servers are functional, run:
```bash
node scripts/smoke-test.mjs
```
