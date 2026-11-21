/**
 * Production Runtime Contract Test Template (ADR 0007 Standard)
 *
 * Requirements:
 * 1. Run via native Node.js test runner: node --test tests/*.test.mjs
 * 2. Assert the RUNTIME return contracts of data layer functions or static datasets.
 * 3. NEVER validate dynamic content by running regex on .tsx source code (fs.readFileSync).
 *    Regex searches on components pass even when the browser renders stale or shadowed data!
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Import domain contracts and normalization utilities
import { FALLBACK_SERVICES } from '../src/data/services.js';

test('Dual-Tier Fallback Contract: Every fallback service satisfies the runtime presentation schema', () => {
  assert.ok(Array.isArray(FALLBACK_SERVICES), 'FALLBACK_SERVICES must be an array');
  assert.ok(FALLBACK_SERVICES.length > 0, 'FALLBACK_SERVICES must not be empty');

  for (const item of FALLBACK_SERVICES) {
    // 1. Mandatory Identity & Routing fields
    assert.ok(item.id, `Service missing id: ${JSON.stringify(item)}`);
    assert.ok(item.slug, `Service missing slug: ${item.id}`);
    assert.match(item.slug, /^[a-z0-9-]+$/, `Slug must be kebab-case: ${item.slug}`);

    // 2. Mandatory Presentation fields
    assert.ok(item.name && item.name.trim().length > 3, `Service name must be non-empty string: ${item.id}`);
    assert.strictEqual(typeof item.price, 'number', `Service price must be a number: ${item.id}`);
    assert.ok(item.price >= 0, `Service price cannot be negative: ${item.id}`);

    // 3. ADR 0007 Field Semantic Disambiguation
    // Verify dedicated cardDescription exists and is distinct from hero copy
    if (item.cardDescription) {
      assert.strictEqual(typeof item.cardDescription, 'string');
      assert.ok(
        item.cardDescription.length <= 300,
        `cardDescription should be a concise teaser (<= 300 chars), not a whole page hero: ${item.id}`
      );
    }

    // 4. Placeholder / Draft Copy Guard
    // Strictly prevent placeholder text from leaking into customer-facing copy
    assert.doesNotMatch(
      item.name,
      /\b(?:TODO|TBD|lorem ipsum)\b/i,
      `Service name must not contain placeholder copy: ${item.name}`
    );
    if (item.cardDescription) {
      assert.doesNotMatch(
        item.cardDescription,
        /\b(?:TODO|TBD|lorem ipsum)\b/i,
        `cardDescription must not contain placeholder copy: ${item.cardDescription}`
      );
    }
  }
});

test('Anti-Shadowing Invariant: Presentation components must NOT export internal fallback datasets', async () => {
  // If verifying component source code, ensure it does NOT declare static fallback arrays
  const fs = await import('node:fs');
  const path = await import('node:path');

  const componentPath = path.resolve(process.cwd(), 'src/components/ServiceGrid.tsx');
  if (fs.existsSync(componentPath)) {
    const compSrc = fs.readFileSync(componentPath, 'utf8');

    // Reject in-component fallback array declarations
    assert.doesNotMatch(
      compSrc,
      /const\s+[A-Z_]*FALLBACK[A-Z_]*\s*=\s*\[/,
      'Component must not declare static fallback arrays (violates ADR 0007 anti-shadowing)'
    );
    assert.doesNotMatch(
      compSrc,
      /const\s+SERVICES\s*=\s*\[/,
      'Component must not hardcode static SERVICES array (violates ADR 0007 anti-shadowing)'
    );
  }
});
