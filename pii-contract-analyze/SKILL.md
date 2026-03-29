---
name: pii-contract-analyze
description: "Universal legal document processor with PII anonymization. Anonymize → Work → Deanonymize. Modes: MEMO (legal analysis), REDLINE (tracked changes in contract), SUMMARY (brief overview), COMPARISON (diff two docs), BULK (up to 5 files). Supports .docx and .pdf input. Trigger for: contract review, risk analysis, compliance check, GDPR review, clause analysis, tracked changes, redline, 'anonymize', 'pii shield'. If user uploads contract/NDA/DSAR/HR doc — USE THIS SKILL. If user says 'skip pii' or 'don't anonymize' — skip anonymization and work directly."
---

# PII Shield — Universal Legal Document Processor

Anonymize → Work → Deanonymize → Deliver. Claude NEVER sees raw PII at any stage.

## CRITICAL: PII never flows through Claude

**File handling**: The user must connect a folder (not attach the file directly to the message). When a file is attached to a Cowork message, its content is rendered and sent to the API as part of the prompt — Claude sees the raw data before PII Shield can process it. When a folder is connected, Claude only sees the file path and can extract text in the sandbox, then anonymize it through PII Shield.

**If the user attaches a file directly**: Warn them politely: "For full PII protection, please connect the folder containing your document instead of attaching it directly. When a file is attached to a message, its content is included in the API request before PII Shield can anonymize it. I can still process it, but the privacy guarantee is stronger when you connect the folder."

- `anonymize_*` tools process PII locally and return only placeholders to Claude
- `deanonymize_*` tools write results to LOCAL FILES and return only the file path
- `get_mapping` returns only placeholder keys and types — no real values
- Claude must NEVER read deanonymized files — just give the user a link
- Claude must NEVER read the source file (via Read tool, pandoc, python, bash, etc.) BEFORE or INSTEAD OF anonymization — always extract text and send to `anonymize_text` first
- If `anonymize_text` response contains a `mapping` field with real PII values — IGNORE it completely. Only use the `anonymized_text` and `session_id` fields.
- If an anonymize tool times out or fails with a NON-"tool not found" error — retry once. If it still fails, tell the user PII Shield is unavailable and ask whether to proceed without anonymization or abort. NEVER fall back to reading the raw file.

## IMPORTANT: Tool invocation — deferred tools

PII Shield tools load lazily ("deferred") and may NOT appear in Claude's active tool list immediately. **This does NOT mean they are unavailable.** They typically become available within 10–30 seconds. On first install, the server auto-installs packages and downloads the GLiNER NER model (~1 GB total), which can take 5–10 minutes. On subsequent starts (or if user pre-installed via setup script), the server loads models into memory (~1-2 minutes).

**CRITICAL**: Cowork refreshes its deferred tool list only when a new user message arrives. Long sleep-probe loops within a single Claude turn will NOT make tools appear. You MUST yield control to the user when tools are not yet available, so Cowork can refresh.

### Warm-up sequence (MANDATORY before any anonymization call)

**Phase A — Quick probes (~30s, handles the case when tools load fast):**

