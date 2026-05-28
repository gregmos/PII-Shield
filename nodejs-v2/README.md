# pii-shield

> Anonymize PII in legal documents locally. Node.js CLI — 35 entity types via GLiNER NER + EU/UK/US/FI patterns. Reads `.pdf` / `.docx` / `.txt`. Pure offline, no Python.

[![npm](https://img.shields.io/npm/v/pii-shield.svg?style=flat-square)](https://www.npmjs.com/package/pii-shield) [![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](https://github.com/gregmos/PII-Shield/blob/main/LICENSE) [![Node](https://img.shields.io/badge/node-22%2B-339933.svg?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)

PII Shield reads your documents on your machine, replaces personal data with placeholders (`<PERSON_1>`, `<ORG_1>`, etc.), and — when you want analysis — sends only the anonymized text to an LLM. After analysis, PII Shield restores the original data into the final document — entirely on your machine. **PII never enters the API.**

```
Document ──> [pii-shield on your machine] ──> anonymized text ──> [LLM analyzes] ──> [pii-shield restores] ──> Result
              John Smith  → <PERSON_1>                                                <PERSON_1> → John Smith
              Acme Corp.  → <ORG_1>                                                   <ORG_1>    → Acme Corp.
```

## Install

```bash
npm install -g pii-shield
```

Requires Node 22+.

## Quick start

```bash
pii-shield doctor                                       # health check
pii-shield install-model                                # download GLiNER (~634 MB, one-off)

# anonymize one file (no review panel)
pii-shield anonymize contract.pdf --no-review

# anonymize a batch — one session, shared placeholders across files
pii-shield anonymize contracts/*.pdf attachments/*.docx

# review opens a browser (localhost:6789) with the bulk-mode panel
pii-shield review <session-id>

# restore PII back when you're done
pii-shield deanonymize contract_anonymized.pdf --session <session-id>
```

## Commands

| Command | What it does |
|---|---|
| `pii-shield anonymize <files…>` | Anonymize one or many files in one session. Shared placeholders across files. |
| `pii-shield deanonymize <file>` | Restore PII. Session id read from `.docx` metadata, `--session`, or latest. |
| `pii-shield scan <file> [--json]` | Preview detected entities without writing anything. |
| `pii-shield review <session-id>` | Re-open the HITL review panel for a session. |
| `pii-shield sessions list` / `show` / `find` / `export` / `import` | Inspect and hand off sessions across machines. |
| `pii-shield install-model [--yes]` | Download/extract the GLiNER ONNX model. |
| `pii-shield doctor [--json]` | Check Node, deps, model, paths. |

See `pii-shield --help <command>` or the [full CLI manual](https://github.com/gregmos/PII-Shield/blob/main/nodejs-v2/cli/USAGE.md) for every flag.

## What it detects

33 entity types — 4 NER classes (`PERSON`, `ORGANIZATION`, `LOCATION`, `NRP`) plus 29 pattern-based recognizers:

- **Generic**: email, phone, URL, IP, ID doc, credit card, IBAN, crypto, medical licence
- **US**: SSN, passport, driver licence
- **UK**: NIN, NHS, passport, CRN, driving licence
- **EU-wide**: VAT, passport
- **Country-specific**: DE (tax ID, social security), FR (NIR, CNI), IT (fiscal code, VAT), ES (DNI, NIE), CY (TIC, ID card)

Authoritative list: [`src/engine/entity-types.ts`](https://github.com/gregmos/PII-Shield/blob/main/nodejs-v2/src/engine/entity-types.ts).

## Highlights

- **GLiNER zero-shot NER** ([`knowledgator/gliner-pii-base-v1.0`](https://huggingface.co/knowledgator/gliner-pii-base-v1.0)) over `onnxruntime-node` + `@xenova/transformers`. Handles ALL-CAPS, domain-specific names, multilingual text. Pure JS — no Python, no PyTorch.
- **Entity deduplication** — "Acme" → `<ORG_1>`, "Acme Corp." → `<ORG_1a>`, "Acme Corporation" → `<ORG_1b>`. Canonical form picked once; every variant maps back to the same real value on deanonymize.
- **Multi-file sessions** — anonymize N related files in one batch; identical entities share the same placeholder across files. One `deanonymize` call restores PII everywhere.
- **Cross-session deanonymize** — every anonymized `.docx` carries its `session_id` in Word custom properties. Weeks later in a fresh shell: `pii-shield deanonymize file_anonymized.docx` — no need to remember the id.
- **Team handoff** — `pii-shield sessions export <id> --passphrase` ships an encrypted `.pii-session` archive (AES-GCM via scrypt). Colleague runs `import` — PII never transits.
- **HITL review** — `pii-shield review <session-id>` opens a local browser panel for false-positive removal and missed-entity addition. SSH / headless users use `--no-review`.
- **Audit log** — every CLI call appended to `~/.pii_shield/audit/mcp_audit.log`.

## Data layout

| Path | What lives here |
|---|---|
| `~/.pii_shield/models/` | GLiNER model (~634 MB) |
| `~/.pii_shield/deps/installs/<slug>/` | Pinned runtime deps (`onnxruntime-node`, `@xenova/transformers`, `gliner`) — installed lazily on first NER call |
| `~/.pii_shield/mappings/` | Per-session placeholder ↔ real-PII maps (0o700 on POSIX; TTL via `PII_MAPPING_TTL_DAYS`, default 7 days) |
| `~/.pii_shield/audit/` | Append-only audit logs |

The first ever `anonymize` call runs `npm ci --ignore-scripts` into `deps/installs/<slug>/` (~600 MB, 1–2 min). Subsequent calls are instant.

## Also available as a Claude Desktop / Claude Code extension

A `.mcpb` build of the same engine plugs into Claude Desktop and Claude Code with an in-chat HITL review panel. Drag the `.mcpb` from a [release](https://github.com/gregmos/PII-Shield/releases/latest) into **Settings → Extensions → Advanced Settings → Install extension**, then upload the `.skill`. Sessions are interchangeable: anonymize on the CLI, deanonymize from Claude Desktop, or vice versa — the mapping store is shared.

See the [main README](https://github.com/gregmos/PII-Shield#claude-desktop--claude-code) for the full Claude flow.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `pii-shield: command not found` after install | Node's global `bin/` isn't on `$PATH`. Run `npm root -g`, add the parent `bin/` to `PATH`. |
| First `anonymize` takes 1–2 min | Expected. NER deps installer runs `npm ci` into `~/.pii_shield/deps/installs/<slug>/`. Watch `~/.pii_shield/audit/ner_init.log`. |
| `model.onnx missing` in doctor | Run `pii-shield install-model`. Add `--yes` for non-interactive. |
| `Unsupported model IR version` | Stale pre-1.22.0 `onnxruntime-node`. Delete `~/.pii_shield/deps/` and retry. |
| Browser doesn't open during review | `open` falls back to printing the URL. Copy `http://127.0.0.1:<port>/?token=…` from the terminal manually. |

## Links

- **Repo**: <https://github.com/gregmos/PII-Shield>
- **Full CLI manual**: [`cli/USAGE.md`](https://github.com/gregmos/PII-Shield/blob/main/nodejs-v2/cli/USAGE.md)
- **Issues**: <https://github.com/gregmos/PII-Shield/issues>

## License

[MIT](https://github.com/gregmos/PII-Shield/blob/main/LICENSE) — Grigorii Moskalev.
