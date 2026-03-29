"""
PII Shield — Pre-Install Setup
================================
Run this BEFORE installing the PII Shield extension in Claude Cowork.
Installs all required packages and downloads AI models.

Usage:
    python setup_pii_shield.py

Requirements:
    - Python 3.10+ installed and in PATH
    - Internet connection
    - ~1 GB free disk space
"""

import subprocess
import sys
import os
import time
import shutil

# ============================================================
# Config
# ============================================================
MIN_PYTHON = (3, 10)

PACKAGES = [
    ("mcp",               "mcp[cli]>=1.0.0",           "MCP SDK"),
    ("presidio_analyzer",  "presidio-analyzer>=2.2.355", "Presidio Analyzer (PII detection)"),
    ("spacy",             "spacy>=3.7.0",               "SpaCy (NLP tokenization)"),
    ("docx",              "python-docx>=1.1.0",         "python-docx (Word documents)"),
    ("cryptography",      "cryptography>=42.0.0",       "Cryptography"),
    ("numpy",             "numpy>=1.24.0",              "NumPy"),
    ("torch",             "torch>=2.0.0",               "PyTorch (inference engine) ~450 MB"),
    ("gliner",            "gliner>=0.2.7",              "GLiNER (zero-shot NER) ~50 MB"),
]

SPACY_MODEL = "en_core_web_sm"
GLINER_MODEL = "urchade/gliner_small-v2.1"


# ============================================================
# Helpers
# ============================================================
def header(msg):
    w = max(len(msg) + 4, 50)
    print(f"\n{'=' * w}")
    print(f"  {msg}")
    print(f"{'=' * w}\n")


def ok(msg):
    print(f"  [OK] {msg}")


def fail(msg):
    print(f"  [FAIL] {msg}")


def info(msg):
    print(f"  ... {msg}")


def pip_install(specs, desc=""):
    """Install pip packages with visible progress."""
    cmd = [sys.executable, "-m", "pip", "install", "--progress-bar=on", "--no-warn-script-location"] + specs
    result = subprocess.run(cmd)
    return result.returncode == 0


# ============================================================
# Steps
# ============================================================
def check_python():
    header("Step 1/4 — Checking Python")

    v = sys.version_info
    print(f"  Python {v.major}.{v.minor}.{v.micro}")
    print(f"  Path: {sys.executable}")

    if (v.major, v.minor) < MIN_PYTHON:
        fail(f"Python {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+ required, you have {v.major}.{v.minor}")
        print(f"\n  Download Python: https://www.python.org/downloads/")
        return False

    ok(f"Python {v.major}.{v.minor} — compatible")

    # Check pip
    try:
        import pip
        ok(f"pip available")
    except ImportError:
        fail("pip not found")
        print("  Run: python -m ensurepip --upgrade")
        return False

    # Check disk space (rough estimate: need ~1 GB)
    if os.name == "nt":
        drive = os.path.splitdrive(sys.executable)[0] or "C:"
        total, used, free = shutil.disk_usage(drive + "\\")
    else:
        total, used, free = shutil.disk_usage("/")
    free_gb = free / (1024 ** 3)
    if free_gb < 2:
        fail(f"Low disk space: {free_gb:.1f} GB free (need ~1 GB)")
        return False
    ok(f"Disk space: {free_gb:.1f} GB free")

    return True


def install_packages():
    header("Step 2/4 — Installing Python packages")
    print("  This may take a few minutes (PyTorch is ~450 MB).\n")

    missing = []
    already = []

    for import_name, pip_spec, desc in PACKAGES:
        try:
            __import__(import_name)
            already.append(desc)
        except ImportError:
            missing.append((pip_spec, desc))

    if already:
        for desc in already:
            ok(f"{desc} — already installed")
        print()

    if not missing:
        ok("All packages already installed!")
        return True

    print(f"  Installing {len(missing)} package(s):\n")
    for _, desc in missing:
        print(f"    - {desc}")
    print()

    specs = [s for s, _ in missing]
    success = pip_install(specs)

    if not success:
        fail("Package installation failed. Check errors above.")
        print("\n  Tip: If torch fails, try manually:")
        print("    pip install torch --index-url https://download.pytorch.org/whl/cpu")
        return False

    # Verify
    print()
    all_ok = True
    for import_name, _, desc in PACKAGES:
        try:
            mod = __import__(import_name)
            v = getattr(mod, "__version__", "?")
            ok(f"{desc} — v{v}")
        except ImportError:
            fail(f"{desc} — still not importable!")
            all_ok = False

    return all_ok