1. **Probe 1**: Call `mcp__PII_Shield__list_entities`.
   - If `"status": "ready"` → **proceed to anonymization**.
   - If `"status": "loading"` → go to **Phase C** (wait for install).
   - If fails ("No such tool") → do useful prep work (create TodoList, detect mode from user's request).
2. `sleep 10` → **Probe 2**: Call `mcp__PII_Shield__list_entities`.
   - If success → proceed / handle loading as above.
   - If fails → do more prep work (check uploaded file metadata, plan analysis structure).
3. `sleep 10` → **Probe 3**: Call `mcp__PII_Shield__list_entities`.
   - If success → proceed / handle loading as above.
   - If fails → go to **Phase B**.

**Phase B — Ask user for a message to activate tools:**

After 3 quick probes failed, Cowork hasn't loaded the tool definitions yet. Cowork refreshes its tool list ONLY when a new user message arrives. We must yield control.

4. Tell user: **"PII Shield tools are loading. Please send me any message (e.g., 'go') so I can connect to PII Shield and start the analysis."**
   **STOP. Do NOT sleep or retry. Wait for user's next message.**

**Phase C — After user sends a message (or after "loading" detected in Phase A):**

5. Call `mcp__PII_Shield__list_entities`.
   - If `"status": "ready"` → **proceed to anonymization**.
   - If `"status": "loading"` → server is running but first-time install is in progress. Go to **Phase D**.
   - If fails ("No such tool") → tools still not visible. `sleep 30` → probe again. If still fails → `sleep 30` → probe. If still fails → tell user: **"PII Shield is still connecting. Please send one more message."** → STOP. Go to Phase E on next message.

**Phase D — Wait for server to become ready (when server reports "loading"):**

The server is loading. Check the `"phase"` field to determine what's happening:
- `"phase": "packages"` = installing pip packages (first install, ~5-10 min)
- `"phase": "models"` = downloading/loading AI models (~1-3 min)
- `"phase": "engine"` = initializing PII engine (~30-60s)

6. Tell user based on phase:
   - If `packages` phase: **"PII Shield is installing dependencies for the first time. This is a one-time setup (~5-10 minutes). I'll keep you updated."**
   - If `models` or `engine` phase: **"PII Shield is loading AI models (~1-2 minutes). Please wait."**
7. Enter a wait loop (max 15 iterations):
   - `sleep 30` → Probe `list_entities`.
   - If `"status": "ready"` → **proceed to anonymization**.
   - If `"status": "loading"` → show the server's `"message"` field to the user. Continue loop.
   - If fails → show a generic progress message. Continue loop.
8. After 15 iterations: tell user **"PII Shield is taking longer than expected. Please send 'go' to retry."** → STOP. Wait for user message, then go to Phase C.

**Phase E — Second user message (if Phase C didn't work):**

9. Call `mcp__PII_Shield__list_entities`.
   - If `"status": "ready"` → **proceed to anonymization**.
   - If `"status": "loading"` → go to **Phase D**.
   - If fails → `sleep 30` → probe → `sleep 30` → probe.
     If still fails → report error: **"PII Shield tools could not be loaded. Please check: (1) Python 3.10+ is in PATH, (2) PII Shield extension is enabled in Settings > Extensions, (3) try restarting the conversation. Or I can proceed without anonymization if you prefer."**

**Key rules**:
- Do NOT call `anonymize_text` until `list_entities` has succeeded with `"status": "ready"`.
- "No such tool available" = Cowork hasn't loaded the tools yet. Yield control to the user so Cowork can refresh.
- `"status": "loading"` = server is running, loading in progress. Wait in Phase D.
- Non-"tool not found" errors (timeouts, server errors) = retry the specific tool once, then report.
- If user says "try again" / "check again" / "ready" / "go" — call `list_entities` immediately.
- NEVER read the source file directly. If tools are unavailable, WAIT — do not bypass anonymization.
- **Do NOT try to read files on the host machine** (like `~/.pii_shield/status.json`) — Cowork runs in a sandbox and cannot access the host filesystem outside of mounted paths.
- While waiting for PII Shield, do useful prep work in parallel: extract text from uploaded file, plan analysis structure, read skill instructions.

All PII Shield tools are registered as MCP tools with prefix `mcp__PII_Shield__`.

## Available MCP tools

| MCP tool name | Parameters | Returns to Claude |
|---|---|---|
| `mcp__PII_Shield__anonymize_text` | text, language, prefix | Anonymized text + session_id |
| `mcp__PII_Shield__anonymize_file` | file_path, language, prefix | output_path + session_id |
| `mcp__PII_Shield__anonymize_docx` | file_path, language, prefix | Anonymized docx path + session_id |
| `mcp__PII_Shield__deanonymize_text` | text, session_id, output_path | **File path only** |
| `mcp__PII_Shield__deanonymize_docx` | file_path, session_id | **File path only** |
| `mcp__PII_Shield__get_mapping` | session_id | Placeholder keys + types only |
| `mcp__PII_Shield__scan_text` | text, language | Entity detection preview |
| `mcp__PII_Shield__list_entities` | — | Server status and config |

**`prefix` parameter** (new in v5.0): Use for multi-file workflows to avoid placeholder collisions. Example: `prefix="D1"` → `<D1_ORG_1>`, `prefix="D2"` → `<D2_ORG_1>`. Each file gets its own prefix and session_id.

**Preferred approach**: Always extract text in the sandbox first, then call `anonymize_text`. The `anonymize_file`/`anonymize_docx` tools require host file paths which are not accessible from the Cowork sandbox.

## Skip mode

If user says "skip pii shield", "don't anonymize", "work directly" — skip anonymization, work with the file directly.

---

## MODE DETECTION

Detect the mode from the user's request. If ambiguous, ask.

| User says | Mode |
|---|---|
| "review contract", "risk analysis", "legal analysis", "write a memo", "compliance check" | **MEMO** |
| "tracked changes", "redline", "mark up", "make client-friendly", "edit the contract" | **REDLINE** |
| "summarize", "overview", "brief summary", "what's in the contract" | **SUMMARY** |
| "compare documents", "diff", "what changed", "differences" | **COMPARISON** |
| Multiple files uploaded + any of the above | **BULK** (wraps any mode above) |
| "just anonymize", "anonymize only", "only anonymization" | **ANONYMIZE-ONLY** |

---

## MODE: MEMO (Legal Analysis)

Full legal memorandum with risk assessment. The default mode.

### Pipeline

```
1. Warm-up: list_entities() → confirm tools loaded
2. Extract text from uploaded file (pdfplumber for PDF, python-docx for DOCX)
3. anonymize_text(text) → anonymized_text, session_id
4. Analyze anonymized text → structured memo with <ORG_1> etc.
5. Create formatted .docx via docx-js (read the `docx` SKILL.md first!)
6. deanonymize_docx(formatted.docx, session_id) → final.docx
7. Copy to mnt/outputs/, present link to user
```

### Writing Style — see section below

---

## MODE: REDLINE (Tracked Changes)

Apply tracked changes to make the contract more favorable for the specified party. Output is a .docx with Word-native revision marks (accept/reject in Word).

### Pipeline

```
1. Warm-up: list_entities() → confirm tools loaded
2. Extract text from uploaded file (pdfplumber for PDF, python-docx for DOCX)
3. anonymize_text(text) → anonymized_text, session_id
4. Analyze: identify clauses to change, draft new wording (all in placeholders)
5. Create .docx with tracked changes via OOXML manipulation (python-docx + lxml)
6. deanonymize_docx(tracked_changes.docx, session_id) → final.docx
7. Copy to mnt/outputs/, present link to user
```

### Step 5: OOXML Tracked Changes

Tracked changes in .docx are XML elements `w:ins` (insertion) and `w:del` (deletion) inside paragraph runs. They require `w:rPr` (run properties) to preserve formatting and `w:author`/`w:date` attributes.

**Critical implementation details:**
- Work on the anonymized .docx from Step 2 (preserves original formatting)
- Use `python-docx` to open the document + `lxml` to manipulate XML directly
- For each change: find the target paragraph → locate the text run → split at the change point → wrap deleted text in `w:del > w:r > w:delText` → insert new text in `w:ins > w:r > w:t`
- Preserve all `w:rPr` (font, size, bold, etc.) from the original run
- Set `w:author="Claude"` and `w:date` to current ISO datetime
- Save with `doc.save()` — python-docx preserves the rest of the document

**Example XML structure for a tracked change:**
```xml
<w:p>
  <w:r><w:rPr>...</w:rPr><w:t>unchanged text before </w:t></w:r>
  <w:del w:author="Claude" w:date="2026-03-27T12:00:00Z">
    <w:r><w:rPr>...</w:rPr><w:delText>old text</w:delText></w:r>
  </w:del>
  <w:ins w:author="Claude" w:date="2026-03-27T12:00:00Z">
    <w:r><w:rPr>...</w:rPr><w:t>new text</w:t></w:r>
  </w:ins>
  <w:r><w:rPr>...</w:rPr><w:t> unchanged text after</w:t></w:r>
</w:p>
```

**Important**: All changes use placeholder text (`<ORG_1>`, `<PERSON_2>`). After `deanonymize_docx`, the tracked changes will contain real names/entities.

---

## MODE: SUMMARY (Brief Overview)

Concise document summary — key parties, subject, term, financial terms, notable risks.

### Pipeline

```
1. Warm-up: list_entities() → confirm tools loaded
2. Extract text from uploaded file (pdfplumber for PDF, python-docx for DOCX)
3. anonymize_text(text) → anonymized_text, session_id
4. Write summary (1–2 pages max) with placeholders
5. Create formatted .docx via docx-js (lighter formatting than MEMO)
6. deanonymize_docx(summary.docx, session_id) → final.docx
7. Copy to mnt/outputs/, present link to user
```

### Summary structure

1. **Header**: Document type + parties (`Purchase Order between <ORG_1> and <ORG_2>`)
2. **Key terms table**: Party A, Party B, Subject, Term, Total value, Payment terms, Governing law
3. **Notable provisions**: 3–5 bullet points on unusual or important clauses
4. **Risk flags**: Brief list of potential issues (if any)

---

## MODE: COMPARISON (Diff Two Documents)

Compare two versions of a document or two related documents. Show what changed.

### Pipeline

```
1. Warm-up: list_entities() → confirm tools loaded
2. Extract text from file_1 and file_2
3. anonymize_text(text_1, prefix="D1") → anonymized_1, session_id_1
4. anonymize_text(text_2, prefix="D2") → anonymized_2, session_id_2
5. Compare: structural diff (added/removed/changed clauses)
6. Create comparison report .docx via docx-js
   — Use D1 session_id for deanonymization (primary document)
   — D2 placeholders remain as-is OR use deanonymize_text for D2 references
7. deanonymize_docx(comparison.docx, session_id_1) → final.docx
8. Copy to mnt/outputs/, present link to user
```

**Note**: With prefix support, `<D1_ORG_1>` and `<D2_ORG_1>` won't collide even if both files mention the same entity. The comparison report can reference both sets of placeholders.

---

## MODE: BULK (Multiple Files)

Process up to 5 files. Wraps any of the modes above.

### Pipeline

```
1. Warm-up: list_entities() → confirm tools loaded
2. For each file i (1..N):
   Extract text → anonymize_text(text_i, prefix=f"D{i}") → anonymized_i, session_id_i
3. Apply the requested mode (MEMO/SUMMARY/COMPARISON) across all anonymized texts
4. Create output .docx with all placeholder sets
5. Deanonymize: use session_id of the PRIMARY document (usually D1)
   — Other documents' placeholders: deanonymize_text for text snippets,
     or leave as placeholders with a legend table mapping D1/D2/D3 to file names
6. Copy to mnt/outputs/, present link to user
```

**Important**: Each file gets its own `prefix` and `session_id`. The prefix prevents placeholder collisions (`<D1_ORG_1>` vs `<D2_ORG_1>`).

---

## MODE: ANONYMIZE-ONLY

Just anonymize and return the anonymized file. No analysis.

### Pipeline

```
1. Warm-up: list_entities() → confirm tools loaded
2. Extract text from uploaded file
3. anonymize_text(text) → anonymized_text, session_id
4. Save anonymized text to mnt/outputs/anonymized.txt (or create .docx)
5. Present link to user
6. Tell user the session_id in case they need deanonymization later
```

---

## File Input Handling

**IMPORTANT**: PII Shield tools run on the HOST machine (Windows/Mac), not in the Cowork sandbox (Linux VM). File paths from the sandbox do NOT map to host paths. **Always extract text in the sandbox and use `anonymize_text`** — this is the most reliable approach.

### Any file type (.pdf, .docx, .txt):

1. **Extract text** in the sandbox:

For `.pdf`:
```python
pip install pdfplumber -q
import pdfplumber
with pdfplumber.open("input.pdf") as pdf:
    text = "\n".join(page.extract_text() or "" for page in pdf.pages)
```

For `.docx`:
```python
pip install python-docx -q
from docx import Document
doc = Document("input.docx")
text = "\n".join(p.text for p in doc.paragraphs)
```

For `.txt`/`.md`/`.csv`: read directly.

2. **Check extracted text**: If `len(text) < 100` AND file size > 50KB → likely a scanned PDF with no text layer. Tell user: "This PDF does not contain a text layer. OCR for scanned documents is not yet supported."

3. **Anonymize the text**:
```
anonymize_text(text, language="en") → anonymized_text, session_id
```

4. Continue with the chosen mode using `anonymized_text`.

---

## Path Mapping for deanonymize_docx

The `deanonymize_docx` tool runs on the HOST machine (Windows), not in the Linux VM. File paths must be converted.

**Rule**: Take the `output_path` returned by `anonymize_file`/`anonymize_docx` and derive the Windows path pattern from it. The anonymized file's `output_path` shows the Windows path format for the uploads folder. To reference a file in the outputs folder, replace `\uploads\` with `\outputs\` in the path pattern.

**Example**:
- `anonymize_file` returns `output_path: "C:\Users\User\...\uploads\file_anonymized.docx"`
- Your file is at `/sessions/.../mnt/outputs/analysis.docx`
- Windows path: `"C:\Users\User\...\outputs\analysis.docx"`

If `deanonymize_docx` returns "Not found" — double-check the path. The file must exist at the Windows path on the host machine.

---

## Writing Style (for MEMO mode)

### Tone

Formal, precise, dispassionate. No hedging ("it seems", "it could potentially"). Direct statements: "Risk is high", "Deadline not established", "Liability is uncapped".

### Sentence structure

Short declarative sentences. Each sentence carries one idea.

### Opening

Bold title: `[Subject]: [Analytical framing]` — e.g., `<ORG_3>: Legal Risks of Purchase Order No. 3`. Below: 1-2 context paragraphs (who, what, why). No abstract.

### Section numbering

Strict hierarchical: `1.`, `2.`, `2.1.`, `2.2.` Section headings are bold and descriptive.

### Each risk/issue subsection:

1. Description of the issue
2. Direct quote from source (indented, italic, original language)
3. Analysis of implications
4. Risk assessment: "Risk: high/medium/low." + justification + recommendations

### Quotes

Original language, indented, italic, 11pt. Introduced with reference: "Section 7 of the Purchase Order states:" or "Section 13.2 provides:"

### Conclusion

Not generic. List of specific action items tied to specific risks: `[Risk label]: [specific action]`.

### Language

Adapts to user's language. Quotes stay in source language. English terms (SaaS, AI, GDPR, UGC) used as-is.

---

## Formatting Reference — Legal Memo (.docx)

**Read the `docx` SKILL.md first** for setup, validation, and critical rules for docx-js.

**CRITICAL: Every TextRun MUST have explicit `font: "Arial"` and `size`.** Do NOT rely on defaults.

### Setup

```javascript
const { Document, Packer, Paragraph, TextRun, AlignmentType,
        Table, TableRow, TableCell, WidthType, ShadingType } = require('docx');
const fs = require('fs');

const BODY_RUN = { font: "Arial", size: 24 };             // 12pt
const BOLD_RUN = { font: "Arial", size: 24, bold: true };  // 12pt bold
const QUOTE_RUN = { font: "Arial", size: 22, italics: true }; // 11pt italic
const STD_SPACING = { before: 0, after: 120, line: 240, lineRule: "auto" };
```

### Paragraph types

| Type | Bold? | Italic? | Size | First-line indent | Left indent | Spacing |
|------|-------|---------|------|-------------------|-------------|---------|
| Title | YES | no | 24 | 0 | 0 | STD_SPACING |
| Body | no | no | 24 | 630 | 0 | STD_SPACING |
| Section heading | YES | no | 24 | 0 | 0 | STD_SPACING |
| Blockquote | no | YES | 22 | 0 | 900 | STD_SPACING |
| Risk line | no | no | 24 | 630 | 0 | STD_SPACING |

**Blockquote**: `indent: { left: 900, firstLine: 0 }` — shifts ENTIRE paragraph right, not just first line.

### Document structure (MEMO)

1. Title (bold)
2. Context paragraphs (1–2)
3. Definitions section
4. Analysis sections (heading → body → blockquote → risk assessment)
5. Conclusion (action items)
6. Risk summary table (optional)

### Validation

```bash
python scripts/office/validate.py output.docx
```
