# PII Shield

**MCP server + Skill for Claude Desktop (Cowork)** that automatically anonymizes documents before Claude sees them — and restores everything back after analysis.

## The Problem

You want Claude to review contracts, draft legal memos, compare documents, or suggest tracked changes — but the documents contain real names, addresses, emails, phone numbers, and other sensitive data. Sending raw PII to an LLM raises privacy and compliance concerns (GDPR, internal policies, client confidentiality).

## The Solution

PII Shield sits between your documents and Claude:

1. **You connect a folder** with your documents and select the `pii-contract-analyze` skill
2. **PII Shield automatically anonymizes** all personal data using GLiNER NER — names become `<PERSON_1>`, companies become `<ORG_1>`, etc.
3. **You review** the anonymization in a local web UI — remove false positives, add missed entities
4. **Claude analyzes the anonymized text** — writes memos, suggests edits, compares versions — never seeing the real data
5. **PII Shield restores** the original names back into Claude's output and saves the final document locally

Claude does the thinking. PII Shield keeps the data private.

> **Important: Do NOT attach files directly to your message.** When you attach a file, Cowork renders it and includes the content in the API request — Claude sees the raw data before PII Shield can process it. Instead, **connect a folder** (via the folder icon in Cowork) and tell Claude the file name. PII Shield's `anonymize_file` tool receives only the file path — the MCP server on your machine reads and anonymizes the file locally. PII never enters Claude's context.

```
Document -> [PII Shield on HOST] -> output_path only -> [Claude: reads anonymized file] -> [PII Shield: Restore] -> Result
              Acme Corp. -> <ORG_1>                                                        <ORG_1> -> Acme Corp.
              John Smith  -> <PERSON_1>                                                    <PERSON_1> -> John Smith
```

---

## What's New in v6.0.0

- **Human-in-the-Loop Review** — Local web UI to review detected entities: remove false positives, add missed ones. All occurrences updated automatically.
- **Zero PII in API** — `anonymize_file` returns only `output_path`. Claude reads the anonymized file from disk — real data never enters the API.
- **212-term false positive filter** — Stoplist for contract roles, legal terms, generic nouns, abbreviations. Strips articles ("the Contractor" → "contractor"), checks multi-word phrases, handles Cyrillic homoglyphs.
- **PDF + DOCX + tracked changes** — Handles `.pdf` (pdfplumber), `.docx` with formatting preservation, and `w:ins`/`w:del` in Word tracked changes.
- **Audit & NER logs** — Two local log files in `~/.pii_shield/audit/`: MCP audit log (every tool call/response — proof no PII leaves the machine) and NER debug log (raw detections, skip reasons, anonymization trace).

---

## Quick Start

### Prerequisites

