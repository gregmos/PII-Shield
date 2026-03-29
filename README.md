# PII Shield

**MCP server + Skill for Claude Desktop (Cowork)** that automatically anonymizes documents before Claude sees them — and restores everything back after analysis.

## The Problem

You want Claude to review contracts, draft legal memos, compare documents, or suggest edits — but the documents contain real names, addresses, emails, phone numbers, and other sensitive data. Sending raw PII to an LLM raises privacy and compliance concerns (GDPR, internal policies, client confidentiality).

## The Solution

PII Shield sits between your documents and Claude:

1. **You connect a folder** with your documents and select the `pii-contract-analyze` skill
2. **PII Shield automatically anonymizes** all personal data using GLiNER NER — names become `<PERSON_1>`, companies become `<ORG_1>`, etc.
3. **Claude analyzes the anonymized text** — writes memos, suggests edits, compares versions — never seeing the real data
4. **PII Shield restores** the original names back into Claude's output and saves the final document locally

Claude does the thinking. PII Shield keeps the data private.

> **Important: Do NOT attach files directly to your message.** When you attach a file, Cowork renders it and includes the content in the API request — Claude sees the raw data before PII Shield can process it. Instead, **connect a folder** (via the folder icon in Cowork) and tell Claude the file name. This way Claude only sees the file path, extracts text in the sandbox, and sends it through PII Shield before ever reading the content.

```
Document -> [PII Shield: GLiNER NER] -> Anonymized text -> [Claude: Analysis] -> [PII Shield: Restore] -> Result
              Acme Corp. -> <ORG_1>                                            <ORG_1> -> Acme Corp.
              John Smith  -> <PERSON_1>                                        <PERSON_1> -> John Smith
```

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

1. Download [`pii-shield-v5.5.0.mcpb`](dist/pii-shield-v5.5.0.mcpb) and [`pii-contract-analyze.skill`](dist/pii-contract-analyze.skill)
2. **MCP Server**: In Claude Desktop — **Settings > Extensions > Advanced settings** -> click **Install extension** -> select `pii-shield-v5.5.0.mcpb`
3. **Skill**: In Claude Desktop — **Customize > Skills** -> click **+** -> **Upload a skill** -> select `pii-contract-analyze.skill`

### Step 3: Use it

1. Start a new conversation in Claude Desktop
2. Select the **pii-contract-analyze** skill
3. **Connect a folder** containing your document (click the folder icon in Cowork, or use "Select folder")
4. Ask Claude what you need — reference the file by name, **do not attach it directly**:

```
You: Analyze risks for the purchaser in contract.pdf and prepare a short memo
```

Claude will read the file from the connected folder, anonymize it through PII Shield, analyze the anonymized version, and deliver the final memo with real names restored.

If you ran the pre-install script (Step 1), PII Shield loads in ~30 seconds. If not, Claude will show installation progress (~5-10 min, first time only).

---

## What if I didn't pre-install?

No problem. PII Shield is fully self-bootstrapping:

1. When you start a conversation with the skill, Claude will detect that dependencies are being installed
2. Claude shows progress messages ("Installing PyTorch...", "Downloading BERT model...", etc.)
3. After ~10 minutes, Claude asks you to type **"go"** to continue
4. From that point on, every subsequent start is instant

This only happens once. After the first install, PII Shield starts in seconds.

---

## Use Cases

| Use case | What happens |
|----------|-------------|
| **Legal memo** | Upload a contract, get risk analysis. Claude works with `<ORG_1>` and `<PERSON_2>`, PII Shield restores real names in the final .docx |
| **Contract redline** | Ask Claude to suggest tracked changes. All edits reference placeholders; restored document has real names |
| **Bulk review** | Upload up to 5 NDAs, get a comparison table. Each file gets its own prefix (`D1`, `D2`...) |
| **Quick summary** | Drop a 20-page agreement, get a structured overview without exposing any PII |
| **Anonymize only** | Just anonymize a document for external sharing, no LLM analysis needed |

