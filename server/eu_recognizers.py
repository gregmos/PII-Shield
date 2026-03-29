"""
European PII Recognizers for Presidio
======================================
Custom PatternRecognizers for EU/UK/CY-specific personal data identifiers.
Register these with the Presidio AnalyzerEngine to detect European PII.

Usage:
    from eu_recognizers import register_eu_recognizers
    register_eu_recognizers(analyzer)
"""

from presidio_analyzer import PatternRecognizer, Pattern


def register_eu_recognizers(analyzer):
    """Register all EU recognizers with an AnalyzerEngine."""
    recognizers = _build_recognizers()
    for rec in recognizers:
        analyzer.registry.add_recognizer(rec)
    return len(recognizers)


def _build_recognizers():
    recognizers = []

    # ================================================================
    # UK
    # ================================================================

    # UK National Insurance Number (NIN/NINO)
    # Format: AB 12 34 56 C (two letters, six digits, one letter)
    recognizers.append(PatternRecognizer(
        supported_entity="UK_NIN",
        supported_language="en",
        patterns=[
            Pattern("uk_nin_spaced", r"\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b", 0.7),
        ],
        context=["national insurance", "NI number", "NIN", "NINO", "tax", "HMRC", "PAYE"],
    ))

    # UK Passport Number — 9 digits
    recognizers.append(PatternRecognizer(
        supported_entity="UK_PASSPORT",
        supported_language="en",
        patterns=[
            Pattern("uk_passport", r"\b\d{9}\b", 0.1),  # low base, needs context
        ],
        context=["passport", "travel document", "UK passport", "HM Passport", "HMPO"],
    ))

    # UK Company Registration Number (CRN) — 8 digits or 2 letters + 6 digits
    recognizers.append(PatternRecognizer(
        supported_entity="UK_CRN",
        supported_language="en",
        patterns=[
            Pattern("uk_crn_numeric", r"\b\d{8}\b", 0.1),  # low base, needs context
            Pattern("uk_crn_alpha", r"\b[A-Z]{2}\d{6}\b", 0.4),
        ],
        context=["company number", "registration number", "Companies House",
                 "CRN", "registered number", "company reg"],
    ))

    # UK Driving Licence Number — complex format, 16 chars
    # MORGA657054SM9IJ (surname chars + DOB + initials + check)
    recognizers.append(PatternRecognizer(
        supported_entity="UK_DRIVING_LICENCE",
        supported_language="en",
        patterns=[
            Pattern("uk_dl", r"\b[A-Z]{5}\d{6}[A-Z0-9]{2}\d{2}[A-Z]{2}\b", 0.75),
        ],
        context=["driving licence", "driver's licence", "DVLA", "driving license"],
    ))

    # ================================================================
    # Germany
    # ================================================================

    # German Tax ID (Steuerliche Identifikationsnummer) — 11 digits
    recognizers.append(PatternRecognizer(
        supported_entity="DE_TAX_ID",
        supported_language="en",
        patterns=[
            Pattern("de_tax_id", r"\b\d{11}\b", 0.1),  # needs context
        ],
        context=["Steuer-ID", "Steueridentifikationsnummer", "tax identification",
                 "IdNr", "TIN", "German tax", "Finanzamt"],
    ))

    # German Social Security (Sozialversicherungsnummer) — 12 chars
    # Format: area(2) + DOB(6) + initial(1) + serial(2) + check(1)
    recognizers.append(PatternRecognizer(
        supported_entity="DE_SOCIAL_SECURITY",
        supported_language="en",
        patterns=[
            Pattern("de_sv", r"\b\d{2}\s?\d{6}\s?[A-Z]\s?\d{2}\s?\d\b", 0.6),
        ],
        context=["Sozialversicherungsnummer", "SV-Nummer", "social security",
                 "Rentenversicherung", "insurance number"],
    ))

    # ================================================================
    # France
    # ================================================================

    # French Social Security Number (NIR/INSEE) — 13 digits + 2 check
    # Format: S AA MM DDD CCC OOO CC
    recognizers.append(PatternRecognizer(
        supported_entity="FR_NIR",
        supported_language="en",
        patterns=[
            Pattern("fr_nir", r"\b[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}\b", 0.65),
        ],
        context=["NIR", "INSEE", "sécurité sociale", "social security",
                 "numéro de sécurité", "carte vitale"],
    ))

    # French National ID (CNI) — 12 digits
    recognizers.append(PatternRecognizer(
        supported_entity="FR_CNI",
        supported_language="en",
        patterns=[
            Pattern("fr_cni", r"\b\d{12}\b", 0.1),
        ],
        context=["carte nationale", "CNI", "national identity", "carte d'identité",
                 "French ID", "pièce d'identité"],
    ))

    # ================================================================
    # Italy
    # ================================================================

    # Italian Codice Fiscale — 16 chars alphanumeric
    # Format: RSSMRA85M01H501Z
    recognizers.append(PatternRecognizer(
        supported_entity="IT_FISCAL_CODE",
        supported_language="en",
        patterns=[
            Pattern("it_cf", r"\b[A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z]\b", 0.8),
        ],
        context=["codice fiscale", "fiscal code", "CF", "Italian tax"],
    ))

    # Italian Partita IVA (VAT) — 11 digits
    recognizers.append(PatternRecognizer(
        supported_entity="IT_VAT",
        supported_language="en",
        patterns=[
            Pattern("it_vat", r"\bIT\s?\d{11}\b", 0.75),
        ],
        context=["partita IVA", "VAT", "P.IVA", "Italian VAT"],
    ))

    # ================================================================
    # Spain
    # ================================================================

    # Spanish DNI — 8 digits + 1 letter
    recognizers.append(PatternRecognizer(
        supported_entity="ES_DNI",
        supported_language="en",
        patterns=[
            Pattern("es_dni", r"\b\d{8}[A-Z]\b", 0.6),
        ],
        context=["DNI", "documento nacional", "national identity",
                 "NIF", "Spanish ID", "identidad"],
    ))

    # Spanish NIE (foreigner ID) — X/Y/Z + 7 digits + letter
    recognizers.append(PatternRecognizer(
        supported_entity="ES_NIE",
        supported_language="en",
        patterns=[
            Pattern("es_nie", r"\b[XYZ]\d{7}[A-Z]\b", 0.7),
        ],
        context=["NIE", "número de identidad de extranjero", "foreigner",
                 "residency", "Spanish residence"],
    ))

    # ================================================================
    # Cyprus
    # ================================================================

    # Cyprus TIC (Tax Identification Code) — 8 digits + 1 letter
    recognizers.append(PatternRecognizer(
        supported_entity="CY_TIC",
        supported_language="en",
        patterns=[
            Pattern("cy_tic", r"\b\d{8}[A-Z]\b", 0.5),
        ],
        context=["TIC", "tax identification", "Cyprus tax", "φορολογικός",
                 "αριθμός φορολογικού", "ΤΙΜ"],
    ))

    # Cyprus ID Card — mixed format
    recognizers.append(PatternRecognizer(
        supported_entity="CY_ID_CARD",
        supported_language="en",
        patterns=[
            Pattern("cy_id", r"\b\d{6,8}\b", 0.05),  # very low base, needs strong context
        ],
        context=["Cyprus ID", "identity card", "ARC number", "ταυτότητα",
                 "αριθμός ταυτότητας", "Cypriot ID"],
    ))

    # ================================================================
    # EU-wide
    # ================================================================

    # EU VAT Numbers — country prefix + 8-12 digits/chars
    eu_vat_patterns = [
        Pattern("vat_at", r"\bATU\d{8}\b", 0.8),          # Austria
        Pattern("vat_be", r"\bBE[01]\d{9}\b", 0.8),        # Belgium
        Pattern("vat_bg", r"\bBG\d{9,10}\b", 0.8),         # Bulgaria
        Pattern("vat_cy", r"\bCY\d{8}[A-Z]\b", 0.8),       # Cyprus
        Pattern("vat_cz", r"\bCZ\d{8,10}\b", 0.8),          # Czechia
        Pattern("vat_de", r"\bDE\d{9}\b", 0.8),             # Germany
        Pattern("vat_dk", r"\bDK\d{8}\b", 0.8),             # Denmark
        Pattern("vat_ee", r"\bEE\d{9}\b", 0.8),             # Estonia
        Pattern("vat_es", r"\bES[A-Z0-9]\d{7}[A-Z0-9]\b", 0.8),  # Spain
        Pattern("vat_fi", r"\bFI\d{8}\b", 0.8),             # Finland
        Pattern("vat_fr", r"\bFR[A-Z0-9]{2}\d{9}\b", 0.8),  # France
        Pattern("vat_el", r"\bEL\d{9}\b", 0.8),             # Greece
        Pattern("vat_hr", r"\bHR\d{11}\b", 0.8),            # Croatia
        Pattern("vat_hu", r"\bHU\d{8}\b", 0.8),             # Hungary
        Pattern("vat_ie", r"\bIE\d[A-Z0-9+*]\d{5}[A-Z]\b", 0.8),  # Ireland
        Pattern("vat_it", r"\bIT\d{11}\b", 0.8),            # Italy
        Pattern("vat_lt", r"\bLT\d{9,12}\b", 0.8),          # Lithuania
        Pattern("vat_lu", r"\bLU\d{8}\b", 0.8),             # Luxembourg
        Pattern("vat_lv", r"\bLV\d{11}\b", 0.8),            # Latvia
        Pattern("vat_mt", r"\bMT\d{8}\b", 0.8),             # Malta
        Pattern("vat_nl", r"\bNL\d{9}B\d{2}\b", 0.8),       # Netherlands
        Pattern("vat_pl", r"\bPL\d{10}\b", 0.8),            # Poland
        Pattern("vat_pt", r"\bPT\d{9}\b", 0.8),             # Portugal
        Pattern("vat_ro", r"\bRO\d{2,10}\b", 0.7),          # Romania
        Pattern("vat_se", r"\bSE\d{12}\b", 0.8),            # Sweden
        Pattern("vat_si", r"\bSI\d{8}\b", 0.8),             # Slovenia
        Pattern("vat_sk", r"\bSK\d{10}\b", 0.8),            # Slovakia
        Pattern("vat_gb", r"\bGB\d{9}\b", 0.7),             # UK (post-Brexit)
        Pattern("vat_ch", r"\bCHE\d{9}\b", 0.8),            # Switzerland
    ]
    recognizers.append(PatternRecognizer(
        supported_entity="EU_VAT",
        supported_language="en",
        patterns=eu_vat_patterns,
        context=["VAT", "TVA", "Mehrwertsteuer", "MwSt", "IVA", "BTW",
                 "tax number", "VAT number", "VAT ID", "registration"],
    ))

    # EU Passport — generic EU passport format (varies by country)
    # Most EU passports: 2 letters + 7 digits, or 8-9 alphanumeric
    recognizers.append(PatternRecognizer(
        supported_entity="EU_PASSPORT",
        supported_language="en",
        patterns=[
            Pattern("eu_passport_2l7d", r"\b[A-Z]{2}\d{7}\b", 0.3),
            Pattern("eu_passport_1l8d", r"\b[A-Z]\d{8}\b", 0.3),
            Pattern("eu_passport_9d", r"\b\d{9}\b", 0.1),
        ],
        context=["passport", "travel document", "passeport", "Reisepass",
                 "pasaporte", "passaporto", "EU passport", "European passport"],
    ))

    # EU Driving Licence — NOT added as generic recognizer.
    # Too broad ([A-Z0-9]{8,16} matches everything).
    # Use country-specific recognizers instead (UK_DRIVING_LICENCE, etc.)

    return recognizers
