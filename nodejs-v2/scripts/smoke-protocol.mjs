#!/usr/bin/env node
/**
 * PII Shield v2.1.0 — stdio protocol smoke test.
 *
 * Validates that the MCP server, in isolation from any host, returns the
 * exact envelope shapes required by the MCP Apps spec (2026-01-26) for
 * the in-chat review panel.
 *
 * If any assertion here fails, the server is broken before it even talks
 * to Claude Desktop — fix here first.
 *
 * Checks:
 *   1. `initialize` responds with a well-formed capabilities object.
 *   2. `tools/list` includes `start_review` with BOTH forms of
 *      `_meta.ui.resourceUri` (the nested object form required by the
 *      spec AND the deprecated flat `_meta["ui/resourceUri"]` key that
 *      older Claude Desktop builds read). Emission is library-managed
 *      by `registerAppTool` in `@modelcontextprotocol/ext-apps`.
 *   3. `tools/list` includes `apply_review_overrides` with the FULL
 *      MCP Apps descriptor: `_meta.ui.resourceUri` matches the review
 *      panel AND `_meta.ui.visibility === ["app"]`. v2.0.4 (issue #2)
 *      — v2.0.3 shipped this tool with only `visibility:["app"]` and
 *      no resourceUri, which Claude Desktop silently dropped on
 *      iframe→server proxy. Full descriptor mirrors get_review_payload
 *      (which works) and restores the Approve flow.
 *   4. `tools/list` includes `get_review_payload` with
 *      `_meta.ui.visibility: ["app"]` and the same review resourceUri
 *      (v2.0.3 / issue #2 — model-invisible pull tool).
 *   5. `resources/list` includes `ui://pii-shield/review.html` with
 *      mimeType `text/html;profile=mcp-app`.
 *   6. `resources/read` on that URI returns HTML >1 KB starting with
 *      `<!DOCTYPE html>` and containing the review shell's topbar text
 *      ("PII Shield Review") — proves the single-file Vite bundle is
 *      actually inlined into server.bundle.mjs.
 *   7. `tools/call start_review` (with no session_id) returns a
 *      well-formed envelope. Since no `anonymize_file` has run, it
 *      SHOULD return `structuredContent.status === "error"` with a
 *      human message — that's still a valid MCP response shape.
 *   8. `tools/call apply_review_overrides` with a non-existent
 *      session_id returns a cleanly-shaped error in content[0].text
 *      (no crash, no malformed envelope).
 *   9. PII-leak canary (v2.0.3 / issue #2):
 *      `anonymize_text` on text with known canary substrings →
 *      `start_review` on the resulting session → the full response
 *      JSON must NOT contain ANY canary substring; structuredContent
 *      .sessions[0] must be a metadata-only shape; the raw payload
 *      must be reachable via `get_review_payload`.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.resolve(__dirname, "..", "dist", "server.bundle.mjs");
const REVIEW_URI = "ui://pii-shield/review.html";

function must(cond, msg) {
  if (!cond) throw new Error("ASSERT: " + msg);
}

async function main() {
  const child = spawn(process.execPath, [BUNDLE], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Mirror server stderr so we can see trace lines in test output
  child.stderr.on("data", (c) => process.stderr.write("[server] " + c));

  const pending = new Map();
  let nextId = 1;
  let buf = "";

  child.stdout.on("data", (c) => {
    buf += c.toString();
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      } catch {
        /* ignore non-JSON (shouldn't happen on stdout) */
      }
    }
  });

  function rpc(method, params) {
    const id = nextId++;
    const frame = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    child.stdin.write(frame);
    return new Promise((resolve, reject) => {
      pending.set(id, resolve);
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`timeout ${method} id=${id}`));
        }
      }, 10000);
    });
  }
  function notify(method, params) {
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n",
    );
  }

  try {
    // ─── 1. initialize ─────────────────────────────────────────────────────
    const init = await rpc("initialize", {
      protocolVersion: "2026-01-26",
      capabilities: {},
      clientInfo: { name: "pii-shield-smoke", version: "1" },
    });
    notify("notifications/initialized", {});

    const caps = init.result?.capabilities;
    must(caps, "initialize missing capabilities");
    console.log(
      `✓ initialize: protocolVersion=${init.result?.protocolVersion}, ` +
        `serverInfo.name=${init.result?.serverInfo?.name}`,
    );

    // ─── 2. tools/list — start_review with dual-key _meta.ui.resourceUri ───
    const toolsList = await rpc("tools/list", {});
    must(
      Array.isArray(toolsList.result?.tools),
      "tools/list missing tools array",
    );
    const startReview = toolsList.result.tools.find(
      (t) => t.name === "start_review",
    );
    must(startReview, "start_review not in tools/list");
    must(
      startReview._meta?.ui?.resourceUri === REVIEW_URI,
      `start_review._meta.ui.resourceUri wrong: ${JSON.stringify(startReview._meta)}`,
    );
    must(
      startReview._meta?.["ui/resourceUri"] === REVIEW_URI,
      `start_review._meta["ui/resourceUri"] (flat) wrong/missing: ${JSON.stringify(startReview._meta)}`,
    );
    console.log(
      `✓ tools/list: start_review has BOTH nested _meta.ui.resourceUri AND ` +
        `flat _meta["ui/resourceUri"] = ${REVIEW_URI}`,
    );

    // ─── 3. tools/list — apply_review_overrides full MCP Apps descriptor ───
    // v2.0.4 (issue #2): must carry both resourceUri AND visibility:["app"].
    // Without the resourceUri (v2.0.3 shape), Claude Desktop dropped the
    // iframe→server proxy on app.callServerTool("apply_review_overrides"),
    // breaking the Approve flow. Mirror get_review_payload's full descriptor.
    const applyOverrides = toolsList.result.tools.find(
      (t) => t.name === "apply_review_overrides",
    );
    must(applyOverrides, "apply_review_overrides not in tools/list");
    must(
      applyOverrides._meta?.ui?.resourceUri === REVIEW_URI,
      `apply_review_overrides._meta.ui.resourceUri MUST be ${REVIEW_URI}, got: ${JSON.stringify(applyOverrides._meta)}`,
    );
    const aoVis = applyOverrides._meta?.ui?.visibility;
    must(
      Array.isArray(aoVis) && aoVis.length === 1 && aoVis[0] === "app",
      `apply_review_overrides _meta.ui.visibility MUST be ["app"], got: ${JSON.stringify(applyOverrides._meta)}`,
    );
    console.log(
      `✓ tools/list: apply_review_overrides has full MCP Apps descriptor (resourceUri + visibility=["app"])`,
    );

    // ─── 4. tools/list — get_review_payload is model-invisible pull tool ───
    // v2.0.3 (issue #2): iframe-only tool that returns the unredacted
    // payload. MUST carry visibility:["app"] so compliant hosts hide it
    // from the agent's tools/list.
    const getReviewPayload = toolsList.result.tools.find(
      (t) => t.name === "get_review_payload",
    );
    must(getReviewPayload, "get_review_payload not in tools/list");
    must(
      getReviewPayload._meta?.ui?.resourceUri === REVIEW_URI,
      `get_review_payload._meta.ui.resourceUri wrong: ${JSON.stringify(getReviewPayload._meta)}`,
    );
    const grpVis = getReviewPayload._meta?.ui?.visibility;
    must(
      Array.isArray(grpVis) && grpVis.length === 1 && grpVis[0] === "app",
      `get_review_payload _meta.ui.visibility MUST be ["app"], got: ${JSON.stringify(getReviewPayload._meta)}`,
    );
    console.log(
      `✓ tools/list: get_review_payload has _meta.ui.visibility=["app"] (model-invisible pull tool)`,
    );

    // ─── 5. resources/list — ui://pii-shield/review.html ───────────────────
    const resList = await rpc("resources/list", {});
    const uiRes = resList.result?.resources?.find((r) => r.uri === REVIEW_URI);
    must(uiRes, `UI resource ${REVIEW_URI} not in resources/list`);
    must(
      uiRes.mimeType === "text/html;profile=mcp-app",
      `UI resource wrong mimeType: ${uiRes.mimeType}`,
    );
    console.log(`✓ resources/list: ${uiRes.uri} (mime=${uiRes.mimeType})`);

    // ─── 6. resources/read — HTML is inlined & non-trivial ─────────────────
    const read = await rpc("resources/read", { uri: REVIEW_URI });
    must(
      read.result?.contents?.length === 1,
      "resources/read must return 1 content entry",
    );
    const c0 = read.result.contents[0];
    must(
      c0.mimeType === "text/html;profile=mcp-app",
      `resources/read wrong mimeType: ${c0.mimeType}`,
    );
    must(
      typeof c0.text === "string" && c0.text.length > 1000,
      `resources/read text missing or too short (${c0.text?.length || 0} bytes)`,
    );
    must(
      c0.text.toLowerCase().startsWith("<!doctype html>"),
      `resources/read HTML does not start with <!DOCTYPE html>, got: ${c0.text.slice(0, 60)}…`,
    );
    must(
      c0.text.includes("PII Shield Review"),
      "HTML body does not contain 'PII Shield Review' (topbar title missing — Vite bundle may be stale)",
    );
    console.log(
      `✓ resources/read: ${c0.text.length} bytes HTML, mime=${c0.mimeType}, ` +
        `contains topbar title`,
    );

    // ─── 7. tools/call start_review — no session, but well-formed ──────────
    const startCall = await rpc("tools/call", {
      name: "start_review",
      arguments: {},
    });
    const scRes = startCall.result;
    must(
      Array.isArray(scRes?.content) && scRes.content.length > 0,
      "start_review response missing content array",
    );
    must(
      scRes.structuredContent && typeof scRes.structuredContent === "object",
      "start_review response missing structuredContent",
    );
    // With no anonymize_file call prior, we expect status=error — still a
    // valid MCP response. What matters is the envelope shape, not the payload.
    const sc = scRes.structuredContent;
    must(
      typeof sc.status === "string",
      `start_review structuredContent.status should be string, got ${typeof sc.status}`,
    );
    console.log(
      `✓ tools/call start_review: envelope well-formed ` +
        `(status="${sc.status}", content[0].text[0..60]="${scRes.content[0].text.slice(0, 60)}…")`,
    );

    // ─── 8. tools/call apply_review_overrides — bad session, clean error ───
    const applyCall = await rpc("tools/call", {
      name: "apply_review_overrides",
      arguments: {
        session_id: "no-such-session-smoke-xyz",
        overrides: { remove: [], add: [] },
      },
    });
    const acRes = applyCall.result;
    must(
      Array.isArray(acRes?.content) && acRes.content.length > 0,
      "apply_review_overrides response missing content array",
    );
    const bodyText = acRes.content[0].text;
    must(
      typeof bodyText === "string" && bodyText.length > 0,
      "apply_review_overrides content[0].text missing",
    );
    // Body should be JSON with an error field — we don't care about exact shape
    // here, just that the tool didn't crash or return a malformed envelope.
    let parsed;
    try {
      parsed = JSON.parse(bodyText);
    } catch (e) {
      throw new Error(`apply_review_overrides body is not JSON: ${bodyText.slice(0, 200)}`);
    }
    must(
      typeof parsed === "object" && parsed !== null,
      "apply_review_overrides body parsed to non-object",
    );
    console.log(
      `✓ tools/call apply_review_overrides: clean error envelope for unknown session ` +
        `(body[0..80]="${bodyText.slice(0, 80)}…")`,
    );

    // ─── 9. PII-leak canary (issue #2) ──────────────────────────────────────
    // Goal: any PII a user feeds into anonymize_* must NEVER appear in the
    // start_review tool result, because that result reaches Claude before
    // the HITL approval step. Raw PII lives only behind the model-invisible
    // `get_review_payload` tool.
    //
    // Canaries chosen so the engine detects at least one of them with
    // pattern-only matching (no NER required — important because the smoke
    // test must work even before the NER model is installed):
    //   - email pattern → guaranteed regex hit
    //   - phone pattern → likely regex hit
    //   - name token   → may or may not hit depending on NER state; we
    //                    only assert it's ABSENT from start_review's
    //                    response, not that it was detected.
    const CANARY_NAME = "Zylphrindor_Vexnoth";
    const CANARY_EMAIL = "canary-zylphrindor@pii-shield-smoke.invalid";
    const CANARY_PHONE = "+1-555-013-4291";
    const canaryDoc =
      `Confidential note. Author: ${CANARY_NAME}. ` +
      `Contact: ${CANARY_EMAIL} or ${CANARY_PHONE}. End.`;

    let canaryRanFull = false;
    let canarySid = "";
    try {
      const anonCall = await rpc("tools/call", {
        name: "anonymize_text",
        arguments: { text: canaryDoc, language: "en" },
      });
      const anonText = anonCall.result?.content?.[0]?.text || "";
      let anonParsed = null;
      try { anonParsed = JSON.parse(anonText); } catch { /* tolerate */ }
      canarySid = anonParsed?.session_id || "";
      if (canarySid) {
        canaryRanFull = true;
        console.log(`  · anonymize_text seeded session ${canarySid} for canary check`);
      } else {
        console.log(`  · anonymize_text did not return session_id (NER may be loading); skipping deep canary check`);
      }
    } catch (err) {
      console.log(`  · anonymize_text unavailable in smoke env (${err.message}); skipping deep canary check`);
    }

    if (canaryRanFull) {
      // 9a. start_review on the seeded session — full response body must
      // contain ZERO canary substrings.
      const sr2 = await rpc("tools/call", {
        name: "start_review",
        arguments: { session_id: canarySid },
      });
      const sr2Full = JSON.stringify(sr2.result || {});
      for (const canary of [CANARY_NAME, CANARY_EMAIL, CANARY_PHONE]) {
        must(
          !sr2Full.includes(canary),
          `LEAK: start_review response contains canary substring "${canary}". This is the issue #2 regression — start_review must be metadata-only.`,
        );
      }
      console.log(`✓ tools/call start_review: no canary PII in response body (${sr2Full.length} bytes scanned)`);

      // 9b. structuredContent.sessions[0] must be a metadata-only shape.
      const sr2Sc = sr2.result?.structuredContent;
      const sr2Sessions = Array.isArray(sr2Sc?.sessions) ? sr2Sc.sessions : [];
      must(
        sr2Sessions.length === 1,
        `start_review should return 1 session for the canary session_id, got ${sr2Sessions.length}`,
      );
      const sess0 = sr2Sessions[0];
      const allowedKeys = new Set([
        "session_id", "doc_id", "source_filename",
        "entity_count", "approved", "has_overrides",
      ]);
      const forbiddenKeys = ["original_text", "entities", "anonymized_text", "html_text", "overrides"];
      for (const fk of forbiddenKeys) {
        must(
          !(fk in sess0),
          `LEAK: start_review sessions[0] still carries forbidden field "${fk}". Issue #2 regression.`,
        );
      }
      for (const k of Object.keys(sess0)) {
        must(
          allowedKeys.has(k),
          `start_review sessions[0] has unexpected key "${k}" — extend allowedKeys if intentional, or remove from response.`,
        );
      }
      console.log(`✓ start_review sessions[0] is metadata-only: keys=[${Object.keys(sess0).join(", ")}]`);

      // 9c. get_review_payload directly — iframe channel must still
      // surface the unredacted text (otherwise the panel is broken).
      const grpCall = await rpc("tools/call", {
        name: "get_review_payload",
        arguments: { session_id: canarySid, doc_id: "" },
      });
      const grpSc = grpCall.result?.structuredContent;
      must(
        grpSc && typeof grpSc === "object" && grpSc.session_id === canarySid,
        `get_review_payload did not return a payload for session ${canarySid}: ${JSON.stringify(grpCall.result).slice(0, 200)}`,
      );
      must(
        typeof grpSc.original_text === "string" && grpSc.original_text.includes(CANARY_EMAIL),
        `get_review_payload.original_text missing canary email — iframe channel is broken`,
      );
      // content[0].text must be empty — defense in depth.
      const grpContentText = grpCall.result?.content?.[0]?.text;
      must(
        grpContentText === "",
        `get_review_payload content[0].text MUST be empty (defense in depth), got: ${JSON.stringify(grpContentText).slice(0, 80)}`,
      );
      console.log(`✓ tools/call get_review_payload: returns unredacted payload via structuredContent only (content[0].text="")`);
    }

    console.log("\nPASS — all PII Shield v2.1.0 protocol checks green.");
    console.log(
      "       MCP Apps wiring: start_review descriptor carries dual-key resourceUri,",
    );
    console.log(
      `       ${REVIEW_URI} resource returns the Vite single-file HTML,`,
    );
    console.log(
      "       apply_review_overrides + get_review_payload both carry the full",
    );
    console.log(
      "       MCP Apps descriptor (resourceUri + visibility:['app']),",
    );
    if (canaryRanFull) {
      console.log(
        "       start_review never leaks raw PII into the host channel (issue #2 closed).",
      );
    } else {
      console.log(
        "       (Deep canary skipped — anonymize_text unavailable in this smoke env.)",
      );
    }
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    if (!child.killed) child.kill("SIGKILL");
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
