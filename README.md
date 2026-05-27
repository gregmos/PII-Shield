<p align="center">
  <h1 align="center">🛡️ PII Shield</h1>
  <p align="center">
    <strong>Anonymize documents before Claude sees them. Restore real data after analysis.</strong>
  </p>
  <p align="center">
    <a href="https://github.com/gregmos/PII-Shield/stargazers"><img src="https://img.shields.io/github/stars/gregmos/PII-Shield?style=flat-square&color=yellow" alt="GitHub Stars"></a>
    <a href="https://github.com/gregmos/PII-Shield/network/members"><img src="https://img.shields.io/github/forks/gregmos/PII-Shield?style=flat-square" alt="GitHub Forks"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License: MIT"></a>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-22%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 22+"></a>
  </p>
</p>

---

PII Shield reads your documents locally, replaces all personal data with placeholders (`<PERSON_1>`, `<ORG_1>`, etc.), and — when you want analysis — sends only the anonymized text to an LLM. After analysis, PII Shield restores the original data into the final document — entirely on your machine. **PII never enters the API.**

```
Document ──> [PII Shield on your machine] ──> anonymized text ──> [LLM analyzes] ──> [PII Shield restores] ──> Result
              John Smith  → <PERSON_1>                                                <PERSON_1> → John Smith
              Acme Corp.  → <ORG_1>                                                   <ORG_1>    → Acme Corp.
```

Two ways to use it, sharing the same engine:

| Form | Who it's for | Install |
|---|---|---|
| **Standalone CLI** (`pii-shield`) | Anyone — anonymize files locally for any LLM (or just for compliance / GDPR). Pure offline. | `npm install -g pii-shield` |
| **Claude Desktop / Code extension** (`.mcpb` + `.skill`) | Claude Desktop and Claude Code users — get tools + skill + in-chat HITL panel. | Drag the `.mcpb` from a release into Settings → Extensions, then upload the `.skill` |