def download_spacy_model():
    header("Step 3/4 — Downloading SpaCy language model")

    try:
        import spacy
        try:
            spacy.load(SPACY_MODEL)
            ok(f"{SPACY_MODEL} — already downloaded")
            return True
        except OSError:
            pass
    except ImportError:
        fail("SpaCy not installed (should have been installed in Step 2)")
        return False

    info(f"Downloading {SPACY_MODEL} (~15 MB)...")
    result = subprocess.run(
        [sys.executable, "-m", "spacy", "download", SPACY_MODEL]
    )

    if result.returncode != 0:
        fail(f"SpaCy model download failed")
        print(f"\n  Try manually: python -m spacy download {SPACY_MODEL}")
        return False

    ok(f"{SPACY_MODEL} downloaded successfully")
    return True


def download_gliner_model():
    header("Step 4/4 — Downloading GLiNER NER model")
    print(f"  Model: {GLINER_MODEL}")
    print(f"  Size: ~200 MB (first time only)\n")

    try:
        from gliner import GLiNER

        t0 = time.time()
        info(f"Downloading {GLINER_MODEL}...")
        GLiNER.from_pretrained(GLINER_MODEL)

        elapsed = time.time() - t0
        ok(f"{GLINER_MODEL} downloaded in {elapsed:.0f}s")
        return True

    except Exception as e:
        fail(f"Model download failed: {e}")
        print(f"\n  Tip: Check your internet connection and try again.")
        print(f"  The model will also auto-download on first use in Cowork.")
        return False


def verify():
    header("Verification — Quick PII detection test")

    try:
        from presidio_analyzer import AnalyzerEngine, RecognizerRegistry
        from presidio_analyzer.nlp_engine import NlpEngineProvider
        from presidio_analyzer.predefined_recognizers import GLiNERRecognizer

        info("Loading GLiNER engine (first load takes 10-20s)...")
        t0 = time.time()

        nlp_engine = NlpEngineProvider(nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
        }).create_engine()

        registry = RecognizerRegistry()
        registry.load_predefined_recognizers()
        registry.add_recognizer(GLiNERRecognizer(
            model_name=GLINER_MODEL,
            entity_mapping={
                "person": "PERSON",
                "company": "ORGANIZATION",
                "organization": "ORGANIZATION",
                "location": "LOCATION",
            },
            flat_ner=False,
            multi_label=True,
            map_location="cpu",
        ))

        analyzer = AnalyzerEngine(nlp_engine=nlp_engine, registry=registry)

        load_time = time.time() - t0
        ok(f"Engine loaded in {load_time:.1f}s")

        info("Running test detection (including ALL-CAPS legal text)...")
        test_text = "NICHOLAS JON FOREMAN and CANNASOUTH LIMITED signed the contract in London."
        results = analyzer.analyze(text=test_text, entities=["PERSON", "ORGANIZATION", "LOCATION"], language="en")

        detect_time = time.time() - t0 - load_time
        types_found = set(r.entity_type for r in results)

        for r in results:
            ok(f"  {r.entity_type}: \"{test_text[r.start:r.end]}\" (score: {r.score:.2f})")

        if "PERSON" in types_found and "ORGANIZATION" in types_found:
            ok(f"Detection working — found {len(results)} entities")
            ok(f"Detection time: {detect_time*1000:.0f}ms")
            return True
        else:
            fail(f"Detection returned unexpected results: {types_found}")
            return False

    except Exception as e:
        fail(f"Verification failed: {e}")
        print(f"\n  The server will still try to work, but there may be issues.")
        return False


# ============================================================
# Main
# ============================================================
def main():
    print()
    print("  PII Shield — Pre-Install Setup")
    print("  ================================")
    print("  This will install all dependencies for PII Shield.")
    print("  Estimated download: ~1 GB (first time only)")
    print("  Estimated time: 5-15 minutes")
    print()

    t0 = time.time()
    results = {}

    # Step 1
    results["python"] = check_python()
    if not results["python"]:
        print("\n  Setup cannot continue. Install Python 3.10+ first.")
        sys.exit(1)

    # Step 2
    results["packages"] = install_packages()
    if not results["packages"]:
        print("\n  Setup cannot continue. Fix package installation errors above.")
        sys.exit(1)

    # Step 3
    results["spacy"] = download_spacy_model()

    # Step 4
    results["gliner"] = download_gliner_model()

    # Verify
    results["verify"] = verify()

    elapsed = time.time() - t0

    # Summary
    header("Setup Complete")

    all_ok = all(results.values())

    for step_name, passed in results.items():
        status = "[OK]" if passed else "[!] "
        print(f"  {status} {step_name}")

    print(f"\n  Total time: {elapsed:.0f}s")

    if all_ok:
        print("\n  All dependencies installed and verified!")
        print("  You can now install the PII Shield extension in Claude Cowork.")
        print("  The extension will start instantly (no additional downloads needed).")
    else:
        print("\n  Some steps had issues (see above).")
        print("  The extension may still work — it has built-in fallbacks.")
        print("  Install it in Cowork and try. Missing items will auto-download.")

    print()
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
