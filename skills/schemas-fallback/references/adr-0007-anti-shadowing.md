# 0007. Unified Content Resolution and Anti-Shadowing Architecture

- **Status**: Accepted
- **Date**: 2026-11-05
- **Authors**: 5-Star Architecture Team
- **Deciders**: Product Owner, Technical Lead, Lead Architect

## Context and Problem Statement

In our Dual-Tier architecture (Sanity Studio CMS + static fallbacks in `web/src/data/*.ts`), static fallbacks are designed to serve as an immutable reliability floor ensuring zero downtime and 100% availability.

However, a recurring engineering defect emerged: **fallback shadowing**.
1. **In-Component Duplicate Fallbacks:** UI components (such as `ServiceCategories.tsx`, `HeroQuickBookingCard.tsx`, `CategoryNavigator.tsx`) hardcoded their own internal fallback arrays (`const SERVICE_CATEGORIES = [...]`, `const categoryMap = {...}`).
2. **Priority Inversion & Silent Shadowing:** When pages fetched data via `getServiceCategories()` in `api.ts`, dynamic objects were passed into the component as props. Inside the component, resolution logic like:
   ```typescript
   desc: d.subtitle || fallback?.desc || ''
   ```
   resulted in `d.subtitle` taking precedence over the component's `fallback.desc`. Because `d.subtitle` was already populated (with a landing page hero subhead), freshly revised static copy in `fallback.desc` was silently shadowed and never rendered in the browser.
3. **Semantic Field Overloading:** Fields were conflated across contexts. For example, `subtitle` was overloaded to mean both the hero subheadline of a dedicated category landing page (`/services/consulting`) AND the teaser card text on the homepage (`/`).
4. **False Test Verification:** Automated tests checked for the presence of revised text using raw AST/regex searches against component source files (`fs.readFileSync(compPath)`). Because the text existed in the dead in-component fallback array, tests passed with 100% success while the browser continued serving stale text.

## Considered Options

1. **Option 1: Ad-hoc In-Component Checks (`??`, ternaries, manual flags).**
   Keep fallback dictionaries inside components and patch individual fallback expressions (e.g. `d.cardDesc || fallback?.desc || d.subtitle`).
   *Drawback:* Fragile, duplicates data across files, does not eliminate shadowing, and encourages future agents to recreate the same bug.

2. **Option 2: Single Normalization Boundary & Pure Presentation Components.**
   Enforce strict architectural decoupling:
   - Prohibit all in-component fallback datasets. All static data must live strictly in `web/src/data/*.ts`.
   - 100% of field-level merging, fallback resolution, and data normalization happens exclusively in the Data Access Layer (`web/src/lib/sanity/api.ts`).
   - UI components become pure presentation components that render strictly typed, normalized props without inline fallback merging.
   - Distinct display contexts must use distinct domain fields (`cardDescription` for teaser cards vs `heroSubtitle` for landing heroes).
   - Automated tests must validate data resolver outputs (`getServiceCategories()`, `getSpecialists()`), not grep `.tsx` source code.

## Decision Outcome

Chosen option: **Option 2 (Single Normalization Boundary & Pure Presentation Components)**.

### Architectural Rules & Invariants

1. **Zero In-Component Fallbacks:**
   - UI components must NEVER declare internal static datasets (e.g. `const SERVICE_CATEGORIES = [...]`, `const categoryMap = {...}`).
   - UI components receive normalized props and render them directly. No `prop.field || localFallback.field` in presentation JSX.

2. **Single Normalization Boundary (`web/src/lib/sanity/api.ts`):**
   - The Data Access Layer (`api.ts`) is the ONLY place where Sanity documents are merged with static datasets from `web/src/data/`.
   - When a function like `getServiceCategories()` returns an array, every item is guaranteed to be complete, validated, and ready for rendering.

3. **Field Semantic Disambiguation:**
   - Distinct content purposes require distinct fields in domain types and CMS schemas:
     - `cardDescription`: concise teaser for homepage grids and catalog cards.
     - `heroSubtitle`: primary narrative subhead on dedicated landing pages.
   - Never overload a single field to drive two fundamentally different UI presentations.

4. **Runtime Contract-Based Verification:**
   - Automated tests in `web/tests/` must test the return values of resolver functions (`getServiceCategories()`, `getSpecialists()`, `getServices()`) under both Sanity-connected and fallback modes.
   - Relying solely on `fs.readFileSync(componentPath).includes("text")` is prohibited as a primary test assertion for dynamic content.

### Positive Consequences

- Eliminates silent shadowing: updates to static copy in `web/src/data/` immediately propagate to the UI without being blocked by competing in-component fallbacks.
- Single Source of Truth: content editors and developers only have one place (`web/src/data/*.ts` or Sanity Studio) to review and update content.
- Clean presentation components: reduces component file sizes and complexity by removing duplicate fallback dictionaries.
- High test confidence: unit tests verify the exact data structures passed into React trees at runtime.

### Negative Consequences / Trade-offs

- Requires refactoring existing components (`ServiceCategories.tsx`, `HeroQuickBookingCard.tsx`, `CategoryNavigator.tsx`) to remove hardcoded in-component datasets.
- Requires adding `cardDescription` (or corresponding disambiguated fields) to `SERVICE_PAGES_DATA` and `ServiceCategorySummary`.

## Compliance & Invariants

1. **Automated Verification:** Added to `AGENTS.md` core rules and `skills/schemas-fallback/SKILL.md`.
2. **Code Review Gate:** Code reviews must reject any new in-component fallback dictionary or `prop || localFallback` pattern in `.tsx` files.
3. **Data Contract Tests:** Verified via `node --test tests/*.test.mjs` asserting resolver output properties directly.

## References

- [Canonical API Resolver Example](../examples/canonical-api-resolver.ts)
- [Pure Presentation Component Example](../examples/pure-presentation-component.tsx)
- [Runtime Contract Test Template](../examples/contract-test-template.mjs)
- [Schemas & Fallback Skill Specification](../SKILL.md)
