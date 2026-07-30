#!/usr/bin/env node
/**
 * gen-harvest.mjs — generate golfnet-harvest.html from harvest-template.html
 * plus the course registry read STRAIGHT OUT OF THE SHIPPED CLIENT.
 *
 * ⭐⭐ Run this after ANY change to PARDS_COURSES, or the embedded copy in
 * golfnet-harvest.html goes stale and Bruce harvests against the wrong registry.
 *
 * ⭐⭐⭐ §verify — THE REASON THIS FILE IS TRUSTWORTHY.
 * harvest-template.html was not archived by the session that created it (s32).
 * It was REBUILT in s33 from the generated page, which means the template is a
 * reconstruction and could be subtly wrong. So the generator proves itself:
 * run with --verify <known-good.html> it regenerates and demands a BYTE-IDENTICAL
 * result against the page s32 actually produced and Bruce actually ran. That is
 * the project's own rule — verify against something you already knew, not against
 * your own new pipeline.
 *
 * Usage:
 *   node gen-harvest.mjs <client.html> <template.html> <out.html>
 *   node gen-harvest.mjs <client.html> <template.html> <out.html> --verify <known-good.html>
 * ⭐ ABSOLUTE PATHS.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'fs';

const [CLIENT, TEMPLATE, OUT] = process.argv.slice(2);
const VERIFY = process.argv.includes('--verify') ? process.argv[process.argv.indexOf('--verify') + 1] : null;
if (!CLIENT || !TEMPLATE || !OUT) {
  console.error('usage: node gen-harvest.mjs <client.html> <template.html> <out.html> [--verify <known-good.html>]');
  process.exit(2);
}
for (const f of [CLIENT, TEMPLATE].concat(VERIFY ? [VERIFY] : [])) {
  if (!fs.existsSync(f)) { console.error('MISSING: ' + f); process.exit(2); }
}

// ── read the registry from the client, by EVALUATING it, never by grepping ──
// ⭐ PARDS_COURSES is not uniformly formatted — `65` vs `65.0`, `"` vs `'`,
// rating-first vs slope-first. s32 §10: parse and compare values, never match
// formatted text. Booting the real client is the only honest way to read it.
const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
const dom = new JSDOM(fs.readFileSync(CLIENT, 'utf8'),
  { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'https://x.test/' });
const raw = dom.window.eval(`JSON.stringify(PARDS_COURSES.map(function(c){
  var o = { i:c.id, g:(c.golfNetId == null ? null : c.golfNetId), n:c.name };
  if(c.location) o.l = c.location;                       // ⭐ omitted when absent — 4 courses have no location
  o.t = (c.tees||[]).map(function(t){ return [t.name, t.rating, t.slope]; });
  return o;
}))`);
dom.window.close();

const REG = JSON.parse(raw);
const lookups = new Set(REG.filter(c => c.g != null).map(c => c.g)).size;

let html = fs.readFileSync(TEMPLATE, 'utf8');
if (html.split('__REGISTRY__').length - 1 !== 1) { console.error('template must contain exactly one __REGISTRY__'); process.exit(1); }
if (html.split('__LOOKUPS__').length - 1 !== 1) { console.error('template must contain exactly one __LOOKUPS__'); process.exit(1); }
html = html.replace('__REGISTRY__', JSON.stringify(REG)).replace('__LOOKUPS__', String(lookups));

const withGn = REG.filter(c => c.g != null).length;
const tees = REG.reduce((a, c) => a + c.t.length, 0);
console.log(`registry read from the client: ${REG.length} courses · ${withGn} with a golfNetId · ${lookups} distinct ids · ${tees} tee rows`);

// ── ⭐⭐⭐ §verify ───────────────────────────────────────────────────────────
if (VERIFY) {
  const known = fs.readFileSync(VERIFY, 'utf8');
  // The template carries an added provenance banner the s32 output cannot have;
  // strip HTML comments from BOTH sides so the comparison is of the page itself.
  const strip = s => s.replace(/<!--[\s\S]*?-->\n?/g, '');
  const a = strip(html), b = strip(known);
  if (a === b) {
    console.log(`✓ VERIFIED — regenerated output is BYTE-IDENTICAL to ${VERIFY}`);
    console.log('  The rebuilt template reproduces the page s32 generated and Bruce actually ran.');
  } else {
    console.log(`✗ MISMATCH against ${VERIFY} — ${a.length} vs ${b.length} chars`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) { console.log(`  first difference at char ${i}:\n    ours : …${a.slice(Math.max(0,i-60), i+60)}…\n    known: …${b.slice(Math.max(0,i-60), i+60)}…`); break; }
    }
    process.exit(1);
  }
}

fs.writeFileSync(OUT, html);
console.log(`wrote ${OUT}  (${html.length} chars)`);