> **v2 is a complete Node.js rewrite.** The original Python product is still available — see [What happened to v1?](#what-happened-to-v1) below.

## Features

| | Feature | Details |
|:-:|---------|---------|
| 🔒 | **Zero PII in API** | `anonymize_file` reads the document on your machine and returns only a file path + session id. Claude reads the anonymized file from disk — PII never enters an API request. |
| 🧠 | **GLiNER zero-shot NER** | [`knowledgator/gliner-pii-base-v1.0`](https://huggingface.co/knowledgator/gliner-pii-base-v1.0) over `onnxruntime-node` + `@xenova/transformers` (pinned triplet 1.22.0, deterministic `npm ci`). Handles ALL-CAPS, domain-specific names, multilingual text. No Python, no PyTorch. |
| 👤 | **Human-in-the-Loop review** | MCP Apps iframe UI rendered directly in Claude Desktop. Remove false positives, add missed entities — all occurrences updated automatically, no localhost browser detour. |
| 📄 | **PDF + DOCX + plain text** | `.pdf`, `.docx` (formatting + tracked changes preserved), `.txt`, `.md`, `.csv`. Pure-JS `.docx` pipeline — reads, edits, restores without a Word / LibreOffice install. |
| 🇪🇺 | **17 EU + UK pattern recognizers** | UK (NIN, NHS, passport, CRN, driving licence), DE (tax ID, social security), FR (NIR, CNI), IT (fiscal code, VAT), ES (DNI, NIE), CY (TIC, ID card), EU-wide (VAT, passport) — on top of the generic pack (email, phone, IBAN, credit card, crypto, US IDs, medical licence). 33 entity types in total. |
| 🔗 | **Entity deduplication** | "Acme" → `<ORG_1>`, "Acme Corp." → `<ORG_1a>`, "Acme Corporation" → `<ORG_1b>`. Canonical form picked once; every variant maps back to the same real value on deanonymize. |
| 💾 | **Cross-session deanonymize** | Each anonymized `.docx` carries its `session_id` in Word custom properties. Weeks later, in a brand new chat, drop the file in and `deanonymize_docx` restores PII from the embedded id — nothing to remember. |
| 📦 | **Multi-file sessions** | Anonymize N related documents under one `session_id`; identical entities share the same placeholder across files. One `deanonymize_text` / `deanonymize_docx` call restores PII everywhere. |
| 🤝 | **Team handoff** | `export_session(passphrase)` packs the mapping + anonymized documents into an encrypted `.pii-session` archive (AES-GCM via scrypt). Colleague runs `import_session` with the passphrase — PII never transits. |
| 📊 | **Audit logging** | Every tool call + response logged locally to `~/.pii_shield/audit/mcp_audit.log`. NER bootstrap trace, session lifecycle, dropped stderr — all on disk, appendable, off-network. |

## Standalone CLI — `pii-shield`

If you don't use Claude Desktop / Claude Code, install the CLI globally and run it on any file. Works on **20–30 documents in one session** with shared placeholders across files.

```bash
npm install -g pii-shield

pii-shield doctor                                       # health check
pii-shield install-model                                # download GLiNER (~634 MB, one-off)

# anonymize one file
pii-shield anonymize contract.pdf --no-review

# anonymize a batch — same session_id, same placeholders for shared entities
pii-shield anonymize contracts/*.pdf attachments/*.docx

# review opens a browser (localhost:6789) with the bulk-mode panel
pii-shield review 2026-04-29_101617_9f40

# restore PII back when you're done
pii-shield deanonymize contract_anonymized.pdf --session 2026-04-29_101617_9f40
```

| Command | What it does |
|---|---|
| `pii-shield anonymize <files…>` | Anonymize one or many files in one session. Shared placeholders across files. |
| `pii-shield deanonymize <file>` | Restore PII. Session id read from `.docx` metadata, `--session`, or latest. |
| `pii-shield scan <file> [--json]` | Preview detected entities without writing anything. |
| `pii-shield review <session-id>` | Re-open the HITL review panel for a session. |
| `pii-shield sessions list` / `show` / `export` / `import` | Inspect and hand off sessions across machines. |
| `pii-shield install-model [--yes]` | Download/extract the GLiNER ONNX model. |
| `pii-shield doctor [--json]` | Check Node, deps, model, paths. |

The CLI uses the same engine, mappings, and audit log as the MCP variants. Sessions are interchangeable: anonymize on the CLI, deanonymize from Claude Desktop, or vice versa — the mapping store is shared (`~/.pii_shield/mappings/`). Requires Node 22+.

## Claude Desktop / Claude Code

### Prerequisites

- [Claude Desktop](https://claude.ai/download) (any recent version)
- Windows or Linux: Claude Desktop ships a compatible Node runtime. Nothing to install separately.
- macOS: the macOS `.mcpb` below bundles its own Node 24.15.0. Nothing to install separately.

**No terminal commands. No model download upfront.** PII Shield handles model install in-chat via a panel that appears the first time you anonymize.

### Step 1 — download the artefacts

Pick the `.mcpb` for your OS plus the skill bundle:

| File | What | OS |
|---|---|---|
| [`pii-shield-v2.1.0-windows-linux.mcpb`](https://github.com/gregmos/PII-Shield/releases/download/v2.1.0/pii-shield-v2.1.0-windows-linux.mcpb) | ~700 KB — uses host Node | **Windows / Linux** |
| [`pii-shield-v2.1.0-macos.mcpb`](https://github.com/gregmos/PII-Shield/releases/download/v2.1.0/pii-shield-v2.1.0-macos.mcpb) | ~83 MB — bundles Node 24.15.0 | **macOS** (arm64 + x64) |
| [`pii-contract-analyze.skill`](https://github.com/gregmos/PII-Shield/releases/download/v2.1.0/pii-contract-analyze.skill) | ~25 KB — contract analysis skill | any |

### Step 2 — install the MCP extension

Claude Desktop → **Settings → Extensions → Advanced Settings → Install extension** → select your `.mcpb`.

On the first tool call PII Shield runs `npm ci --ignore-scripts` to install a pinned, deterministic set of runtime deps (`onnxruntime-node`, `@xenova/transformers`, `gliner`) into `~/.pii_shield/deps/installs/<slug>/`. 2–3 minutes once per machine, instant thereafter.

### Step 3 — upload the skill

Claude Desktop → **Customize → Skills → + → Upload a skill** → select `pii-contract-analyze.skill`.

The skill orchestrates the end-to-end contract anonymization + analysis flow — Claude uses it to drive `anonymize_file` → HITL review → analysis → `deanonymize_docx` without you spelling out each step.

### Step 4 — use it

1. Start a new conversation in Claude Desktop
2. Select the **pii-contract-analyze** skill
3. **Connect a folder** containing your document (click the folder icon)
4. Tell Claude what you need:

```
Analyze risks for the purchaser in contract.pdf and prepare a short memo
```

#### First-run install panel

The very first time you ask Claude to anonymize anything, PII Shield notices the NER model isn't on disk yet and opens an **in-chat install panel**. You see two buttons:

1. **Download model** — opens your default browser, downloads `gliner-pii-base-v1.0.zip` (~634 MB) from the release. Browser handles the transfer (no Defender / SmartScreen issues with unsigned scripts).
2. **Install downloaded ZIP** — PII Shield finds the ZIP in your Downloads / OneDrive / Desktop / Documents folder, validates it, atomic-extracts it into `~/.pii_shield/models/`, and re-initializes NER. Anonymization continues automatically.

No terminal, no scripts. Subsequent runs skip the panel entirely.

> ⚠️ **Do NOT attach files directly to anonymize.** When you attach a file, Claude Desktop sends its content in the API request — Claude sees raw data before PII Shield can process it. **Connect a folder** instead — Claude only gets the file path and calls `anonymize_file` locally.

## Privacy architecture

Only **file paths** and **random session IDs** flow through the API. All anonymization and restoration happens locally.

| Stage | What happens | PII in API? |
|-------|-------------|:-----------:|
| **Anonymize** | Server reads file on host, writes anonymized text to disk, returns `output_path` | ❌ |
| **Claude reads** | Claude reads anonymized `.txt` — only sees placeholders | ❌ |
| **Review** | User reviews entities in MCP Apps iframe (rendered in Claude Desktop) | ❌ |
| **Re-anonymize** | Server applies user corrections internally | ❌ |
| **Deanonymize** | Server writes restored file to disk, returns only the path | ❌ |
| **Deliver** | Claude gives user the file path. Never reads the restored file. | ❌ |

## Human-in-the-Loop review

After anonymization, Claude offers a review step rendered directly in Claude Desktop via [MCP Apps](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#mcp-apps):

1. Claude calls `start_review` — Claude Desktop opens a panel inside the conversation
2. Full document with **color-coded entity highlights**
3. **Remove false positives** — click any entity (all occurrences removed)
4. **Add missed entities** — select text, choose type (all occurrences added)
5. **Approve** — Claude calls `apply_review_overrides`, the server re-anonymizes with your corrections

No localhost web server, no browser detours — the UI is a Vite single-file iframe served to Claude Desktop as a `ui://` MCP resource.

## Cross-session deanonymize

Every anonymized `.docx` PII Shield writes carries its `session_id` inside Word custom document properties (`docProps/custom.xml`). Later, in a brand new chat, you can:

1. Drop the anonymized `.docx` into a connected folder — no need to remember the session id, no screenshots of placeholders, nothing.
2. Ask Claude to "restore PII in this file."
3. PII Shield's `deanonymize_docx` reads the embedded `session_id`, looks up the mapping in `~/.pii_shield/mappings/`, and writes the restored file next to the input.

Mappings live at `~/.pii_shield/mappings/` — same root as `models/`, `deps/`, and `audit/`. The root survives plugin upgrades and `/plugin remove` because it's in the user's home dir, not Claude Desktop's per-plugin `CLAUDE_PLUGIN_DATA` (which isn't set for MCPB plugins anyway).

Time-based TTL is controlled by `PII_MAPPING_TTL_DAYS` (default: **7 days**) — the server cleans up mappings older than that on startup. Bump it for longer-lived matters (`PII_MAPPING_TTL_DAYS=90`, etc.) via Claude Desktop → Extensions → PII Shield → Settings. If a mapping is missing when you try to deanonymize, `deanonymize_docx` returns a clean error with a hint to `import_session` (see Team handoff below) rather than silently skipping entities.

Plain `.txt` / `.md` output has no place to embed metadata, so the `deanonymize_text` tool takes the `session_id` explicitly as an argument.

## Multi-file sessions

Anonymize several related documents under one `session_id`:

1. First call: `anonymize_file(path_A)` — server returns `session_id=SID123`.
2. Second call: `anonymize_file(path_B, session_id="SID123")` — PII Shield extends the same mapping. Identical entities across the two files share the **same placeholder** (`Acme Corp.` becomes `<ORG_1>` in both).
3. You write a memo in Claude that mixes placeholders from both files.
4. One `deanonymize_text(..., session_id="SID123")` call on the memo restores PII everywhere.

The `pii-contract-analyze` skill drives this automatically when the user uploads N ≥ 2 files and confirms they belong to one matter. See `plugin/skills/pii-contract-analyze/references/bulk-mode.md` for the full decision tree.

## Team handoff — export / import a session

If a colleague needs to work on the same documents without you re-sharing PII:

1. You call `export_session(session_id, passphrase)` — server packs the mapping + anonymized documents into an encrypted `.pii-session` archive (AES-GCM with a key derived from the passphrase via scrypt).
2. Send them the `.pii-session` file (email, Slack, thumb drive — it's useless without the passphrase).
3. They call `import_session(path, passphrase)` on their machine — the mapping lands under their `~/.pii_shield/mappings/` and they can now `deanonymize_docx` locally.

PII never leaves the anonymized documents in transit. The archive format is versioned (`.pii-session` v1), so future schema changes will stay readable.

## MCP tools

| Tool | Description |
|------|-------------|
| `anonymize_file` | Anonymize PII in a file (.pdf, .docx, .txt, .md, .csv). Returns `output_path` and `session_id`. |
| `anonymize_next_chunk` | Process next chunk of a large document. Call repeatedly until complete. |
| `get_full_anonymized_text` | Finalize chunked anonymization. Returns `output_path`, `session_id`, `docx_output_path`. |
| `start_review` | Open the in-conversation review panel. |
| `apply_review_overrides` | Apply reviewer corrections and re-anonymize. |
| `deanonymize_text` | Restore PII — writes to local file, returns path only. |
| `deanonymize_docx` | Restore PII in .docx preserving formatting and tracked changes. |
| `get_mapping` | Get placeholder keys and entity types (no real values). |
| `list_entities` | Server status, supported entity types, recent sessions. |
| `resolve_path` | Zero-config path resolution via marker file (maps VM paths to host paths). |
| `find_file` | Find a file by name in the configured working directory. |
| `scan_text` | Detect PII without anonymizing (preview mode). |
| `export_session` / `import_session` | Portability — hand a session between hosts. |

## Skill modes

The included `pii-contract-analyze` skill supports:

| Mode | Description |
|------|-------------|
| **MEMO** | Legal analysis memo with risk assessment |
| **REDLINE** | Tracked changes with Word-native revision marks |
| **SUMMARY** | Brief overview of key terms and obligations |
| **COMPARISON** | Side-by-side diff of two documents |
| **BULK** | Process up to 5 files with prefixed placeholders |
| **ANONYMIZE-ONLY** | Just anonymize, no analysis |

## Detected entity types

Authoritative list is `nodejs-v2/src/engine/entity-types.ts` (`SUPPORTED_ENTITIES`).

**NER-based** (GLiNER zero-shot over ONNX Runtime):
`PERSON`, `ORGANIZATION`, `LOCATION`, `NRP`

**Generic pattern-based**:
`EMAIL_ADDRESS`, `PHONE_NUMBER`, `URL`, `IP_ADDRESS`, `ID_DOC`, `CREDIT_CARD`, `IBAN_CODE`, `CRYPTO`, `MEDICAL_LICENSE`

**US**:
`US_SSN`, `US_PASSPORT`, `US_DRIVER_LICENSE`

**UK**:
`UK_NHS`, `UK_NIN`, `UK_PASSPORT`, `UK_CRN`, `UK_DRIVING_LICENCE`

**EU-wide**:
`EU_VAT`, `EU_PASSPORT`

**Country-specific**:
`DE_TAX_ID`, `DE_SOCIAL_SECURITY`, `FR_NIR`, `FR_CNI`, `IT_FISCAL_CODE`, `IT_VAT`, `ES_DNI`, `ES_NIE`, `CY_TIC`, `CY_ID_CARD`

33 types total (4 NER + 29 pattern-based).

## Logs

| Log | Location | Purpose |
|-----|----------|---------|
| **Audit** | `~/.pii_shield/audit/mcp_audit.log` | Every tool call and response. Proof that only paths and session IDs flow through the API. |
| **NER init** | `~/.pii_shield/audit/ner_init.log` | Bootstrap trace — resolved ORT paths for root / transformers / gliner, sanity-check outcome, install timings. |
| **Server** | `~/.pii_shield/audit/pii_shield_server.log` | stdout/stderr of the Node MCP server process. |

## Development

All code lives in `nodejs-v2/`. From that directory:

```bash
# Install exact-pinned dev deps
npm ci --ignore-scripts --legacy-peer-deps

# Type-check
node node_modules/typescript/bin/tsc --noEmit

# Build the thin .mcpb (Windows / Linux + darwin via platform overrides)
npm run build:plugin

# Also build the darwin-universal .mcpb (downloads Node 24.15.0 arm64 + x64)
npm run build:plugin:mac

# MCP protocol smoke test
npm run smoke

# Focused clean-install smoke for the sharp shim + transformers + gliner
npm run smoke:sharp-shim
```

<details>
<summary>Project structure</summary>

```
PII-Shield/
├── nodejs-v2/                                        # The product
│   ├── src/
│   │   ├── index.ts                                  # MCP tool handlers
│   │   ├── engine/ner-backend.ts                     # GLiNER + ONNX runtime boot
│   │   ├── docx/ pdf/ mapping/ audit/                # Document pipelines
│   │   └── portability/                              # session export/import
│   ├── plugin/
│   │   ├── build-plugin.mjs                          # thin .mcpb builder
│   │   ├── build-mac-binary.mjs                      # darwin-universal .mcpb builder (bundles Node 24.15.0)
│   │   └── skills/
│   │       ├── pii-contract-analyze/                 # canonical skill source (SKILL.md + references/*.md)
│   │       └── pii-contract-analyze.zip              # release artefact — auto-rebuilt from the source dir by build-plugin.mjs
│   ├── scripts/
│   │   ├── smoke-protocol.mjs                       # MCP protocol round-trip smoke
│   │   ├── smoke-setup-panel.mjs                    # Setup-panel + install-tool smoke
│   │   └── smoke-sharp-shim.mjs                     # Clean-install sharp-shim smoke
│   ├── manifest.json                                 # MCPB manifest (server.type=node)
│   └── package.json
├── .github/workflows/test.yml                        # Node CI (ubuntu + windows + macos, Node 22 + 24)
├── LICENSE
└── README.md
```

</details>

## Troubleshooting

| Problem | Solution |
|---------|----------|
| First run is slow | First-ever call does `npm ci` into `~/.pii_shield/deps/` (~2–3 min). Subsequent runs are instant. |
| Install panel says "ZIP not found" | Click the panel's **Download model** button first. The browser saves to `~/Downloads` by default; PII Shield also scans OneDrive variants, Desktop, Documents. If your browser saves elsewhere, set **Settings → Extensions → PII Shield → Model Downloads Folder** and click Install again. |
| Install panel doesn't appear at all | The panel needs Claude Desktop ≥ 0.10 (renders `ui://` resources). On older hosts, ask Claude to call `start_model_setup` directly, or check `~/.pii_shield/audit/pii_shield_server.log`. |
| `Unsupported model IR version: 9` | Old `onnxruntime-node` cached. Delete `~/.pii_shield/deps/` — next run reinstalls with the pinned 1.22.0 triplet. |
| `Cannot find module '../build/Release/sharp-*.node'` | `sharp` has no native addon for your platform. PII Shield's shim intercepts `sharp` loads (text-only NER doesn't use it). If you still see this, you're on an older build — upgrade to v2.1.0. |
| macOS: server immediately disconnects after install | Make sure you installed `pii-shield-v2.1.0-macos.mcpb`, not `windows-linux`. The Mac variant bundles its own Node to dodge a Claude Desktop darwin host-runtime launch bug. |
| Review panel blank | Check `~/.pii_shield/audit/pii_shield_server.log` for MCP Apps resource errors. Claude Desktop version < 0.10 doesn't render `ui://` resources. |
| Tools not appearing | Restart Claude Desktop or send any message — the tool list refreshes on reconnect. |

## What happened to v1?

v1.0.0 was a Python MCP server built on presidio + SpaCy + GLiNER/py, shipped as a `.dxt` bundle. It's still available:

- Tag [`v1.0.0`](https://github.com/gregmos/PII-Shield/releases/tag/v1.0.0) — pinned source.
- Branch `python-legacy` — full tree before the Node.js rewrite.

v2 is a complete architectural reset — Node.js, pure-JS `.docx`, MCP Apps UI, thin `.mcpb` — not a drop-in upgrade.

## Acknowledgments

PII Shield builds on excellent open-source projects:

- **[GLiNER](https://github.com/urchade/GLiNER)** + [`knowledgator/gliner-pii-base-v1.0`](https://huggingface.co/knowledgator/gliner-pii-base-v1.0) — zero-shot NER backbone.
- **[onnxruntime-node](https://github.com/microsoft/onnxruntime)** — the CPU inference engine.
- **[`@xenova/transformers`](https://github.com/xenova/transformers.js)** — tokenizer + HF weights loader on top of ONNX Runtime.
- **[docx](https://github.com/dolanmiu/docx)** + **[jszip](https://stuk.github.io/jszip/)** + **[@ansonlai/docx-redline-js](https://github.com/ansonlai/docx-redline-js)** — pure-JS `.docx` read / write / track-changes.
- **[Claude Desktop](https://claude.ai/download)** + the [Model Context Protocol](https://modelcontextprotocol.io) — host runtime and tool surface.

## Author

**Grigorii Moskalev** — [LinkedIn](https://www.linkedin.com/in/grigorii-moskalev/)

## License

[MIT](LICENSE)
