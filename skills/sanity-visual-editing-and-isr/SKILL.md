---
name: sanity-visual-editing-and-isr
description: Production-grade Visual Editing (Presentation Tool), Draft Mode, tag-based on-demand ISR revalidation, and iframe communication for Sanity Studio v3 and Next.js 15 App Router.
---

# Sanity Visual Editing & On-Demand ISR (Next.js 15 App Router)

This skill provides architectural patterns, security standards, and implementation guides for integrating **Sanity Visual Editing (Presentation Tool)** and **On-Demand Incremental Static Regeneration (ISR)** in Next.js 15+ applications.

---

## 1. Architectural Philosophy: The Dual-Experience Engine

A production headless CMS integration must satisfy two conflicting demands:
1. **Public Visitors:** Demand lightning-fast Time to First Byte (TTFB < 50ms), perfect SEO, and 100% uptime even during CMS outages.
2. **Content Editors:** Demand instant live visual previews inside the CMS studio, clicking on text to jump to fields, and publishing updates without waiting for full site rebuilds.

```mermaid
flowchart TD
    subgraph Editors["Content Editors in Sanity Studio"]
        Studio["Sanity Studio (Presentation Tool)"]
        LiveInput["Editor modifies title/image"]
    end

    subgraph DraftModeChannel["Draft Mode Channel (Real-Time Dynamic)"]
        DraftRoute["GET /api/draft-mode/enable"]
        Cookie["__prerender_bypass cookie set"]
        DraftFetch["next-sanity fetches with SANITY_API_READ_TOKEN"]
        LiveOverlay["@sanity/visual-editing overlays click-to-edit box"]
    end

    subgraph PublicChannel["Public Visitors Channel (Edge Cached ISR)"]
        EdgeCDN["Vercel Edge Network / CDN"]
        CachedHTML["Static Pre-rendered HTML (TTFB ~30ms)"]
        RevalWebhook["POST /api/revalidate (On-Demand Tag Invalidation)"]
    end

    Studio -->|Embeds via iframe| DraftRoute
    DraftRoute --> Cookie
    Cookie --> DraftFetch
    DraftFetch --> LiveOverlay
    LiveInput -->|Publishes document| RevalWebhook
    RevalWebhook -->|revalidateTag('service')| EdgeCDN
    EdgeCDN --> CachedHTML
```

---

## 2. Why Incremental Static Regeneration (ISR)?

| Architecture | TTFB | CMS API Load | Outage Impact | Publishing Delay |
| :--- | :---: | :---: | :---: | :---: |
| **Pure SSR (per request)** | Slow (300–900ms) | Extreme (Exhausts free tiers) | Site crashes (500 error) | Instant |
| **Pure SSG (Static build)** | Instant (~30ms) | Zero (during runtime) | 100% resilient | 3–6 minutes (Full build needed) |
| **ISR + On-Demand Tags (Recommended)** | **Instant (~30ms)** | **Minimal (Fetches only on change)** | **100% resilient (Stale-while-revalidate)** | **Instant (< 1 second via webhook)** |

### Key Reasons ISR is Mandatory for this Stack:
1. **API Quota Protection:** Free/Hobby tiers (Sanity Free, Vercel Hobby) have API call and compute time limits. ISR serves 99.9% of traffic from the Edge CDN cache without touching the Sanity API.
2. **Resilience & Cold-Start Immunity:** If the CMS API is rate-limited, undergoing maintenance, or experiencing cold starts, ISR serves stale cached content (`stale-while-revalidate`), preventing public 500 errors.
3. **Core Web Vitals:** Serving static HTML delivers optimal LCP (Largest Contentful Paint) and low TTFB, directly improving Google search rankings.

---

## 3. Package Setup & Environment Configuration

### Required Packages
```bash
pnpm add next-sanity @sanity/visual-editing
```

### Environment Scopes
```env
# Next.js Web App (.env)
NEXT_PUBLIC_SANITY_PROJECT_ID=6d4o7w9b
NEXT_PUBLIC_SANITY_DATASET=production
NEXT_PUBLIC_SANITY_API_VERSION=2024-03-01

# Server-only secrets (Never expose to browser bundle)
SANITY_API_READ_TOKEN=sk...        # Token with Viewer rights for Draft Mode
SANITY_REVALIDATE_SECRET=secret...  # Shared secret for webhook validation

# Sanity Studio (.env)
SANITY_STUDIO_PROJECT_ID=6d4o7w9b
SANITY_STUDIO_DATASET=production
SANITY_STUDIO_PREVIEW_URL=https://yourdomain.com  # Or http://localhost:3000 in dev
```

