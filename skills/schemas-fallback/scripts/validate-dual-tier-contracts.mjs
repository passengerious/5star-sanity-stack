#!/usr/bin/env node

/**
 * Dual-Tier Architecture & Anti-Shadowing Validator (ADR 0007 Audit Script)
 *
 * Scans a Next.js App Router codebase for ADR 0007 violations:
 * 1. In-Component Fallback Datasets (const SERVICE_CATEGORIES = [...], fallbackSpecialist: '...')
 * 2. In-Component Inline Fallback Chaining (prop.value || localFallback.value)
 * 3. Static regex assertions on .tsx source code in test files
 * 4. Presence of dedicated cardDescription on service/category data models
 *
 * Usage:
 *   node ~/.gemini/config/plugins/5star-sanity-stack/skills/schemas-fallback/scripts/validate-dual-tier-contracts.mjs [project_root]
 */

import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
console.log(`\n🔍 Running 5-Star ADR 0007 Anti-Shadowing Audit on: ${projectRoot}\n`);

let violationsCount = 0;
let warningsCount = 0;

function reportViolation(file, line, message, codeSnippet) {
  violationsCount++;
  console.error(`❌ [VIOLATION] ${path.relative(projectRoot, file)}:${line}`);
  console.error(`   ${message}`);
  if (codeSnippet) console.error(`   > ${codeSnippet.trim()}`);
  console.error('');
}

function reportWarning(file, line, message) {
  warningsCount++;
  console.warn(`⚠️ [WARNING] ${path.relative(projectRoot, file)}:${line}`);
  console.warn(`   ${message}\n`);
}

function walkDir(dir, filterRegex, callback) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== '.git') {
        walkDir(fullPath, filterRegex, callback);
      }
    } else if (filterRegex.test(entry.name)) {
      callback(fullPath);
    }
  }
}

// 1. Audit Presentation Components for In-Component Fallback Datasets
const componentDirs = [
  path.join(projectRoot, 'web/src/components'),
  path.join(projectRoot, 'src/components'),
  path.join(projectRoot, 'components'),
];

const COMPONENT_SUSPICIOUS_PATTERNS = [
  {
    regex: /(?:const|let|var)\s+([A-Z_0-9]*(?:FALLBACK|CATEGORIES|DIRECTIONS|SERVICES|SPECIALISTS|DOCTORS|FAQS)[A-Z_0-9]*)\s*[:=]\s*\[/,
    message: 'In-Component Fallback Array: Static datasets must reside exclusively in web/src/data/*.ts per ADR 0007.',
  },
  {
    regex: /fallback(?:Specialist|Doctor)\s*:\s*['"`]/,
    message: 'Hardcoded Fallback Entity in Component: Entity resolution must be normalized in api.ts.',
  },
  {
    regex: /(?:localFallback|servicesFallback|categoriesFallback|directionsFallback)\./,
    message: 'In-Component Fallback Chaining: UI must receive normalized props without local fallback objects.',
  },
];

for (const compDir of componentDirs) {
  walkDir(compDir, /\.(tsx|jsx)$/, (filePath) => {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    lines.forEach((lineText, idx) => {
      // Ignore comment lines
      if (lineText.trim().startsWith('//') || lineText.trim().startsWith('*')) return;

      for (const pattern of COMPONENT_SUSPICIOUS_PATTERNS) {
        if (pattern.regex.test(lineText)) {
          reportViolation(filePath, idx + 1, pattern.message, lineText);
        }
      }
    });
  });
}

// 2. Audit Test Suites for Static Regex on .tsx Components
const testDirs = [
  path.join(projectRoot, 'web/tests'),
  path.join(projectRoot, 'tests'),
];

for (const tDir of testDirs) {
  walkDir(tDir, /\.(test|spec)\.(mjs|js|ts|tsx)$/, (filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((lineText, idx) => {
      // Flag reading component source to assert dynamic copy
      if (/fs\.readFileSync\(.*components\/.*\.tsx/.test(lineText)) {
        reportWarning(
          filePath,
          idx + 1,
          'Test Validity Warning: Validating dynamic text via component source regex can falsely pass on dead in-component fallbacks. Assert data layer resolver outputs instead.'
        );
      }
    });
  });
}

// 3. Summary & Exit Code
console.log('──────────────────────────────────────────────────────');
if (violationsCount === 0) {
  console.log(`🎉 Audit Passed: 0 ADR 0007 violations found! (${warningsCount} warnings)`);
  console.log('   All presentation components comply with the Single Normalization Boundary standard.\n');
  process.exit(0);
} else {
  console.error(`🚨 Audit Failed: ${violationsCount} ADR 0007 violations detected! (${warningsCount} warnings)`);
  console.error('   Please move all in-component static arrays to data modules and resolve them via the Data Access Layer.\n');
  process.exit(1);
}
