# 5-Star Sanity + Next.js App Router Stack Plugin

Antigravity customization bundle for building resilient, high-performance web applications using the **5-Star Architecture**:
- **Next.js 15 App Router** (React 19, Server Components)
- **Sanity CMS v3** with Dual-Tier Fallback Architecture (ADR 0007 anti-shadowing)
- **Supabase** (PostgREST, Row-Level Security, SSR Auth)
- **Telegram Bot Back-Office** (2-way serverless operations, in-place message state)
- **Cloudflare Code Mode MCP** (95% token savings, single-turn multi-step orchestration)

---

## What's Included

### 1. Dual Model Context Protocol (MCP) Suite
- **`telegram-mock`**: High-level declarative emulator with visual in-memory message cards and 1-click preset scenarios (`new_booking`, `manager_confirm`, `manager_cancel`).
- **`code-mode`**: Advanced Cloudflare Code Mode pattern (`search` + `execute`) with pre-injected SDKs (`sanity`, `supabase`, `telegram`, `console`) for multi-step agent workflows.

### 2. Architectural Invariants (ADR 0007)
Enforced via `rules/AGENTS.md`:
- **Single Normalization Boundary**: Field merging and fallback resolution live strictly in data access layer (`lib/sanity/api.ts`).
- **Zero In-Component Fallbacks**: UI components are pure presentation and never shadow upstream CMS fields with local constants.
- **Runtime Contract Testing**: Data contracts verified against live resolver functions.

### 3. Bundled Skills (13)
- `content-experimentation-best-practices`: A/B testing and variant design.
- `content-modeling-best-practices`: Schema architecture and content reuse.
- `nextjs-seo-structured-data`: Dynamic robots, sitemaps, JSON-LD schema.org.
- `portable-text`: Serialization and rendering of Sanity Portable Text.
- `react-vite-dashboard`: Admin dashboard generation.
- `sanity-best-practices`: GROQ, TypeGen, Visual Editing, ISR revalidation.
- `sanity-migration`: Content migration patterns.
- `sanity-studio-upgrade`: Tailored Studio upgrade guidance.
- `sanity-visual-editing-and-isr`: Presentation Tool and Draft Mode.
- `schemas&fallback`: Dual-Tier fallback resolution methodology.
- `seo-aeo-best-practices`: Search and AI answer engine optimization.
- `supabase-integration`: SSR auth, RLS, and hybrid state patterns.
- `telegram_bot-integration`: 2-way back-office bot architecture and webhook handlers.

---

## Installation

### Global (Machine-Wide)
Clone or symlink into your global Antigravity config directory:
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
