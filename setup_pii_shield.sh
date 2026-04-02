#!/bin/bash

echo ""
echo "  PII Shield - Dependency Installer"
echo "  =================================="
echo ""
echo "  This will install all dependencies for PII Shield."
echo "  Requires Python 3.10+ (python.org/downloads)"
echo "  Estimated download: ~1 GB (first time only)"
echo ""
read -n 1 -s -r -p "  Press any key to start, or Ctrl+C to cancel." && echo ""
echo ""

# ── Find Python ──────────────────────────────────────────────
PYTHON=""
if command -v python3 &>/dev/null; then
    PYTHON="python3"
elif command -v python &>/dev/null; then
    PYTHON="python"
fi

if [ -z "$PYTHON" ]; then
    echo "  ERROR: Python not found!"
    echo ""
    echo "  macOS: brew install python3"
    echo "  Or download from https://www.python.org/downloads/"
    echo ""
    exit 1
fi

# ── Check Python version ─────────────────────────────────────
echo "  [1/4] Checking Python..."
$PYTHON -c "
import sys
v = sys.version_info
print(f'  Python {v.major}.{v.minor}.{v.micro}')
if (v.major, v.minor) < (3, 10):
    print('  ERROR: Python 3.10+ required!')
    sys.exit(1)
"
if [ $? -ne 0 ]; then
    echo "  Download: https://www.python.org/downloads/"
    exit 1
fi
echo "  [OK]"
echo ""

# ── Install packages ─────────────────────────────────────────
echo "  [2/4] Installing Python packages (this may take a few minutes)..."
echo "        PyTorch is ~300 MB - please be patient."
echo ""
$PYTHON -m pip install --progress-bar=on --no-warn-script-location \
    "mcp[cli]>=1.0.0" \
    "presidio-analyzer>=2.2.355" \
    "spacy>=3.7.0" \
    "python-docx>=1.1.0" \
    "cryptography>=42.0.0" \
    "numpy>=1.24.0" \
    "torch>=2.0.0" \
    "gliner>=0.2.7"

if [ $? -ne 0 ]; then
    echo ""
    echo "  ERROR: Package installation failed. Check errors above."
    echo "  Tip: If torch fails, try: pip install torch --index-url https://download.pytorch.org/whl/cpu"
    exit 1
fi
echo ""
echo "  [OK] All packages installed."
echo ""

# ── Download SpaCy model ─────────────────────────────────────
echo "  [3/4] Downloading SpaCy language model (~15 MB)..."
$PYTHON -m spacy download en_core_web_sm
if [ $? -ne 0 ]; then
    echo "  WARNING: SpaCy model download failed. It will auto-download on first use."
fi
echo "  [OK]"
echo ""

# ── Download GLiNER model ────────────────────────────────────
echo "  [4/4] Downloading GLiNER NER model (~200 MB)..."
echo "        This takes 2-3 minutes on a fast connection."
echo ""
$PYTHON -c "
from gliner import GLiNER
GLiNER.from_pretrained('urchade/gliner_small-v2.1')
print('  [OK] GLiNER model downloaded.')
"
if [ $? -ne 0 ]; then
    echo "  WARNING: GLiNER model download failed. It will auto-download on first use."
fi

# ── Done ─────────────────────────────────────────────────────
echo ""
echo "  =================================="
echo "  Setup complete!"
echo "  =================================="
echo ""
echo "  You can now install PII Shield in Claude Desktop:"
echo "    1. Install pii-shield-v6.0.0.mcpb  (Settings > Extensions > Install extension)"
echo "    2. Upload pii-contract-analyze.skill (Customize > Skills > Upload a skill)"
echo ""
echo "  Everything will start instantly - no more waiting!"
echo ""
