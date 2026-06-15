# PII Shield CLI — User Guide

Standalone command-line tool that anonymizes PII in legal documents locally, sends only placeholders to any LLM (or just keeps the redacted file), and restores the real data on your machine when work is done. **PII never leaves your computer.**

Pure offline, pure Node.js. No Claude Desktop / Claude Code / cloud account required.

---

## Table of contents

1. [Install](#install)
2. [Quick start](#quick-start)
3. [Command reference](#command-reference)
4. [Configuration](#configuration)
5. [Workflows](#workflows)
6. [Multi-document batches (20–30 files)](#multi-document-batches)
7. [Working with external LLMs](#working-with-external-llms)
8. [Cross-machine handoff](#cross-machine-handoff)
9. [HITL review (browser UI)](#hitl-review)
10. [Privacy, audit, security](#privacy-audit-security)
11. [Python / scripting integration](#python--scripting-integration)
12. [Troubleshooting](#troubleshooting)
13. [Detected entity types](#detected-entity-types)
14. [Limits and caveats](#limits-and-caveats)

---

## Install

### Requirements

| | Minimum |
|---|---|
| Node.js | 18.0 or newer (`node -v`) |
| RAM | 4 GB during NER inference |
| Disk | ~1.5 GB (300 MB deps + 634 MB GLiNER model + space for outputs) |
| OS | Windows 10+, macOS 12+, Linux glibc 2.31+ |

### Install globally

```bash
npm install -g pii-shield
pii-shield --version
```

### Verify

```bash
pii-shield doctor
```

You should see a list of green `[OK]` checks. The GLiNER model check will fail on a fresh machine — that's expected. Install it next.

### Download the GLiNER model (one-off, ~634 MB)

```bash
pii-shield install-model
# > GLiNER model not found locally. Need to download ~634 MB from:
# >   https://github.com/gregmos/PII-Shield/releases/...
# > Download now? [Y/n]
```

Add `--yes` to skip the prompt (CI use).

The model lives at `~/.pii_shield/models/gliner-pii-base-v1.0/`. It survives `npm uninstall -g pii-shield` — uninstall doesn't wipe your data dir.

### First-run NER deps (~1–2 min, automatic)

The first time you run `anonymize` or `scan`, the engine installs `onnxruntime-node`, `@xenova/transformers`, `gliner` (pinned versions) into `~/.pii_shield/deps/installs/<slug>/`. About 300 MB, deterministic. Subsequent runs are instant.

---

## Quick start

```bash
# 1. Health check
pii-shield doctor

# 2. Anonymize a single file
pii-shield anonymize contract.pdf --no-review
# → contract_anonymized.txt with <PERSON_1>, <ORG_1>, ... placeholders
# → prints Session: 2026-04-29_120000_ab12

# 3. Send the placeholder version to any LLM, copy back the result
# (e.g. analysis.docx with same placeholders inside)

# 4. Restore real PII
pii-shield deanonymize analysis.docx --session 2026-04-29_120000_ab12
# → analysis_restored.docx with real names back
```

Done. No PII left your machine.

---

## Command reference

```
pii-shield <command> [options]
```

Global options:

| Option | Description |
|---|---|
| `-v, --version` | Print version |
| `-h, --help` | Print help (or `pii-shield <command> --help`) |
| `-q, --quiet` | Suppress progress + summary output. Errors still go to stderr. Use for scripting. |
| `--debug` | Verbose mode — full audit trail to stderr, stack traces on errors. |

Session ids accept **unique prefixes** (git-style). `pii-shield review 2026-04` works if exactly one session id starts with that prefix; ambiguous prefixes print the candidate list.

### `anonymize <files…>`

Anonymize one or more files. All files in one invocation share **one session_id and one mapping pool** — identical entities across files get the same placeholder.

```bash
pii-shield anonymize contract.pdf
pii-shield anonymize doc1.docx doc2.docx doc3.pdf --no-review
pii-shield anonymize *.pdf --out anonymized/ --no-review
pii-shield anonymize new-attachment.pdf --session 2026-04-29_120000_ab12
```

Arguments:

| | |
|---|---|
| `<files…>` | Files to anonymize. Supported: `.pdf`, `.docx`, `.txt`, `.md`, `.csv`, `.log`, `.html` |

Options:

| Option | Default | Description |
|---|---|---|
| `-o, --out <dir>` | `<input-dir>/pii_shield_<sid>/` per file | Single output directory for all files in this run |
| `-s, --session <id>` | (new session) | Extend an existing session: pool + placeholders are reused |
| `--no-review` | (off — review opens) | Skip HITL — write outputs and exit |
| `--lang <code>` | `en` | Language hint for NER |
| `--prefix <p>` | `` | Prepend to placeholder tags, e.g. `--prefix DOC1_` produces `<DOC1_PERSON_1>` |
| `-y, --yes` | | Auto-confirm prompts (e.g. model download) |

What it produces (per file):

| Format | Output |
|---|---|
| `.docx` | `<name>_anonymized.docx` (formatting preserved) **and** `<name>_anonymized.txt` (extracted text) |
| `.pdf` | `<name>_anonymized.txt` (PDF write-back is not supported — only text out) |
| `.txt` / `.md` / `.csv` | `<name>_anonymized.<ext>` |

Where outputs land:

- **Default**: `<input-dir>/pii_shield_<session_id>/<name>_anonymized.<ext>` — keeps anonymized output adjacent to the source for easy auditing.
- **With `--out <dir>`**: all files land directly in `<dir>` (flat layout; useful for batches across many input directories).

After all files are processed, the command either:
- **Without `--no-review`**: prints `Session: <sid>`, starts the HITL HTTP server on `127.0.0.1`, opens your browser, and waits for approval.
- **With `--no-review`**: prints summary + paths and exits 0.

Exit codes: 0 = OK, 1 = error, 2 = wrong arguments.

### `deanonymize <file>`

Restore real PII from placeholders. Works on any file containing placeholders that match a known session — even files that you authored externally (e.g. an LLM's reworked `.docx` that you pasted placeholders into).

```bash
pii-shield deanonymize contract_anonymized.docx
pii-shield deanonymize analysis.docx --session 2026-04-29_120000_ab12
pii-shield deanonymize summary.txt --session 2026-04-29_120000_ab12 --out final.txt
```

Arguments:

| | |
|---|---|
| `<file>` | File whose placeholders to restore |

Options:

| Option | Default | Description |
|---|---|---|
| `-s, --session <id>` | embedded → latest | Session id |
| `-o, --out <path>` | `<name>_restored.<ext>` next to input | Explicit output path |

Session resolution priority:

1. Explicit `--session <id>` — wins.
2. **For `.docx` only** — read `pii_shield.session_id` from the docx's `docProps/custom.xml`. Files written by `pii-shield anonymize` have this metadata embedded automatically.
3. Latest session on this machine (`latestSessionId()` fallback).

### `scan <file>`

Detect PII without writing anything. Useful for previewing what would be anonymized, or for piping JSON into custom workflows.

```bash
pii-shield scan contract.pdf
pii-shield scan contract.pdf --json > entities.json
```

Options:

| Option | Default | Description |
|---|---|---|
| `--json` | | Emit machine-readable JSON to stdout |
| `--lang <code>` | `en` | Language hint |
| `--wait-ner <s>` | `30` | Max seconds to wait for NER on cold start |

JSON shape:

```json
{
  "file": "contract.pdf",
  "ext": ".pdf",
  "bytes": 145823,
  "char_count": 8421,
  "entities": [
    {"text": "John Smith", "type": "PERSON", "start": 12, "end": 22, "score": 0.93}
  ]
}
```

### `review <session-id>`

Open the HITL review UI in your default browser for an existing session. Useful when you ran `anonymize --no-review` initially and want to review later, or after `sessions import` from another machine.

```bash
pii-shield review 2026-04-29_120000_ab12
pii-shield review 2026-04                # short prefix — works if unique
# → Review URL: http://127.0.0.1:6789/?token=<random>
# → opens browser
```

After approval, any documents whose review carries non-empty overrides are re-anonymized in place against a fresh shared placeholder state — so multi-doc consistency stays intact even after corrections.

### `verify <file>`

Re-detect PII on an anonymized file and fail if any non-placeholder entity is found. Use as a final compliance gate before sending output to an external LLM.

```bash
pii-shield verify contract_anonymized.txt --session 2026-04-29_120000_ab12
# → ✓ verified clean

pii-shield verify summary.docx --session 2026-04 --json
```

Options:

| Option | Description |
|---|---|
| `-s, --session <id>` | **Required**. Session id or unique prefix |
| `--json` | Emit machine-readable JSON to stdout |
| `--lang <code>` | Language hint (default `en`) |

How the check works:

1. Re-runs the engine over the anonymized text.
2. For each detected entity, checks if its text is a placeholder from the session's mapping (`<PERSON_1>`, etc.). Placeholders are skipped.
3. Anything else → flagged as a possible leak (offset + 60-char context printed).

Exit codes: 0 = clean, 1 = possible leaks (or model/session error), 2 = usage.

### `install-model`

Download and install the GLiNER ONNX model (~634 MB) into `~/.pii_shield/models/`.

```bash
pii-shield install-model           # interactive
pii-shield install-model --yes     # non-interactive (CI)
pii-shield install-model --force   # reinstall over a present model
```

If a valid `gliner-pii-base-v1.0/model.onnx` already exists (>100 MB), the command exits 0 without action unless `--force`.

### `doctor`

Health check — verifies Node version, write permissions, model presence, deps cache, NER status.

```bash
pii-shield doctor
pii-shield doctor --json
```

Exit code 0 if all checks pass, 1 if any fail. Use as a CI gate.

### `sessions list`

Table of local sessions, newest first.

```bash
pii-shield sessions list
pii-shield sessions list --json
```

| Column | Meaning |
|---|---|
| `session_id` | The id, format `YYYY-MM-DD_HHMMSS_xxxx` |
| `modified` | ISO-8601 timestamp of last write |
| `docs` | Number of documents anonymized under this session |
| `entities` | Total placeholders in the mapping pool |

### `sessions show <session-id>`

Detail view: every doc in the session with `doc_id`, source path, source SHA-256, anonymized timestamp, plus review status.

```bash
pii-shield sessions show 2026-04-29_120000_ab12
pii-shield sessions show 2026-04-29 --json     # short prefix
```

### `sessions find <path>`

Find which session(s) include a given source file. Linear scan over all sessions in `~/.pii_shield/mappings/`.

```bash
pii-shield sessions find ~/Documents/contract.pdf
# → Found 1 session(s) including /home/user/Documents/contract.pdf:
# →   2026-04-29_120000_ab12  doc_id=lkhc91b-3e2f4a  2026-04-29T12:00:14.123Z

pii-shield sessions find /tmp/missing.txt --json
# → []   (exit 1)
```

Useful for "did I anonymize this already? which session?" Exit 0 if at least one session matches, exit 1 if none.

### `sessions export <session-id> --out <path>`

Export an encrypted archive (`.pii-session`) for hand-off to a colleague.

```bash
pii-shield sessions export 2026-04-29_120000_ab12 \
  --passphrase "correct horse battery staple" \
  --out contract-matter.pii-session
```

Options:

| Option | Description |
|---|---|
| `-o, --out <path>` | **Required**. Output file path |
| `-p, --passphrase <p>` | Passphrase. If omitted, the CLI prompts for it (input is masked) |

**Crypto**: AES-256-GCM with scrypt key derivation (N=16384, r=8, p=1). Wrong passphrase → loud failure, not silent corruption.

The archive contains:
- `manifest.json` — version + integrity hash
- `mapping.json` — placeholder → real-PII mapping + per-doc metadata
- `review.json` — HITL review state (if any)

### `sessions import <archive>`

Decrypt and persist a session archive locally.

```bash
pii-shield sessions import contract-matter.pii-session \
  --passphrase "correct horse battery staple"
pii-shield sessions import a.pii-session --overwrite   # replace existing session of same id
```

Options:

| Option | Description |
|---|---|
| `-p, --passphrase <p>` | Passphrase. Prompts (masked) if omitted |
| `--overwrite` | Replace an existing session of the same id |

---

## Configuration

### Environment variables

All settings are environment variables — there is no separate config file. Set them in your shell, in `.env` (loaded by your shell of choice), or per-command (`KEY=value pii-shield …`).

#### Detection sensitivity

| Var | Default | Range | Effect |
|---|---|---|---|
| `PII_MIN_SCORE` | `0.30` | 0.0–1.0 | Minimum confidence for **pattern-based** recognizers (email, SSN, IBAN, …). Lower = more recall, more false positives. |
| `PII_NER_THRESHOLD` | `0.30` | 0.0–1.0 | Minimum confidence for **NER** detections (PERSON, ORG, LOCATION, NRP). 0.20 catches more obscure names; 0.50 catches only obvious ones. |

Tune for your domain:

```bash
# legal contracts (default tuning)
PII_MIN_SCORE=0.30 PII_NER_THRESHOLD=0.30 pii-shield anonymize contract.pdf

# medical records (higher recall — miss nothing)
PII_MIN_SCORE=0.20 PII_NER_THRESHOLD=0.20 pii-shield anonymize chart.pdf

# news clippings (higher precision — only obvious entities)
PII_NER_THRESHOLD=0.55 pii-shield anonymize article.txt
```

#### Behaviour

| Var | Default | Description |
|---|---|---|
| `PII_SKIP_REVIEW` | `false` | Set `true` to never open the HITL panel — useful for CI / scripting |
| `PII_MAPPING_TTL_DAYS` | `7` | Sessions older than N days are deleted on next CLI start. Bump for longer matters: `PII_MAPPING_TTL_DAYS=90` |
| `PII_WORK_DIR` | (unset) | Default working directory for relative paths |
| `PII_DEBUG` | (unset) | Set `true` (or pass `--debug`) to print stack traces and full audit trail |
| `PII_AUDIT_STDERR` | `false` for CLI / `true` for MCP | Mirror server logs to stderr. CLI sets `false` so output stays clean; `--debug` flips to `true` |
| `PII_QUIET` | (unset) | Set by `--quiet`. Disables progress bars and summary writes |
| `NO_COLOR` | (unset) | Honoured per <https://no-color.org/>. Disables ANSI in terminal output |
| `FORCE_COLOR` | (unset) | Force ANSI even in non-TTY contexts |

#### Paths (rare overrides)

| Var | Default | Description |
|---|---|---|
| `PII_SHIELD_DATA_DIR` | `~/.pii_shield` | Root for all PII Shield state. Override to relocate everything (deps, model, audit, mappings) — useful for shared/networked installs |
| `PII_SHIELD_MAPPINGS_DIR` | `<DATA_DIR>/mappings` | Override only the mappings dir — e.g. point to a network share so a team has shared sessions |
| `PII_SHIELD_MODELS_DIR` | `<DATA_DIR>/models` | Override only the model directory |
| `PII_SHIELD_MODEL_DOWNLOADS_DIR` | (auto) | Where `install-model` looks for an existing `gliner-pii-base-v1.0.zip` (Downloads / OneDrive / Desktop / Documents are scanned by default) |

### File paths — where your data lives

```
~/.pii_shield/                     ← PII_SHIELD_DATA_DIR
├── models/
│   └── gliner-pii-base-v1.0/       ← 634 MB, survives uninstall
│       ├── model.onnx
│       ├── tokenizer.json
│       ├── tokenizer_config.json
│       ├── special_tokens_map.json
│       └── gliner_config.json
├── deps/
│   └── installs/<hash>/            ← onnxruntime-node + transformers + gliner (pinned)
├── mappings/                       ← PII_SHIELD_MAPPINGS_DIR (can be relocated)
│   ├── <session_id>.json           ← placeholder → real PII (the one secret)
│   └── review_<session_id>.json    ← HITL state (entities + overrides)
├── audit/
│   ├── mcp_audit.log               ← every CLI command + arguments + result
│   ├── ner_init.log                ← NER bootstrap trace
│   ├── ner_debug.log               ← per-call NER detail
│   └── server.log                  ← lifecycle + errors
└── cache/
    └── gliner-pii-base-v1.0.zip    ← deleted after install (only present mid-download)
```

The mapping files are **the one place real PII lives** outside your source documents. They have `0o700` permissions on POSIX. Delete a mapping = no way to deanonymize that session.

---

## Workflows

### Anonymize → external LLM → deanonymize

The headline use case. Send placeholders to any LLM, restore real data on your machine.

```bash
# 1. Anonymize. Note the session id.
pii-shield anonymize NDA.docx --no-review
# → Session: 2026-04-29_120000_ab12

# 2. Take NDA_anonymized.docx to ChatGPT / Gemini / Claude / Llama / DeepSeek
#    Ask: "Summarise the obligations in this NDA. Keep tokens like
#    <PERSON_1> verbatim." Save the response as summary.docx.

# 3. Restore PII in the LLM output.
pii-shield deanonymize summary.docx --session 2026-04-29_120000_ab12
# → summary_restored.docx with real names back
```

The deanonymize step is pure string replacement — it works on any file format the CLI supports, regardless of who/what wrote it. Just make sure the LLM keeps the placeholder tokens unmodified.

**Tip for prompts:**

```
You are reviewing an anonymized contract. Tokens in the form
<PERSON_1>, <ORG_3>, <EMAIL_ADDRESS_2> are anonymous placeholders.
Keep them VERBATIM in your output — do not rephrase, translate,
or split them. Treat them as opaque proper nouns.
```

### Multi-document batch (one matter, many files)

```bash
pii-shield anonymize matter/contract.pdf matter/sow.pdf matter/nda.pdf matter/*.docx
# → ONE session_id covers all files
# → "Acme Corp" in any file → <ORG_1> in every file
# → "John Smith" → <PERSON_1> consistently
# → bulk-mode review panel opens with one tab per file
```

See [Multi-document batches](#multi-document-batches) below for the detailed contract.

### Re-anonymizing with corrections

The HITL review lets you remove false positives and add missed entities. After approval, the CLI re-anonymizes the affected files in place, against a fresh shared placeholder state — so multi-doc consistency is preserved.

```bash
pii-shield anonymize contracts/*.pdf
# → browser opens; you click some entities to remove, select text to add as
#   missed PII, click Approve.
# → CLI prints "Re-anonymized 3 doc(s) with corrections" + final paths.
```

To re-open review later (e.g. you closed the browser, or imported a session):

```bash
pii-shield review 2026-04-29_120000_ab12
```

### Cross-machine session handoff

A colleague needs to deanonymize the LLM output, but the anonymization happened on your machine. Send them an encrypted archive — PII never crosses the wire in plain form.

```bash
# Your machine
pii-shield sessions export 2026-04-29_120000_ab12 \
  --passphrase "<some long passphrase>" \
  --out matter-1234.pii-session
# → matter-1234.pii-session (a few KB to a few MB)

# Send the file via any channel. Pass the passphrase out-of-band (Signal,
# phone, separate email, etc.) — never in the same channel as the file.

# Their machine
pii-shield sessions import matter-1234.pii-session \
  --passphrase "<the same passphrase>"
pii-shield deanonymize summary.docx --session 2026-04-29_120000_ab12
```

The archive contains the mapping + review state, AES-256-GCM encrypted with a key derived via scrypt from the passphrase. Wrong passphrase = loud decryption failure (no silent corruption).

### Cleanup

Mappings older than `PII_MAPPING_TTL_DAYS` (default 7) are deleted on next CLI start. Bump for long-running matters:

```bash
export PII_MAPPING_TTL_DAYS=90
```

To wipe everything manually:

```bash
rm -rf ~/.pii_shield/mappings/   # only mappings — model, deps, audit kept
rm -rf ~/.pii_shield/             # everything (next anonymize re-installs deps)
```

To disable cleanup entirely, set `PII_MAPPING_TTL_DAYS=36500` (100 years).

---

## Multi-document batches

The CLI is designed for the realistic legal workload of **20–30 documents in one matter**. Key contract:

### Shared placeholders across files

In a single `pii-shield anonymize file1 file2 …` invocation, **all files share one session and one mapping pool**. The same entity gets the same placeholder in every file.

| File | Original | Placeholder |
|---|---|---|
| `contract.pdf` | `Acme Corp` | `<ORG_1>` |
| `sow.pdf` | `Acme Corp.` | `<ORG_1>` |
| `nda.docx` | `Acme Corporation` | `<ORG_1a>` |
| `email-thread.txt` | `Acme` | `<ORG_1b>` |

The variant suffixes (`a`, `b`, …) come from the family-based dedup: the longest form wins as canonical, and shorter / variant spellings get suffixed family numbers. On `deanonymize`, every variant maps back to its original verbatim text.

### Extending an existing session later

If a new document arrives mid-matter, extend the existing session rather than starting fresh — keeps placeholder consistency:

```bash
pii-shield anonymize new-attachment.pdf --session 2026-04-29_120000_ab12
# → "Acme Corp" still mapped to <ORG_1>, not a new <ORG_5>
```

### Performance

NER inference is sequential (single-threaded ONNX Runtime). Realistic timings on commodity CPU:

| Batch | Cold start | Warm |
|---|---|---|
| 1 short doc (5 KB text) | 2–3 min (first ever run: deps + model) | 1–2 s |
| 5 docs avg 10 KB | 4–5 min cold / 50 s warm | |
| 30 docs avg 10 KB | 6–8 min cold / 5 min warm | |
| 1 large doc 200 KB text | 3 min cold / 1 min warm | |

Disable HITL review (`--no-review`) for unattended batches. Tune `PII_NER_THRESHOLD=0.4` for a 20–30% speedup if you can tolerate slightly lower recall.

### Hard limits

- **No hard upper bound** on files per session — backend has no counter. The 5-file recommendation in the bundled `pii-contract-analyze` skill is a UX hint for the in-chat panel, not a backend limit.
- **No hard upper bound** on entities per session — the mapping is plain JSON, dedup is linear in family count.
- **Practical browser limit**: above ~30 docs / ~1500 entities in one review, the browser panel can become sluggish (DOM not virtualised). If you hit this, split into two sessions.
- **Per-doc size**: tested up to 200 KB text (≈80 PDF pages). Larger works but slows down — split very long docs at chapter boundaries upstream.

### Multi-doc review

When `start_review` (or `pii-shield review`) sees ≥2 documents in a session, the browser panel renders **one tab per document**. Per-tab state (added / removed entities) is independent. **Adding** an entity in one tab also propagates word-boundary matches across all other tabs — so user-added entities stay consistent across the matter without re-clicking each file.

---

## Working with external LLMs

### What CAN you do?

Any LLM that accepts text input works as a drop-in replacement for Claude in the PII Shield flow:

- ChatGPT / GPT-4 / GPT-4o
- Google Gemini
- Local Llama / Mistral / Qwen via Ollama, llama.cpp, vLLM
- DeepSeek, Mixtral, etc.
- Internal corporate LLM gateways

The contract is simple: send the LLM the **anonymized** file. The LLM treats `<PERSON_1>`, `<ORG_1>`, etc. as opaque tokens (most modern LLMs do this naturally). When the LLM produces a new document — memo, redline, summary — its output contains the same placeholder strings. You restore them locally.

### Prompt template

```
You are reviewing an anonymized legal document. Tokens of the form
<TYPE_NUMBER> (e.g. <PERSON_1>, <ORG_3>, <EMAIL_ADDRESS_2>) are anonymous
placeholders for personal data. Keep them VERBATIM in your output — do
not rephrase, translate, hyphenate, or split them. Treat them as opaque
proper nouns.

[Insert anonymized document below]
…

[Your task]
Summarise the obligations of <ORG_1> under this NDA in a one-page memo.
```

### What CAN'T you do?

- **Don't ask the LLM to "guess" what the placeholders represent.** It can't, and even attempting it can leak side-channel information (the LLM might pattern-match `<PERSON_1>` against well-known names by frequency).
- **Don't paste real PII into the LLM "for context."** That defeats the whole flow. Anonymize everything you send.
- **Don't expect tokens like `<DATE_OF_BIRTH_1>` to be order-preserving.** PII Shield assigns numbers per-type, not chronologically.
- **Don't run anonymize on a file that's already partly anonymized.** The pipeline assumes raw input — running twice will treat existing placeholders as random text and may produce nested placeholders.

### What if the LLM mangles placeholders?

LLMs occasionally:
- Lowercase: `<person_1>` instead of `<PERSON_1>`
- Add spaces: `<PERSON 1>`
- Translate the type: `<PERSONA_1>`
- Wrap in quotes: `"<PERSON_1>"` (this still works — surrounding quotes don't break replacement)

Mangled placeholders won't be restored by `deanonymize`. If this happens, either:
1. Tighten the prompt: "Keep tokens VERBATIM. Do not modify case or spacing inside `<…>`."
2. Use a stricter LLM (most frontier models are fine).
3. Sed-replace mangled forms back to canonical before deanonymize:
   ```bash
   sed -E 's/<person_([0-9]+)>/<PERSON_\1>/g' summary.txt > fixed.txt
   pii-shield deanonymize fixed.txt --session <sid>
   ```

---

## Cross-machine handoff

Detailed in [Workflows → Cross-machine](#cross-machine-session-handoff) above. Recap:

- `sessions export` → encrypted `.pii-session` archive
- `sessions import` on the other machine → mapping is restored
- Passphrase travels out-of-band

The archive format is **versioned** (`PII1` magic, version byte 0x01) so future PII Shield versions stay backward-compatible.

---

## HITL review

Human-in-the-loop review opens a browser window where you can:

- **Remove false positives** — click any highlighted entity. All occurrences across the document(s) are removed.
- **Add missed entities** — select text, click a type button. All word-boundary matches are added across all tabs.
- **See the impact live** — the right pane shows the anonymized version updating as you make changes.

### Starting review

```bash
# Inline (default): runs at the end of `anonymize`
pii-shield anonymize contract.pdf

# Skip and review later
pii-shield anonymize contract.pdf --no-review
pii-shield review 2026-04-29_120000_ab12
```

### URL and security

The CLI prints a URL of the form:

```
http://127.0.0.1:6789/?token=4b4c77cf6d12ba7d6c8d47a1c91775cc
```

- Bound to **127.0.0.1 only** — never reachable from the network.
- Random 32-hex bearer token in the URL — even other users on the same machine can't access without it (token is in URL only, not on disk).
- Origin-checked on every POST — defense against drive-by browser attacks.
- Idle timeout: 30 minutes; the browser sends a heartbeat every 30 s while the page is open, so reading a long document doesn't close the server. After 30 min of true inactivity the server closes and the CLI exits 1 (timeout).

If your default browser doesn't open automatically (rare — `open` is robust), copy the URL from the terminal and paste it into any browser.

### Keyboard shortcuts (in the panel)

| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Next / previous entity |
| `D` | Remove the focused entity |
| `R` | Restore the focused entity (undo remove) |
| `A` | Approve the document |
| `/` | Focus the entity filter |
| `Esc` | Clear focus / close dropdowns |

### Bulk mode (multi-doc)

When the session has ≥2 documents, the panel shows tabs at the top:

- Click a tab to switch between documents.
- Each doc keeps its own removed / added state.
- **Approve once per tab.** When all tabs are approved, the success overlay appears and the CLI continues.
- Adding an entity in one tab propagates to all tabs (word-boundary, case-insensitive). Removing is per-tab.

### When NOT to use HITL

- **Unattended CI / cron jobs** — set `PII_SKIP_REVIEW=true` or pass `--no-review`.
- **SSH / headless servers** — no browser available; use `--no-review` and inspect outputs manually.
- **Streaming pipelines** — same as above; rely on the default `0.30` thresholds.

---

## Privacy, audit, security

### What leaves your machine

If you use the CLI alone, **nothing leaves your machine**. The CLI does:

- Read your source files locally
- Run NER + pattern matching locally (CPU only — no network)
- Write anonymized outputs locally
- Open a browser on `127.0.0.1` only

It does NOT:

- Phone home, telemetry, analytics — none. You can run it on an air-gapped machine.
- Upload anything anywhere.
- Open inbound network ports.

The only outbound networking happens during `install-model` (downloads from `github.com/gregmos/PII-Shield/releases/`). Everything else is local.

### Audit log

Every command writes to `~/.pii_shield/audit/mcp_audit.log`:

```
2026-04-29T12:00:01.234Z >>> CALL anonymize_text_cli({"file":"/x/contract.pdf","char_count":8421,"session_id":""})
2026-04-29T12:00:14.123Z <<< RESP anonymize_text_cli -> {"anonymized":"... <ORG_1> ..."} ... [127 chars total]
```

PII is **truncated** at 200 chars in the log. The full PII is only in `mappings/<session>.json` (mode `0o700`).

To prove no PII left the machine, read the audit log: every external operation is recorded. There are no hidden side channels.

### Audit log rotation

The log grows append-only. There is no built-in rotation in 2.0.x — wipe manually for compliance:

```bash
rm ~/.pii_shield/audit/*.log    # keeps the directory; new lines start fresh
```

If you need rotation, schedule it via your OS (`logrotate` on Linux, Task Scheduler on Windows).

### Trust boundary

| Component | Trusted? |
|---|---|
| Your source documents | Trusted |
| `~/.pii_shield/mappings/<sid>.json` | **Highly sensitive** — contains real PII |
| `<file>_anonymized.<ext>` outputs | Safe to send to LLMs / colleagues |
| `.pii-session` export archives | Encrypted; safe IF passphrase is strong |
| `~/.pii_shield/audit/*.log` | Mostly safe — contains file paths, no real PII |
| `~/.pii_shield/models/`, `deps/` | Public — same content as the npm package + GitHub release |

---

## Python / scripting integration

PII Shield is a Node binary, but every command has a `--json` mode for structured output, so it slots into Python / shell pipelines via `subprocess`. There is no separate Python SDK — the CLI **is** the integration surface.

### JSON outputs by command

| Command | `--json` available? | Shape (top-level keys) |
|---|---|---|
| `anonymize` | ✅ | `session_id`, `entity_count`, `pool_size`, `ner_ready`, `results[]` |
| `deanonymize` | ✗ (path printed on stdout) | one path per call |
| `scan` | ✅ | `file`, `bytes`, `char_count`, `entities[]` |
| `verify` | ✅ | `ok`, `leaks_found`, `leaks[]` |
| `sessions list` | ✅ | array of `{session_id, modified, docs, entities}` |
| `sessions show` | ✅ | `session_id`, `entity_count`, `documents[]`, `review` |
| `sessions find` | ✅ | array of `{session_id, doc_id, source_path, anonymized_at}` |
| `doctor` | ✅ | `version`, `node_version`, `checks[]`, `ok` |

`--json` on `anonymize` implies `--no-review` (it doesn't make sense to open a browser inside a non-interactive script).

Exit codes: `0` = success, `1` = error / leak detected / 0 hits (for `find`), `2` = wrong arguments.

### Minimal Python wrapper

```python
import subprocess, json, pathlib

class PiiShield:
    def __init__(self, binary: str = "pii-shield"):
        self.bin = binary

    def _run(self, *args, check_zero: bool = True) -> str:
        r = subprocess.run([self.bin, *args], capture_output=True, text=True)
        if check_zero and r.returncode != 0:
            raise RuntimeError(f"pii-shield {' '.join(args)} → {r.returncode}: {r.stderr}")
        return r.stdout

    def doctor(self) -> dict:
        return json.loads(self._run("doctor", "--json", check_zero=False))

    def scan(self, path: str) -> dict:
        return json.loads(self._run("scan", path, "--json"))

    def anonymize(self, *paths: str, session: str | None = None,
                  out: str | None = None) -> dict:
        args = ["anonymize", *paths, "--json", "--yes"]
        if session: args += ["--session", session]
        if out:     args += ["--out", out]
        return json.loads(self._run(*args))

    def deanonymize(self, path: str, session: str, out: str | None = None) -> str:
        args = ["deanonymize", path, "--session", session]
        if out: args += ["--out", out]
        self._run(*args)
        # deanonymize prints the path on stdout — first line.
        return out or self._infer_restored_path(path)

    def verify(self, path: str, session: str) -> dict:
        return json.loads(self._run("verify", path, "--session", session, "--json",
                                    check_zero=False))

    def session_for_file(self, path: str) -> str | None:
        hits = json.loads(self._run("sessions", "find", path, "--json",
                                    check_zero=False))
        return hits[0]["session_id"] if hits else None

    @staticmethod
    def _infer_restored_path(input_path: str) -> str:
        p = pathlib.Path(input_path)
        return str(p.with_name(p.stem + "_restored" + p.suffix))


# ── usage ──────────────────────────────────────────────────────────────
shield = PiiShield()

# Pre-flight
health = shield.doctor()
assert health["ok"], f"PII Shield not healthy: {health}"

# Anonymize a batch of contracts in one session
result = shield.anonymize("contracts/nda.docx", "contracts/sow.docx",
                          out="anonymized/")
sid = result["session_id"]
anon_files = [r["output_path"] for r in result["results"]]

# Send anon_files to your LLM of choice
# (OpenAI, Anthropic, local — anything) and get back analysis.docx
analysis = call_my_llm(anon_files, prompt="Summarise risks…")

# Verify the LLM didn't leak real PII back into the response
v = shield.verify(analysis, session=sid)
if not v["ok"]:
    raise RuntimeError(f"LLM output contains real PII: {v['leaks']}")

# Restore PII into the analysis document
final = shield.deanonymize(analysis, session=sid,
                           out="output/analysis_with_pii.docx")
print(f"Done: {final}")
```

### Common patterns

**Pipeline with verification gate:**

```python
result = shield.anonymize(*input_files, out="staging/")
for r in result["results"]:
    v = shield.verify(r["output_path"], session=result["session_id"])
    if not v["ok"]:
        raise RuntimeError(f"Leak in {r['output_path']}: {v['leaks']}")
# Safe to send result["results"] to external LLM
```

**Idempotent re-runs (skip already-anonymized files):**

```python
sid = shield.session_for_file("contract.pdf")
if sid is None:
    result = shield.anonymize("contract.pdf")
    sid = result["session_id"]
else:
    print(f"Already anonymized in session {sid}")
```

**Streaming through an LLM with cost control:**

```python
scan = shield.scan(file)
if scan["entities"] and any(e["type"] == "US_SSN" for e in scan["entities"]):
    # Don't even send this file to the LLM — too sensitive
    raise SystemExit("File contains SSNs; redact manually first.")

# Otherwise anonymize + send
result = shield.anonymize(file)
```

### Performance notes

- **Subprocess spawn cost**: each `pii-shield` invocation boots Node, loads the engine, runs the command. Cold start ≈ 200-500 ms even before NER kicks in. For batches, **prefer one `anonymize` call with all files** rather than N calls of one file each.
- **NER deps install (`~/.pii_shield/deps/`)**: happens once per machine, ~1-2 minutes. After that all runs are warm.
- **Model load (`~/.pii_shield/models/`)**: ~15 s on a fresh process. Subprocess pattern means each call pays this cost. For high-throughput pipelines (1000s of docs), consider running PII Shield as a long-lived MCP server and talking JSON-RPC to it instead — the same Node binary supports stdio MCP via `node dist/server.bundle.mjs` (see `nodejs-v2/manifest.json`).
- **For 10–50 docs in one session**: the subprocess pattern is perfectly fine. Spawn cost is ≪ NER inference time anyway.

### Embedding via MCP (advanced)

The same backend that powers the CLI also speaks **MCP stdio** when invoked as `node dist/server.bundle.mjs`. Any MCP client (Python's official MCP SDK, or your own JSON-RPC implementation) can drive it: persistent process, no per-call boot cost, full tool surface (`anonymize_file`, `deanonymize_text`, `scan_text`, `start_review`, …) instead of CLI commands.

This is heavier to set up but pays off if you're processing thousands of files programmatically. See [`@modelcontextprotocol/sdk` Python](https://github.com/modelcontextprotocol/python-sdk) for the client side.

---

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `pii-shield: command not found` | npm's global `bin/` not on `PATH`. Run `npm root -g` to find it; add the parent `bin/` to `PATH`. On Windows: typically `%AppData%\npm\`. |
| `[!] NER model loading...` then takes 1–2 min | First run installs deps. Look at `~/.pii_shield/audit/ner_init.log` for progress. Subsequent runs are instant. |
| `model.onnx missing` in doctor | Run `pii-shield install-model`. If you already downloaded the zip elsewhere, set `PII_SHIELD_MODEL_DOWNLOADS_DIR=/path/to/dir` and re-run. |
| `Unsupported model IR version: 9` | Stale `onnxruntime-node` cached. Delete `~/.pii_shield/deps/` — next anonymize call reinstalls the pinned 1.22.0 triplet. |
| `Cannot find module '../build/Release/sharp-…'` | Old build without the sharp shim. Update: `npm install -g pii-shield@latest`. |
| HTTP server fails — port in use | We try `6789–6799`. Close other PII Shield instances; check `lsof -i :6789` or `netstat -ano \| findstr 6789`. |
| Browser doesn't open during review | Copy the printed URL manually. Set `BROWSER=firefox` (Linux/macOS) to override. |
| `deanonymize` silently leaves placeholders | LLM mangled them (e.g. lowercase, added spaces). See [Working with external LLMs → Mangled placeholders](#what-if-the-llm-mangles-placeholders). |
| `session 'X' not found` on import | Wrong session id. List with `pii-shield sessions list`. |
| Wrong passphrase on import | Decryption fails loudly with `wrong passphrase or corrupted archive` — there is no silent corruption. |
| Mapping disappeared after a week | TTL cleanup. Bump `PII_MAPPING_TTL_DAYS=90` for long matters. Already-deleted mappings can only be recovered if you have a `.pii-session` export. |
| First-run downloads keep restarting | Network timeouts on slow connections. Run `install-model` directly — it has a single-shot download with a progress bar; can also use the `install-model.ps1` / `.sh` scripts in the repo for a curl-based fallback. |
| Anonymize misses obvious names | NER threshold too high. Try `PII_NER_THRESHOLD=0.20`. If still missed, the model genuinely doesn't see them — open an issue with a redacted example. |
| Anonymize too eager (false positives) | Lower recall: `PII_MIN_SCORE=0.45 PII_NER_THRESHOLD=0.45`. Or use the HITL panel to remove specific false positives — corrections are session-local. |

For deeper diagnostics:

```bash
PII_DEBUG=true pii-shield <command>     # prints stack traces on errors
tail -f ~/.pii_shield/audit/server.log  # live tool calls + lifecycle events
tail -f ~/.pii_shield/audit/ner_init.log # NER bootstrap detail
```

---

## Detected entity types

35 types in total. The full authoritative list is `nodejs-v2/src/engine/entity-types.ts` (`SUPPORTED_ENTITIES`).

### NER-based (GLiNER zero-shot)

`PERSON`, `ORGANIZATION`, `LOCATION`, `NRP` (nationality / religion / politics).

### Generic patterns

`EMAIL_ADDRESS`, `PHONE_NUMBER`, `URL`, `IP_ADDRESS`, `ID_DOC`, `CREDIT_CARD`, `IBAN_CODE`, `CRYPTO`, `MEDICAL_LICENSE`.

### US

`US_SSN`, `US_PASSPORT`, `US_DRIVER_LICENSE`.

### UK

`UK_NHS`, `UK_NIN`, `UK_PASSPORT`, `UK_CRN`, `UK_DRIVING_LICENCE`.

### EU-wide

`EU_VAT`, `EU_PASSPORT`.

### Country-specific

`DE_TAX_ID`, `DE_SOCIAL_SECURITY`, `FR_NIR`, `FR_CNI`, `IT_FISCAL_CODE`, `IT_VAT`, `ES_DNI`, `ES_NIE`, `CY_TIC`, `CY_ID_CARD`, `FI_HETU`, `FI_BUSINESS_ID`.

To list at runtime in JSON: `pii-shield scan small.txt --json | jq '.entities[].type' | sort -u` (assuming sample file has at least one of each).

---

## Limits and caveats

- **HITL via browser only** — there's no terminal review UI. SSH / headless setups must `--no-review`.
- **NER inference is single-threaded.** Don't run multiple `pii-shield anonymize` processes in parallel against the same session — placeholder counters race. Sequential batches inside one invocation are fine.
- **PDF write-back is not supported.** Anonymizing a `.pdf` produces a `.txt` (text only). For redacted PDFs, anonymize → analyse → re-render the result through your own PDF generator.
- **`.docx` formatting preservation** is best-effort. Tracked changes (`<w:ins>`, `<w:del>`), comments, and split runs are handled. Exotic structures like SmartArt, embedded Excel objects, math equations may not be processed.
- **Audit log is append-only**. Manage retention yourself or via OS log rotation.
- **No cross-instance locking.** Two `pii-shield` processes on the same machine writing to the same session at the same time will produce a "last writer wins" mapping. Don't do this — but if you must, use distinct `PII_SHIELD_DATA_DIR` per process.
- **Model is English-tuned.** GLiNER is multilingual but the bundled `gliner-pii-base-v1.0` was tuned on English-leaning legal corpora. Other languages work but recall is lower; bump `PII_NER_THRESHOLD` down to 0.20–0.25 to compensate.

---

## Getting help

- Issues: <https://github.com/gregmos/PII-Shield/issues>
- Source: <https://github.com/gregmos/PII-Shield>
- License: MIT

The CLI source code is in `nodejs-v2/cli/` of the repo. Dev notes in `nodejs-v2/cli/DEVELOPING.md`.
