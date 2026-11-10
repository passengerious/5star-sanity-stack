# 5-Star Sanity & Fallback Architecture Rules (ADR 0007 Standard)

These rules apply across all projects utilizing the 5-Star Sanity CMS + Next.js App Router stack.

## 1. Single Normalization Boundary & Fallback Architecture (ADR 0007)

- **Single Source of Truth in Code:** All static domain fallback datasets must reside exclusively in data modules (e.g., `web/src/data/*.ts`), never embedded inside UI component files.
- **Single Normalization Boundary:** 100% of field-level merging, fallback resolution, and fallback ordering must occur in the Data Access Layer (e.g., `web/src/lib/sanity/api.ts` or dedicated query normalization functions).
- **Zero In-Component Fallbacks (Anti-Shadowing):** UI components must be pure presentation components. Never declare static fallback datasets (e.g., `const CLINICAL_DIRECTIONS = [...]`, `const servicesFallback = {...}`) or inline fallback chaining (`prop.value || localFallback.value`) inside `.tsx` presentation components. In-component fallbacks cause stale upstream CMS objects to silently shadow newer code updates.
- **Field Semantic Separation:** Distinct visual contexts must use distinct domain fields. Never overload a single field (e.g. `subtitle`) to drive both a landing page hero subhead and a homepage teaser card. Explicitly define dedicated fields (e.g. `cardDescription` vs `heroSubtitle`).

## 2. Test Validity & Runtime Verification

- **Runtime Contract Tests:** Never validate dynamic content by running static regex searches on `.tsx` component source code (`fs.readFileSync`). Automated contract tests must invoke and assert the output of data access resolvers (e.g. `getMedicalDirections()`, `getDoctors()`, `getServices()`) to verify that the runtime data contract is satisfied under both live CMS and fallback states.
- **Verification Standard:** Never mark a coding task done without running tests and `pnpm build` to verify that TypeScript compilation and page generation succeed with 0 errors.

## 3. CMS-First Evolution (SSOT Invariant)

- **Sanity Cloud as SSOT:** Sanity Cloud is the definitive Single Source of Truth for production content. Fallbacks serve strictly as an immutable reliability floor.
- **Data Synchronization:** When adding or updating entities, prioritize publishing/syncing the documents in Sanity Content Lake (via Studio or CLI sync scripts in `studio/scripts/`) so the CMS natively supplies the canonical data.
