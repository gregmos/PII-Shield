@echo off
setlocal

echo.
echo   PII Shield - Dependency Installer
echo   ==================================
echo.
echo   This will install all dependencies for PII Shield.
echo   Requires Python 3.10+ (python.org/downloads)
echo   Estimated download: ~1 GB (first time only)
echo.
echo   Press any key to start, or Ctrl+C to cancel.
pause >nul
echo.

:: ── Find Python ──────────────────────────────────────────────
set PYTHON=
where python >nul 2>&1 && set PYTHON=python
if not defined PYTHON (where py >nul 2>&1 && set PYTHON=py -3)
if not defined PYTHON (where python3 >nul 2>&1 && set PYTHON=python3)

if not defined PYTHON (
    echo   ERROR: Python not found!
    echo.
    echo   Please install Python 3.10+ from https://www.python.org/downloads/
    echo   Make sure to check "Add Python to PATH" during installation.
    echo.
    goto :end
)

:: ── Check Python version ─────────────────────────────────────
echo   [1/4] Checking Python...
%PYTHON% -c "import sys; v=sys.version_info; print(f'  Python {v.major}.{v.minor}.{v.micro}'); exit(0 if (v.major,v.minor)>=(3,10) else 1)"
if %ERRORLEVEL% neq 0 (
    echo   ERROR: Python 3.10+ required!
    echo   Download: https://www.python.org/downloads/
    goto :end
)
echo   [OK]
echo.

:: ── Install packages ─────────────────────────────────────────
echo   [2/4] Installing Python packages (this may take a few minutes)...
echo         PyTorch is ~300 MB - please be patient.
echo.
%PYTHON% -m pip install --progress-bar=on --no-warn-script-location "mcp[cli]>=1.0.0" "presidio-analyzer>=2.2.355" "spacy>=3.7.0" "python-docx>=1.1.0" "cryptography>=42.0.0" "numpy>=1.24.0" "torch>=2.0.0" "gliner>=0.2.7"
if %ERRORLEVEL% neq 0 (
    echo.
    echo   ERROR: Package installation failed. Check errors above.
    echo   Tip: If torch fails, try: pip install torch --index-url https://download.pytorch.org/whl/cpu
    goto :end
)
echo.
echo   [OK] All packages installed.
echo.

:: ── Download SpaCy model ─────────────────────────────────────
echo   [3/4] Downloading SpaCy language model (~15 MB)...
%PYTHON% -m spacy download en_core_web_sm
if %ERRORLEVEL% neq 0 (
    echo   WARNING: SpaCy model download failed. It will auto-download on first use.
)
echo   [OK]
echo.

:: ── Download GLiNER model ────────────────────────────────────
echo   [4/4] Downloading GLiNER NER model (~200 MB)...
echo         This takes 2-3 minutes on a fast connection.
echo.
%PYTHON% -c "from gliner import GLiNER; GLiNER.from_pretrained('urchade/gliner_small-v2.1'); print('  [OK] GLiNER model downloaded.')"
if %ERRORLEVEL% neq 0 (
    echo   WARNING: GLiNER model download failed. It will auto-download on first use.
)

:: ── Done ─────────────────────────────────────────────────────
echo.
echo   ==================================
echo   Setup complete!
echo   ==================================
echo.
echo   You can now install PII Shield in Claude Desktop:
echo     1. Install pii-shield-v5.5.0.mcpb  (Settings ^> Extensions ^> Install extension)
echo     2. Upload pii-contract-analyze.skill (Customize ^> Skills ^> Upload a skill)
echo.
echo   Everything will start instantly - no more waiting!
echo.

:end
echo   Press any key to close...
pause >nul
endlocal
