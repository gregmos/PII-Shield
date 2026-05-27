/**
 * Tests for the Finnish pattern recognizers (FI_HETU, FI_BUSINESS_ID) in
 * pattern-recognizers.ts.
 * Run: npx tsx tests/finnish-recognizers-test.ts
 */

import { runPatternRecognizers } from "../src/engine/pattern-recognizers.js";

let passed = 0;
let failed = 0;
function check(cond: boolean, msg: string): void {
  if (cond) { console.log(`  ok  ${msg}`); passed++; }
  else      { console.log(`  FAIL ${msg}`); failed++; }
}

function detect(text: string, type: string) {
  return runPatternRecognizers(text).filter((e) => e.type === type);
}

// ── FI_HETU (Finnish personal identity code) ────────────────────────────────
// 131052-308T is a structurally valid HETU (control char T = 131052308 % 31).
{
  const hits = detect("Henkilötunnus: 131052-308T.", "FI_HETU");
  check(hits.length === 1 && hits[0].text === "131052-308T", "HETU detected (1900s, '-')");
  check(hits[0].score > 0.85, "HETU score boosted by 'henkilötunnus' context");
}
{
  // 2000s century marker 'A'
  const hits = detect("hetu 010104A123H", "FI_HETU");
  check(hits.length === 1 && hits[0].text === "010104A123H", "HETU detected (2000s, 'A')");
}
{
  // 1800s century marker '+'
  const hits = detect("Syntymäaika ja tunnus 290877+1234", "FI_HETU");
  check(hits.length === 1, "HETU detected (1800s, '+')");
}
{
  // Invalid day (32) must not match
  const hits = detect("320177-123A", "FI_HETU");
  check(hits.length === 0, "HETU rejects invalid day (32)");
}
{
  // Invalid month (13) must not match
  const hits = detect("011377-123A", "FI_HETU");
  check(hits.length === 0, "HETU rejects invalid month (13)");
}
{
  // Forbidden control char 'G' (not in 0-9 A-F H J-N P R-Y) must not match
  const hits = detect("131052-308G", "FI_HETU");
  check(hits.length === 0, "HETU rejects forbidden control char 'G'");
}

// ── FI_BUSINESS_ID (Y-tunnus) ───────────────────────────────────────────────
// 0201256-6 and 1572860-0 are check-digit-valid Y-tunnus values.
{
  const hits = detect("Y-tunnus: 0201256-6", "FI_BUSINESS_ID");
  check(hits.length === 1 && hits[0].text === "0201256-6", "Y-tunnus detected");
  check(hits[0].score > 0.4, "Y-tunnus score boosted by 'Y-tunnus' context");
}
{
  const hits = detect("rekisteröity, yritystunnus 1572860-0.", "FI_BUSINESS_ID");
  check(hits.length === 1 && hits[0].text === "1572860-0", "Y-tunnus detected with 'yritystunnus' context");
}
{
  // Wrong shape (6 digits) must not match
  const hits = detect("123456-7", "FI_BUSINESS_ID");
  check(hits.length === 0, "Y-tunnus rejects 6-digit shape");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