- **[Python 3.10+](https://www.python.org/downloads/)** installed and in PATH
- **[Claude Desktop](https://claude.ai/download)** (Cowork)

### Step 1: Pre-install dependencies (recommended)

> **Why?** PII Shield requires ~1 GB of AI models and libraries (PyTorch, GLiNER, Presidio, SpaCy). If you pre-install them, the extension will start instantly. If you skip this step, PII Shield will auto-install everything on first use — but you'll need to wait 5-10 minutes while Claude shows progress updates.

**Option A** — Run the Python script (if you're comfortable with the command line):

```bash
python setup_pii_shield.py
```

The script will install all packages, download AI models, and verify everything works. Takes 3-10 minutes depending on your internet speed.

**Option B** — One-click installer (no command line needed):

- **Windows**: Download and double-click [`setup_pii_shield.bat`](setup_pii_shield.bat)
- **macOS/Linux**: Download [`setup_pii_shield.sh`](setup_pii_shield.sh), then run in Terminal: `chmod +x setup_pii_shield.sh && ./setup_pii_shield.sh`

Both are fully self-contained — just download one file and run it.

> **Note:** Both options require Python 3.10+ to be installed on your system. If you don't have Python, download it from [python.org](https://www.python.org/downloads/) — make sure to check **"Add Python to PATH"** during installation.

### Step 2: Install the extension and skill in Claude Desktop

1. Download [`pii-shield-v6.0.0.mcpb`](dist/pii-shield-v6.0.0.mcpb) and [`pii-contract-analyze.skill`](dist/pii-contract-analyze.skill)
2. **MCP Server**: In Claude Desktop — **Settings > Extensions > Advanced settings** -> click **Install extension** -> select `pii-shield-v6.0.0.mcpb`
3. **Skill**: In Claude Desktop — **Customize > Skills** -> click **+** -> **Upload a skill** -> select `pii-contract-analyze.skill`

### Step 3: Configure (optional)

In **Settings > Extensions > PII Shield**:
- **Working directory** — Set the folder where your documents are stored (e.g. `C:\Users\You\Documents\contracts`). This lets `find_file` and `anonymize_file` resolve filenames automatically.

### Step 4: Use it

1. Start a new conversation in Claude Desktop
2. Select the **pii-contract-analyze** skill
3. **Connect a folder** containing your document (click the folder icon in Cowork, or use "Select folder")
4. Ask Claude what you need — reference the file by name, **do not attach it directly**:

```
You: Analyze risks for the purchaser in contract.pdf and prepare a short memo
```

Claude will call `anonymize_file` (only the file path goes through the API), read the anonymized text from the output file, offer you a review link, analyze the anonymized version, and deliver the final memo with real names restored.

If you ran the pre-install script (Step 1), PII Shield loads in ~30 seconds. If not, Claude will show installation progress (~5-10 min, first time only).

---

## Human-in-the-Loop Review

After anonymization, Claude offers you a review step with a local web UI:

1. **Claude calls `start_review`** — starts a localhost-only web server and presents the URL
2. **You open the link** in your browser — see the full document with color-coded entity highlights
3. **Remove false positives** — click any highlighted entity to remove it. All occurrences of the same text are removed automatically.
4. **Add missed entities** — select text and choose the entity type. All occurrences are added automatically during re-anonymization.
5. **Approve** — Claude re-anonymizes with your corrections. The server fetches overrides internally — no PII passes through the API.

PII never leaves your machine. The review page runs on `localhost:8766`.

---

## What if I didn't pre-install?

No problem. PII Shield is fully self-bootstrapping:

1. When you start a conversation with the skill, Claude will detect that dependencies are being installed
2. Claude shows progress messages ("Installing PyTorch...", "Downloading BERT model...", etc.)
3. After ~10 minutes, Claude asks you to type **"go"** to continue
4. From that point on, every subsequent start is instant

This only happens once. After the first install, PII Shield starts in seconds.

---

## Privacy Architecture

PII Shield is designed so that **PII never flows through Claude's API** at any stage:

| Stage | What happens | PII in API? |
|-------|-------------|-------------|
| **Anonymize** | `anonymize_file(path)` — server reads file on host, writes anonymized `.txt` to disk, returns only `output_path` | No — only path string |
| **Claude reads** | Claude reads the anonymized `.txt` file from disk | No — only placeholders |
| **HITL Review** | User reviews on localhost web UI. Server stores overrides to disk. | No — localhost only |
| **Re-anonymize** | `anonymize_file(path, review_session_id=id)` — server loads overrides from disk internally | No — only path + session ID |
| **Deanonymize** | `deanonymize_docx(path, session_id)` — writes restored file to disk, returns only path | No — only path string |
| **Deliver** | Claude gives user the file path. Claude NEVER reads the deanonymized file. | No |

---

## Use Cases

| Use case | What happens |
|----------|-------------|
| **Legal memo** | Connect a folder with a contract, get risk analysis. Claude works with `<ORG_1>` and `<PERSON_2>`, PII Shield restores real names in the final .docx |
| **Contract redline** | Ask Claude to suggest tracked changes on the anonymized .docx. All edits reference placeholders; restored document has real names with Word-native revision marks |
| **Bulk review** | Upload up to 5 NDAs, get a comparison table. Each file gets its own prefix (`D1`, `D2`...) |
| **Quick summary** | Drop a 20-page agreement, get a structured overview without exposing any PII |
| **Anonymize only** | Just anonymize a document for external sharing, no LLM analysis needed |

## Features

- **High-quality NER** — GLiNER zero-shot NER (`urchade/gliner_small-v2.1`) — handles ALL-CAPS legal names, domain-specific companies
- **Self-bootstrapping** — Auto-installs all dependencies on first run (or pre-install for instant start)
- **Human-in-the-Loop Review** — Local web UI to verify anonymization, remove false positives, add missed entities
- **PDF support** — `anonymize_file` handles `.pdf`, `.docx`, `.txt`, `.md`, `.csv`
- **Exact entity forms** — "Acme" (`<ORG_1>`) and "Acme Corp." (`<ORG_1a>`) get separate placeholders, each restored exactly
- **False positive filtering** — 212-term stoplist for legal/contract terms, article stripping, multi-word analysis, Cyrillic homoglyph handling
- **DOCX support** — Anonymize/deanonymize Word documents preserving all formatting, including tracked changes (`w:ins`/`w:del`)
- **17 EU pattern recognizers** — UK NIN/NHS, DE Tax ID, FR NIR, IT Fiscal Code, ES DNI/NIE, CY TIC, EU VAT/IBAN, and more
- **Cross-process persistence** — Review data saved to disk, works across multiple MCP server instances
- **PII-safe by design** — Mapping stored locally, real values never returned to Claude, deanonymized files never read by Claude

## Entity Deduplication

PII Shield uses family-based deduplication that preserves exact entity forms:

```
"Acme"                 -> <ORG_1>     (family root)
"Acme Corp."           -> <ORG_1a>    (variant a)
"Acme Corporation"     -> <ORG_1b>    (variant b)
"GlobalTech"           -> <ORG_2>     (different family)
"GlobalTech Ltd."      -> <ORG_2a>    (variant a)
```

## Detected Entity Types

**NER-based** (GLiNER zero-shot): PERSON, ORGANIZATION, LOCATION, NRP (nationality/religion/political group)

**Pattern-based** (Presidio + EU recognizers): EMAIL_ADDRESS, PHONE_NUMBER, URL, IP_ADDRESS, CREDIT_CARD, IBAN_CODE, CRYPTO, US_SSN, US_PASSPORT, US_DRIVER_LICENSE, UK_NHS, UK_NIN, UK_PASSPORT, DE_TAX_ID, FR_NIR, IT_FISCAL_CODE, ES_DNI, ES_NIE, CY_TIC, EU_VAT, and more.

> **Note:** DATE_TIME detection is disabled by default — Presidio's DateRecognizer produces too many false positives on legal documents ("30 days", section numbers, standalone years).

---

## Architecture

```
+-------------------------------------------------+
|                  Claude Desktop                  |
|                                                  |
|  +--------------+       +---------------------+ |
|  | Skill (.skill)|       |  MCP Server (.mcpb) | |
|  |              |       |                     | |
|  | SKILL.md     |  MCP  | pii_shield_server.py| |
|  | (instructions|<----->| eu_recognizers.py   | |
|  |  for Claude) | stdio | review_ui.html      | |
|  +--------------+       |                     | |
|                         |  +---------------+  | |
|                         |  |  PIIEngine    |  | |
|                         |  |               |  | |
|                         |  | Presidio +    |  | |
|                         |  | GLiNER NER +  |  | |
|                         |  | SpaCy         |  | |
|                         |  +---------------+  | |
|                         |                     | |
|                         |  Review Web Server  | |
|                         |  (localhost:8766)    | |
|                         +---------------------+ |
+-------------------------------------------------+
```

### Three-Phase Bootstrap

| Phase | What happens | Time | Blocking? |
|-------|-------------|------|-----------|
| **1** | Install `mcp` package | ~2s | Yes (server needs it to start) |
| **2** | Install heavy packages (PyTorch, Presidio, SpaCy, etc.) | 2-4 min | No (background) |
| **3** | Download AI models (GLiNER NER, SpaCy tokenizer) | 1-2 min | No (background) |

Server starts accepting MCP connections after Phase 1 (~2 seconds). Tools respond with installation progress until Phases 2+3 complete.

## MCP Tools

| Tool | Description |
|------|------------|
| `anonymize_file` | **Preferred.** Anonymize PII in a file (.pdf, .docx, .txt, .md, .csv). Only the file path goes through the API. For .docx, returns both `.txt` and `.docx` output. |
| `find_file` | Find a file by name in the configured working directory |
| `start_review` | Start local HITL review server, return URL (does not open browser) |
| `get_review_status` | Check if user approved the review. Returns status + has_changes only (no PII) |
| `deanonymize_text` | Restore PII — writes to local file, never returns to Claude |
| `deanonymize_docx` | Restore PII in .docx preserving formatting (including tracked changes) |
| `get_mapping` | Get placeholder keys and types (no real PII values) |
| `list_entities` | Show status, backend info, and recent sessions |
| `anonymize_text` | Anonymize PII in plain text (use `anonymize_file` instead for privacy) |
| `anonymize_docx` | Anonymize PII in .docx preserving formatting (use `anonymize_file` instead) |
| `scan_text` | Detect PII without anonymizing (preview mode) |

## Skill Modes

| Mode | Description |
|------|------------|
| **MEMO** | Legal analysis memo with risk assessment |
| **REDLINE** | Tracked changes in contract with Word-native revision marks |
| **SUMMARY** | Brief overview of key terms |
| **COMPARISON** | Diff two documents |
| **BULK** | Process up to 5 files |
| **ANONYMIZE-ONLY** | Just anonymize, no analysis |

## Configuration

Set in Claude Desktop: **Settings > Extensions > PII Shield**

| Setting | Default | Description |
|---------|---------|------------|
| Min confidence score | `0.50` | Minimum NER confidence threshold (0.0-1.0) |
| GLiNER model | `urchade/gliner_small-v2.1` | HuggingFace GLiNER model for zero-shot NER |
| Working directory | *(empty)* | Folder path for automatic file resolution by `find_file` |

Environment variable `PII_MAPPING_TTL_DAYS` (default: `7`) — auto-delete mappings older than N days.

## Project Structure

```
PII-Shield/
|-- server/
|   |-- pii_shield_server.py    # MCP server (main)
|   |-- eu_recognizers.py       # 17 EU pattern recognizers
|   |-- review_ui.html          # HITL review web UI
|   |-- requirements.txt
|   +-- pyproject.toml
|-- pii-contract-analyze/
|   +-- SKILL.md                # Skill instructions for Claude
|-- dist/
|   |-- pii-shield-v6.0.0.mcpb # Ready-to-install MCP bundle
|   +-- pii-contract-analyze.skill
|-- manifest.json               # MCP bundle manifest
|-- setup_pii_shield.py         # Pre-install script (Python)
|-- setup_pii_shield.bat        # Pre-install script (Windows, double-click)
|-- setup_pii_shield.sh         # Pre-install script (macOS/Linux)
|-- LICENSE
+-- README.md
```

## Development

```bash
# Run server directly (stdio mode)
python server/pii_shield_server.py

# Run with SSE transport
python server/pii_shield_server.py --sse

# Pre-install dependencies
python setup_pii_shield.py
```

## Logs

PII Shield writes two local log files. Neither is sent anywhere — both stay on your machine.

| Log | Location | What's inside |
|-----|----------|---------------|
| **Audit log** | `~/.pii_shield/audit/mcp_audit.log` | Every MCP tool call and response. Proves that only file paths and session IDs flow through the API — no real names, addresses, or other PII. Hand this to your compliance team. |
| **NER log** | `~/.pii_shield/audit/ner_debug.log` | Raw NER detections, skip reasons, recognizer names, anonymization mapping, docx replacement details. Use this to diagnose why an entity was missed or incorrectly detected. |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Python not found" | Install [Python 3.10+](https://www.python.org/downloads/) and make sure "Add to PATH" is checked during installation |
| First run takes forever | Run `python setup_pii_shield.py` first, or wait ~10 min for auto-install |
| Tools not appearing | Wait 30-60 seconds, then send any message to Claude. Tools load lazily. |
| "pip install failed" | Check your internet connection. Corporate firewalls may block PyPI or HuggingFace |
| GLiNER model download fails | The server falls back to SpaCy-only NER (lower quality but functional). Retry later or check proxy settings |
| HITL review page not loading | Check that port 8766 is free. The server tries port 8767 as fallback. |
| Too many false positives | Default min score is `0.50`. 212-term stoplist filters contract roles, legal terms, generic nouns. Raise `PII_MIN_SCORE` further if needed. |

## Author

**Grigorii Moskalev** — [LinkedIn](https://www.linkedin.com/in/grigorii-moskalev/)

## License

MIT