---

## 4. Next.js 15 Draft Mode Route Handlers

### 4.1. Enable Draft Mode (`/api/draft-mode/enable/route.ts`)
```typescript
import { client } from '@/lib/sanity/client';
import { defineEnableDraftMode } from 'next-sanity/draft-mode';

export const { GET } = defineEnableDraftMode({
  client: client.withConfig({
    token: process.env.SANITY_API_READ_TOKEN,
  }),
});
```

### 4.2. Disable Draft Mode (`/api/draft-mode/disable/route.ts`)
```typescript
import { draftMode } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const draft = await draftMode();
  draft.disable();

  const url = new URL(request.url);
  return NextResponse.redirect(new URL('/', url.origin));
}
```

---

## 5. Visual Editing Component & Layout Integration

### 5.1. The Client Visual Editing Bridge
```typescript
// src/components/SanityVisualEditing.tsx
'use client';

import { VisualEditing } from '@sanity/visual-editing/react';

export function SanityVisualEditing() {
  return <VisualEditing portal={true} />;
}
```

### 5.2. Root Layout Integration
In `src/app/layout.tsx`, conditionally render Visual Editing only when Draft Mode is active, preventing overhead for regular public visitors:

```tsx
// src/app/layout.tsx
import { draftMode } from 'next/headers';
import { SanityVisualEditing } from '@/components/SanityVisualEditing';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { isEnabled } = await draftMode();

  return (
    <html lang="uk">
      <body>
        {children}
        {isEnabled && <SanityVisualEditing />}
      </body>
    </html>
  );
}
```

---

## 6. Sanity Studio Presentation Tool Configuration

In your Sanity Studio package (`sanity.config.ts`):

```typescript
// studio/sanity.config.ts
import { defineConfig } from 'sanity';
import { presentationTool } from 'sanity/presentation';
import { structureTool } from 'sanity/structure';

export default defineConfig({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || '',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  plugins: [
    structureTool(),
    presentationTool({
      previewUrl: {
        origin: process.env.SANITY_STUDIO_PREVIEW_URL || 'http://localhost:3000',
        previewMode: {
          enable: '/api/draft-mode/enable',
        },
      },
    }),
  ],
});
```

---

## 7. Tag-Based On-Demand ISR Webhook

When an editor publishes content in Sanity Studio, a webhook invalidates only the specific cached tag, delivering instant updates without a full rebuild:

```typescript
// src/app/api/revalidate/route.ts
import { revalidateTag } from 'next/cache';
import { type NextRequest, NextResponse } from 'next/server';
import { parseBody } from 'next-sanity/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { isValidSignature, body } = await parseBody<{
      _type: string;
      slug?: { current: string };
    }>(req, process.env.SANITY_REVALIDATE_SECRET);

    if (!isValidSignature) {
      return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
    }

    if (!body?._type) {
      return NextResponse.json({ message: 'Bad Request' }, { status: 400 });
    }

    // Invalidate the entity-level tag (e.g. 'doctor', 'service', 'post')
    revalidateTag(body._type);

    return NextResponse.json({
      revalidated: true,
      tag: body._type,
      now: Date.now(),
    });
  } catch (err: any) {
    console.error('[Revalidate Webhook Error]:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
```

---

## 8. Critical Production Invariants & Troubleshooting

| Issue | Root Cause | Fix |
| :--- | :--- | :--- |
| **Presentation Tool displays blank frame** | `X-Frame-Options: DENY` or CSP blocking iframe | Remove `X-Frame-Options: DENY`. Do not block `frame-ancestors https://*.sanity.studio`. |
| **Draft Mode does not show unpublished edits** | Missing or read-only API token | Ensure `SANITY_API_READ_TOKEN` has **Viewer** or **Editor** permissions in Sanity project settings. |
| **CORS errors when fetching content** | Origin not whitelisted in Sanity | In [manage.sanity.io](https://manage.sanity.io) -> API -> CORS Origins, add your domain with **Allow credentials: Yes**. |
| **Changes not visible after publish** | Webhook not triggering revalidation | Verify webhook delivery in Sanity Management Console (status must be 200 OK). |