## Features

- **High-quality NER** — GLiNER zero-shot NER (`urchade/gliner_small-v2.1`) — handles ALL-CAPS legal names, domain-specific companies
- **Self-bootstrapping** — Auto-installs all dependencies on first run (or pre-install for instant start)
- **Exact entity forms** — "Acme" (`<ORG_1>`) and "Acme Corp." (`<ORG_1a>`) get separate placeholders, each restored exactly
- **False positive filtering** — Stop-list for common legal terms + Cyrillic homoglyph handling
- **DOCX support** — Anonymize/deanonymize Word documents preserving all formatting
- **17 EU pattern recognizers** — UK NIN/NHS, DE Tax ID, FR NIR, IT Fiscal Code, ES DNI/NIE, CY TIC, EU VAT/IBAN, and more
- **PII-safe by design** — Mapping stored locally, real values never returned to Claude

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
|  |  for Claude) | stdio |                     | |
|  +--------------+       |  +---------------+  | |
|                         |  |  PIIEngine     |  | |
|                         |  |               |  | |
|                         |  | Presidio +    |  | |
|                         |  | GLiNER NER +    |  | |
|                         |  | SpaCy         |  | |
|                         |  +---------------+  | |
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
| `anonymize_text` | Anonymize PII in plain text |
| `anonymize_file` | Anonymize PII in a file (.docx, .txt, .md, .csv) |
| `anonymize_docx` | Anonymize PII in .docx preserving formatting |
| `deanonymize_text` | Restore PII — writes to local file, never returns to Claude |
| `deanonymize_docx` | Restore PII in .docx preserving formatting |
| `get_mapping` | Get placeholder keys and types (no real PII values) |
| `scan_text` | Detect PII without anonymizing (preview mode) |
| `list_entities` | Show status, backend info, and recent sessions |

## Skill Modes

| Mode | Description |
|------|------------|
| **MEMO** | Legal analysis memo with risk assessment |
| **REDLINE** | Tracked changes / markup in contract |
| **SUMMARY** | Brief overview of key terms |
| **COMPARISON** | Diff two documents |
| **BULK** | Process up to 5 files |

## Configuration

Environment variables (set in Cowork extension settings):

| Variable | Default | Description |
|----------|---------|------------|
| `PII_MIN_SCORE` | `0.35` | Minimum NER confidence threshold (0.0-1.0) |
| `PII_GLINER_MODEL` | `urchade/gliner_small-v2.1` | HuggingFace GLiNER model for zero-shot NER |
| `PII_MAPPING_TTL_DAYS` | `7` | Auto-delete mappings older than N days |

## Project Structure

```
PII-Shield/
|-- server/
|   |-- pii_shield_server.py    # MCP server (main)
|   |-- eu_recognizers.py       # 17 EU pattern recognizers
|   |-- requirements.txt
|   +-- pyproject.toml
|-- pii-contract-analyze/
|   +-- SKILL.md                # Skill instructions for Claude
|-- dist/
|   |-- pii-shield-v5.5.0.mcpb # Ready-to-install MCP bundle
|   |-- pii-contract-analyze.skill
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

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Python not found" | Install [Python 3.10+](https://www.python.org/downloads/) and make sure "Add to PATH" is checked during installation |
| First run takes forever | Run `python setup_pii_shield.py` first, or wait ~10 min for auto-install |
| Tools not appearing | Wait 30-60 seconds, then send any message to Claude. Tools load lazily. |
| "pip install failed" | Check your internet connection. Corporate firewalls may block PyPI or HuggingFace |
| BERT model download fails | The server falls back to SpaCy-only NER (lower quality but functional). Retry later or check proxy settings |

## Author

**Grigorii Moskalev** — [LinkedIn](https://www.linkedin.com/in/grigorii-moskalev/)

## License

MIT
