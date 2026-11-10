---
name: portable-text
description: Convert, serialize, and render Sanity Portable Text across formats and frameworks. Use when converting Markdown or HTML to Portable Text (via @portabletext/markdown or @portabletext/block-tools), manually constructing PT blocks, rendering Portable Text in React/Next.js, Vue, Svelte, Astro, serializing to HTML/Markdown, extracting plain text, or configuring custom components for marks, block styles, and embeds.
license: MIT
metadata:
  author: sanity
  version: "1.0.0"
---

# Sanity Portable Text (Conversion & Serialization)

Portable Text (PT) is a JSON-based rich text specification used by Sanity. This skill covers the complete lifecycle of Portable Text:
1. **Ingestion / Conversion** (Markdown, HTML, or raw data → Portable Text)
2. **Rendering / Serialization** (Portable Text → React, Next.js, HTML, Markdown, Plain Text)

---

## 1. Portable Text Structure (Specification)

Portable Text is an array of blocks:

```json
[
  {
    "_type": "block",
    "_key": "abc123",
    "style": "normal",
    "children": [
      {"_type": "span", "_key": "def456", "text": "Hello ", "marks": []},
      {"_type": "span", "_key": "ghi789", "text": "world", "marks": ["strong"]}
    ],
    "markDefs": []
  },
  {
    "_type": "block",
    "_key": "jkl012",
    "style": "h2",
    "children": [
      {"_type": "span", "_key": "mno345", "text": "A heading", "marks": []}
    ],
    "markDefs": []
  },
  {
    "_type": "image",
    "_key": "pqr678",
    "asset": {"_type": "reference", "_ref": "image-abc-200x200-png"}
  }
]
```

### Key Invariants:
- Every block and span requires a unique `_key`.
- `_type: "block"` is standard rich text; custom embeds/objects specify their own `_type` (e.g. `image`, `codeBlock`, `callout`).
- **Decorators**: simple string marks like `"strong"`, `"em"`, `"underline"`, `"code"`.
- **Annotations**: mark keys matching an item in `markDefs[]` (e.g., links, internal document references).
- **Lists**: `listItem: "bullet" | "number"` with `level: 1, 2, ...` on regular blocks.

---

## 2. Ingestion & Conversion (To Portable Text)

When migrating content or building ingestion pipelines into Sanity:

| Source Format | Approach / Package | Rule File |
| :--- | :--- | :--- |
| **Markdown** | `markdownToPortableText` via `@portabletext/markdown` | `rules/markdown-to-pt.md` |
| **HTML** | `htmlToBlocks` via `@portabletext/block-tools` | `rules/html-to-pt.md` |
| **Custom / DB** | Programmatic block & span generation | `rules/manual-construction.md` |

> **Note:** Use `@portabletext/block-tools` (not the deprecated legacy `@sanity/block-tools`).

---

## 3. Serialization & Rendering (From Portable Text)

When displaying or converting Portable Text in frontends:

### Standard Component Mapping Pattern:
All `@portabletext/*` libraries take a `components` mapping:

| Key | Purpose | Component Props |
| :--- | :--- | :--- |
| `types` | Custom block/inline objects (`image`, `table`, etc.) | `{ value, isInline }` |
| `marks` | Custom decorators and annotations (`link`, `internalLink`) | `{ children, value }` |
| `block` | Block style wrappers (`h1`, `h2`, `blockquote`, `normal`) | `{ children, value }` |
| `list` | List element wrappers (`ul`, `ol`) | `{ children, value }` |
| `listItem` | List item wrappers (`li`) | `{ children, value }` |
| `hardBreak` | Line breaks within a block | `() => <br />` |

### Framework Rules:
- **React / Next.js**: `rules/react.md` — `@portabletext/react` or `next-sanity`
- **Plain Text Extraction**: `rules/plain-text.md` — `@portabletext/toolkit` (useful for search indexation, meta descriptions)
- **HTML (SSR string output)**: `rules/html.md` — `@portabletext/to-html`
- **Markdown (PT → Markdown)**: `rules/markdown.md` — `@portabletext/markdown`
- **Vue / Nuxt**: `rules/vue.md` — `@portabletext/vue`
- **Svelte / SvelteKit**: `rules/svelte.md` — `@portabletext/svelte`
- **Astro**: `rules/astro.md` — `astro-portabletext`

---

## 4. Best Practices for Next.js 15 & Sanity

1. **Memoize or define `components` statically**:
   Define your Portable Text components object outside the React component tree to avoid re-renders.
2. **Handle missing components**:
   Provide fallbacks or handle unknown custom types gracefully to prevent hydration mismatches.
3. **GROQ Reference Expansion**:
   Always dereference custom block assets and link references in your GROQ queries:
   ```groq
   content[]{
     ...,
     _type == "image" => { ..., asset-> },
     markDefs[]{
       ...,
       _type == "internalLink" => { ..., "slug": @.reference->slug.current }
     }
   }
   ```
