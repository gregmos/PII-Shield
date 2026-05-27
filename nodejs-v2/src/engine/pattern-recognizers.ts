/**
 * PII Shield v2.0.0 — Pattern-based PII recognizers
 * Ported from eu_recognizers.py + Presidio built-in patterns.
 *
 * Each recognizer: regex match → list of detected spans with type, position, score.
 * Context words boost confidence by +0.35.
 */

export interface DetectedEntity {
  text: string;
  type: string;
  start: number;
  end: number;
  score: number;
  verified: boolean;
  reason: string;
}

interface PatternDef {
  name: string;
  regex: RegExp;
  score: number;
}

interface RecognizerDef {
  entityType: string;
  patterns: PatternDef[];
  context: string[];
}

const CONTEXT_BOOST = 0.35;
const CONTEXT_WINDOW = 200;

function buildRecognizers(): RecognizerDef[] {
  const recognizers: RecognizerDef[] = [];

  // ════════════════════════════════════════════════════════════
  // Presidio built-in patterns
  // ════════════════════════════════════════════════════════════

  recognizers.push({
    entityType: "EMAIL_ADDRESS",
    patterns: [
      { name: "email", regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, score: 0.85 },
    ],
    context: ["email", "e-mail", "mail", "address", "contact"],
  });

  recognizers.push({
    entityType: "PHONE_NUMBER",
    patterns: [
      // International: REQUIRES leading + so "2024" can't match.
      { name: "phone_intl", regex: /\+\d{1,3}[\s.\-]?\(?\d{1,4}\)?[\s.\-]?\d{1,4}[\s.\-]?\d{1,4}(?:[\s.\-]\d{1,4})?\b/g, score: 0.6 },
      // US/UK formatted: REQUIRES parentheses or separators between groups.
      // Bare 10-digit blobs without any separator are not matched here on purpose.
      { name: "phone_us_paren", regex: /\(\d{3}\)\s?\d{3}[\s.\-]?\d{4}\b/g, score: 0.6 },
      { name: "phone_us_sep", regex: /\b\d{3}[\s.\-]\d{3}[\s.\-]\d{4}\b/g, score: 0.55 },
      // Long bare digit run: 11+ digits is unlikely to be a year/account no.
      // Context boost will rescue legitimate phone hits; otherwise filtered by PII_MIN_SCORE.
      { name: "phone_long_bare", regex: /\b\d{11,15}\b/g, score: 0.2 },
    ],
    context: ["phone", "telephone", "tel", "call", "mobile", "cell", "fax", "contact number"],
  });

  recognizers.push({
    entityType: "URL",
    patterns: [
      { name: "url", regex: /\bhttps?:\/\/[^\s<>"{}|\\^`\[\]]+/g, score: 0.6 },
    ],
    context: ["url", "website", "link", "site", "http", "www"],
  });

  recognizers.push({
    entityType: "IP_ADDRESS",
    patterns: [
      { name: "ipv4", regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, score: 0.6 },
      { name: "ipv6", regex: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, score: 0.6 },
    ],
    context: ["IP", "address", "server", "host", "network"],
  });

  recognizers.push({
    entityType: "CREDIT_CARD",
    patterns: [
      // Visa
      { name: "cc_visa", regex: /\b4\d{3}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, score: 0.6 },
      // Mastercard
      { name: "cc_mc", regex: /\b5[1-5]\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, score: 0.6 },
      // Amex
      { name: "cc_amex", regex: /\b3[47]\d{2}[\s-]?\d{6}[\s-]?\d{5}\b/g, score: 0.6 },
    ],
    context: ["credit card", "card number", "CC", "Visa", "MasterCard", "Amex", "payment"],
  });

  recognizers.push({
    entityType: "IBAN_CODE",
    patterns: [
      { name: "iban", regex: /\b[A-Z]{2}\d{2}[\s]?[\dA-Z]{4}[\s]?(?:[\dA-Z]{4}[\s]?){1,7}[\dA-Z]{1,4}\b/g, score: 0.7 },
    ],
    context: ["IBAN", "bank account", "account number", "bank transfer", "SWIFT", "BIC"],
  });

  recognizers.push({
    entityType: "CRYPTO",
    patterns: [
      // Bitcoin
      { name: "btc", regex: /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g, score: 0.5 },
      // Ethereum
      { name: "eth", regex: /\b0x[0-9a-fA-F]{40}\b/g, score: 0.6 },
    ],
    context: ["bitcoin", "ethereum", "crypto", "wallet", "BTC", "ETH", "blockchain"],
  });

  // US
  recognizers.push({
    entityType: "US_SSN",
    patterns: [
      { name: "us_ssn", regex: /\b\d{3}[\s-]\d{2}[\s-]\d{4}\b/g, score: 0.5 },
    ],
    context: ["SSN", "social security", "social security number"],
  });

  recognizers.push({
    entityType: "US_PASSPORT",
    patterns: [
      { name: "us_passport", regex: /\b[A-Z]\d{8}\b/g, score: 0.1 },
    ],
    context: ["passport", "US passport", "travel document", "State Department"],
  });

  recognizers.push({
    entityType: "US_DRIVER_LICENSE",
    patterns: [
      { name: "us_dl", regex: /\b[A-Z]\d{7,12}\b/g, score: 0.1 },
    ],
    context: ["driver's license", "driver license", "DL", "DMV"],
  });

  // UK
  recognizers.push({
    entityType: "UK_NHS",
    patterns: [
      { name: "uk_nhs", regex: /\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/g, score: 0.3 },
    ],
    context: ["NHS", "NHS number", "health service", "patient number", "medical record"],
  });

  // ════════════════════════════════════════════════════════════
  // EU recognizers (ported from eu_recognizers.py)
  // ════════════════════════════════════════════════════════════

  // UK National Insurance Number (NIN/NINO)
  recognizers.push({
    entityType: "UK_NIN",
    patterns: [
      { name: "uk_nin_spaced", regex: /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/g, score: 0.7 },
    ],
    context: ["national insurance", "NI number", "NIN", "NINO", "tax", "HMRC", "PAYE"],
  });

  // UK Passport — 9 digits
  recognizers.push({
    entityType: "UK_PASSPORT",
    patterns: [
      { name: "uk_passport", regex: /\b\d{9}\b/g, score: 0.1 },
    ],
    context: ["passport", "travel document", "UK passport", "HM Passport", "HMPO"],
  });

  // UK Company Registration Number (CRN)
  recognizers.push({
    entityType: "UK_CRN",
    patterns: [
      { name: "uk_crn_numeric", regex: /\b\d{8}\b/g, score: 0.1 },
      { name: "uk_crn_alpha", regex: /\b[A-Z]{2}\d{6}\b/g, score: 0.4 },
    ],
    context: ["company number", "registration number", "Companies House", "CRN", "registered number", "company reg"],
  });

  // Generic registration / company number (any jurisdiction).
  // Low base score — context boost (+0.35) brings it above min_score.
  recognizers.push({
    entityType: "ID_DOC",
    patterns: [
      // Pure numeric: 6+ chars (avoids ZIP codes). "12847593", "07-384-2951"
      { name: "reg_number", regex: /\b\d[\d-]{4,11}\d\b/g, score: 0.05 },
      // Number split across line break: "559038-\n9531" → match as one
      { name: "reg_linebreak", regex: /\b\d{4,8}-\s*\n\s*\d{3,6}\b/g, score: 0.05 },
      // Alphanumeric with prefix: "UK-CH-12847593", "HRB 12345"
      { name: "reg_alpha", regex: /\b[A-Z]{1,4}[-\s]?[A-Z]{0,3}[-\s]?\d{5,12}\b/g, score: 0.05 },
    ],
    context: [
      "reg. no", "reg no", "registration no", "registration number", "registered number",
      "company number", "company no", "organisation number", "organization number",
      "org. no", "org no", "business number", "entity number",
      "corporate identity number", "CIN", "ABN", "TIN",
      "DUNS", "duns number", "EIN", "tax id", "tax number",
      "routing", "sort code", "account", "acct",
    ],
  });

  // VAT numbers — EU format: country code + 5-12 digits/spaces
  recognizers.push({
    entityType: "ID_DOC",
    patterns: [
      // "GB 384 7291 06", "DE123456789", "FR 12 345678901"
      { name: "vat_eu", regex: /\b[A-Z]{2}\s?\d{3}[\s]?\d{3,4}[\s]?\d{2,4}\b/g, score: 0.1 },
    ],
    context: [
      "VAT", "VAT number", "VAT no", "tax number", "tax id",
      "value added tax", "TVA", "MwSt", "IVA", "BTW",
    ],
  });

  // UK Driving Licence — 16 chars
  recognizers.push({
    entityType: "UK_DRIVING_LICENCE",
    patterns: [
      { name: "uk_dl", regex: /\b[A-Z]{5}\d{6}[A-Z0-9]{2}\d{2}[A-Z]{2}\b/g, score: 0.75 },
    ],
    context: ["driving licence", "driver's licence", "DVLA", "driving license"],
  });

  // Germany — Tax ID (11 digits)
  recognizers.push({
    entityType: "DE_TAX_ID",
    patterns: [
      { name: "de_tax_id", regex: /\b\d{11}\b/g, score: 0.1 },
    ],
    context: ["Steuer-ID", "Steueridentifikationsnummer", "tax identification", "IdNr", "TIN", "German tax", "Finanzamt"],
  });

  // Germany — Social Security (12 chars)
  recognizers.push({
    entityType: "DE_SOCIAL_SECURITY",
    patterns: [
      { name: "de_sv", regex: /\b\d{2}\s?\d{6}\s?[A-Z]\s?\d{2}\s?\d\b/g, score: 0.6 },
    ],
    context: ["Sozialversicherungsnummer", "SV-Nummer", "social security", "Rentenversicherung", "insurance number"],
  });

  // France — Social Security (NIR/INSEE)
  recognizers.push({
    entityType: "FR_NIR",
    patterns: [
      { name: "fr_nir", regex: /\b[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}\b/g, score: 0.65 },
    ],
    context: ["NIR", "INSEE", "sécurité sociale", "social security", "numéro de sécurité", "carte vitale"],
  });

  // France — National ID (CNI) — 12 digits
  recognizers.push({
    entityType: "FR_CNI",
    patterns: [
      { name: "fr_cni", regex: /\b\d{12}\b/g, score: 0.1 },
    ],
    context: ["carte nationale", "CNI", "national identity", "carte d'identité", "French ID", "pièce d'identité"],
  });

  // Italy — Codice Fiscale (16 chars)
  recognizers.push({
    entityType: "IT_FISCAL_CODE",
    patterns: [
      { name: "it_cf", regex: /\b[A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z]\b/g, score: 0.8 },
    ],
    context: ["codice fiscale", "fiscal code", "CF", "Italian tax"],
  });

  // Italy — Partita IVA
  recognizers.push({
    entityType: "IT_VAT",
    patterns: [
      { name: "it_vat", regex: /\bIT\s?\d{11}\b/g, score: 0.75 },
    ],
    context: ["partita IVA", "VAT", "P.IVA", "Italian VAT"],
  });

  // Spain — DNI
  recognizers.push({
    entityType: "ES_DNI",
    patterns: [
      { name: "es_dni", regex: /\b\d{8}[A-Z]\b/g, score: 0.6 },
    ],
    context: ["DNI", "documento nacional", "national identity", "NIF", "Spanish ID", "identidad"],
  });

  // Spain — NIE
  recognizers.push({
    entityType: "ES_NIE",
    patterns: [
      { name: "es_nie", regex: /\b[XYZ]\d{7}[A-Z]\b/g, score: 0.7 },
    ],
    context: ["NIE", "número de identidad de extranjero", "foreigner", "residency", "Spanish residence"],
  });

  // Cyprus — TIC
  recognizers.push({
    entityType: "CY_TIC",
    patterns: [
      { name: "cy_tic", regex: /\b\d{8}[A-Z]\b/g, score: 0.5 },
    ],
    context: ["TIC", "tax identification", "Cyprus tax", "φορολογικός", "αριθμός φορολογικού", "ΤΙΜ"],
  });

  // Cyprus — ID Card
  recognizers.push({
    entityType: "CY_ID_CARD",
    patterns: [
      { name: "cy_id", regex: /\b\d{6,8}\b/g, score: 0.05 },
    ],
    context: ["Cyprus ID", "identity card", "ARC number", "ταυτότητα", "αριθμός ταυτότητας", "Cypriot ID"],
  });

  // EU VAT Numbers — 29 country patterns
  recognizers.push({
    entityType: "EU_VAT",
    patterns: [
      { name: "vat_at", regex: /\bATU\d{8}\b/g, score: 0.8 },
      { name: "vat_be", regex: /\bBE[01]\d{9}\b/g, score: 0.8 },
      { name: "vat_bg", regex: /\bBG\d{9,10}\b/g, score: 0.8 },
      { name: "vat_cy", regex: /\bCY\d{8}[A-Z]\b/g, score: 0.8 },
      { name: "vat_cz", regex: /\bCZ\d{8,10}\b/g, score: 0.8 },
      { name: "vat_de", regex: /\bDE\d{9}\b/g, score: 0.8 },
      { name: "vat_dk", regex: /\bDK\d{8}\b/g, score: 0.8 },
      { name: "vat_ee", regex: /\bEE\d{9}\b/g, score: 0.8 },
      { name: "vat_es", regex: /\bES[A-Z0-9]\d{7}[A-Z0-9]\b/g, score: 0.8 },
      { name: "vat_fi", regex: /\bFI\d{8}\b/g, score: 0.8 },
      { name: "vat_fr", regex: /\bFR[A-Z0-9]{2}\d{9}\b/g, score: 0.8 },
      { name: "vat_el", regex: /\bEL\d{9}\b/g, score: 0.8 },
      { name: "vat_hr", regex: /\bHR\d{11}\b/g, score: 0.8 },
      { name: "vat_hu", regex: /\bHU\d{8}\b/g, score: 0.8 },
      { name: "vat_ie", regex: /\bIE\d[A-Z0-9+*]\d{5}[A-Z]\b/g, score: 0.8 },
      { name: "vat_it", regex: /\bIT\d{11}\b/g, score: 0.8 },
      { name: "vat_lt", regex: /\bLT\d{9,12}\b/g, score: 0.8 },
      { name: "vat_lu", regex: /\bLU\d{8}\b/g, score: 0.8 },
      { name: "vat_lv", regex: /\bLV\d{11}\b/g, score: 0.8 },
      { name: "vat_mt", regex: /\bMT\d{8}\b/g, score: 0.8 },
      { name: "vat_nl", regex: /\bNL\d{9}B\d{2}\b/g, score: 0.8 },
      { name: "vat_pl", regex: /\bPL\d{10}\b/g, score: 0.8 },
      { name: "vat_pt", regex: /\bPT\d{9}\b/g, score: 0.8 },
      { name: "vat_ro", regex: /\bRO\d{2,10}\b/g, score: 0.7 },
      { name: "vat_se", regex: /\bSE\d{12}\b/g, score: 0.8 },
      { name: "vat_si", regex: /\bSI\d{8}\b/g, score: 0.8 },
      { name: "vat_sk", regex: /\bSK\d{10}\b/g, score: 0.8 },
      { name: "vat_gb", regex: /\bGB\d{9}\b/g, score: 0.7 },
      { name: "vat_ch", regex: /\bCHE\d{9}\b/g, score: 0.8 },
    ],
    context: ["VAT", "TVA", "Mehrwertsteuer", "MwSt", "IVA", "BTW", "tax number", "VAT number", "VAT ID", "registration"],
  });

  // EU Passport — generic
  recognizers.push({
    entityType: "EU_PASSPORT",
    patterns: [
      { name: "eu_passport_2l7d", regex: /\b[A-Z]{2}\d{7}\b/g, score: 0.3 },
      { name: "eu_passport_1l8d", regex: /\b[A-Z]\d{8}\b/g, score: 0.3 },
      { name: "eu_passport_9d", regex: /\b\d{9}\b/g, score: 0.1 },
    ],
    context: ["passport", "travel document", "passeport", "Reisepass", "pasaporte", "passaporto", "EU passport", "European passport"],
  });

  // ════════════════════════════════════════════════════════════
  // India recognizers
  // ════════════════════════════════════════════════════════════

  // Indian Corporate Identity Number (CIN) — 21 chars: L/U + 5 digits + 2 state letters + 4 year + 3 category + 6 digits
  recognizers.push({
    entityType: "ID_DOC",
    patterns: [
      { name: "in_cin", regex: /\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b/g, score: 0.7 },
    ],
    context: ["CIN", "corporate identity", "identity number", "registration", "incorporated", "Companies Act", "company number"],
  });

  // Indian PAN (Permanent Account Number) — 10 chars: 5 letters + 4 digits + 1 letter
  recognizers.push({
    entityType: "ID_DOC",
    patterns: [
      { name: "in_pan", regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g, score: 0.3 },
    ],
    context: ["PAN", "permanent account", "income tax", "tax", "PAN number", "PAN card"],
  });

  // Indian GSTIN — 15 chars: 2 digits + PAN(10) + 1 digit + Z + check
  recognizers.push({
    entityType: "ID_DOC",
    patterns: [
      { name: "in_gstin", regex: /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][A-Z0-9]\b/g, score: 0.75 },
    ],
    context: ["GSTIN", "GST", "goods and services tax", "tax registration"],
  });

  // ════════════════════════════════════════════════════════════
  // ALL-CAPS company names with corporate suffix
  // ════════════════════════════════════════════════════════════

  recognizers.push({
    entityType: "ORGANIZATION",
    patterns: [
      // Matches: "MSEB SOLAR AGRO POWER LIMITED", "ABC PRIVATE LIMITED", "XY AG", etc.
      // Requires 1-6 ALL-CAPS words before the corporate suffix.
      // {1,6} prevents cross-clause over-matches.
      // Negative lookahead excludes common English prepositions/conjunctions at the start
      // so "UNDER TATA TECHNOLOGIES EUROPE LIMITED" → only "TATA TECHNOLOGIES EUROPE LIMITED".
      // AB added for Nordic (Aktiebolaget). AS removed — too common in English ("EXCEPT AS", "SUCH AS").
      { name: "org_caps_suffix", regex: /\b(?!(?:UNDER|AND|FOR|WITH|FROM|BETWEEN|BY|OR|BUT|AFTER|BEFORE|THROUGH|INTO|UPON|WHEREAS|WHEREBY|BEING|HAVING|ALSO|EACH|EVERY|SUCH|EXCEPT|PURSUANT|SUBJECT|ACCORDING|REGARDING|HEREIN|THEREOF|UNLESS|UNTIL|DURING|WITHIN|WITHOUT|AMONG|AGAINST|OF|TO|IN|ON|AT|NOT|IF|SO|NO|AS|IS|BE|IT|AN|DO|UP|CHANGE|NAME|WHERE|WHEN|WHILE|SINCE|ABOVE|BELOW|ONLY|THAN|THAT|THIS|DOES|SHALL|WILL|MUST|SHOULD|WOULD|COULD|MAY|MIGHT|BEEN|WERE|WAS|ARE|HAS|HAD|DID|ANY|ALL|THE|AGREEMENT|SALE|PURCHASE|SHARE|SHARES|DATED|SCHEDULE|CONTRACT|DEED|RESOLUTION|NOTICE|MEMORANDUM|CERTIFICATE|POWER|ARTICLES)\s)(?:(?:[A-Z][A-Z&.-]*|&)[\s,]+){1,8}(?:LIMITED|PRIVATE\s+LIMITED|PVT\.?\s*LTD\.?|LTD\.?|LLP|INC\.?|CORP\.?|CORPORATION|GMBH|AG|AB|SA|NV|BV|PLC|LLC|CO\.)\b/g, score: 0.4 },
      // Mixed-case with corporate suffix: "Escenda Engineering AB", "NextEra Solutions Ltd.", "Anchore, Inc."
      // The (?:...|&) group allows "&" as standalone connector: "Hartwick & Pemberton LLP"
      // [\s,]+ allows comma-separated suffixes: "Anchore, Inc."
      { name: "org_mixed_suffix", regex: /\b(?:(?:[A-Z][\w&.-]*|&)[\s,]+){1,8}(?:Limited|Ltd\.?|LLP|Inc\.?|Corp\.?|Corporation|GmbH|AG|AB|SA|NV|BV|PLC|LLC|Co\.)\b/g, score: 0.35 },
      // Authority / Agency / Commission / etc. — governmental and institutional bodies without a corporate suffix.
      // e.g. "Orange County Housing Authority", "Small Business Administration", "Environmental Protection Agency"
      { name: "org_authority", regex: /\b[A-Z][a-zA-Z]+(?:\s+(?:of|the|and|for)\s+)?(?:\s+[A-Z][a-zA-Z]+){0,5}\s+(?:Authority|Agency|Commission|Administration|Council|Bureau|Tribunal|Ministry|Directorate)\b/g, score: 0.4 },
    ],
    context: ["company", "corporation", "entity", "incorporated", "registered", "firm"],
  });

  // Finland — Henkilötunnus (HETU, personal identity code): DDMMYY + century
  // marker + 3-digit individual number + control character.
  // The control char is restricted to "0123456789ABCDEFHJKLMNPRSTUVWXY" (no G,I,O,Q),
  // and the century marker to +,-,A-F,U,V,W,X,Y — so the shape is highly specific
  // and false positives are rare even without checksum validation.
  recognizers.push({
    entityType: "FI_HETU",
    patterns: [
      { name: "fi_hetu", regex: /\b(?:0[1-9]|[12]\d|3[01])(?:0[1-9]|1[0-2])\d{2}[-+ABCDEFUVWXY]\d{3}[0-9A-FHJ-NPR-Y]\b/g, score: 0.85 },
    ],
    context: ["henkilötunnus", "hetu", "henkilötunnuksen", "syntymäaika", "personbeteckning", "personal identity code", "social security"],
  });

  // Finland — Y-tunnus (Business ID): 7 digits + hyphen + check digit.
  // The bare shape \d{7}-\d is generic, so the base score is low and relies on
  // context boost (+0.35) — mirroring DE_TAX_ID, FR_CNI, etc.
  recognizers.push({
    entityType: "FI_BUSINESS_ID",
    patterns: [
      { name: "fi_ytunnus", regex: /\b\d{7}-\d\b/g, score: 0.4 },
    ],
    context: ["y-tunnus", "ytunnus", "yritystunnus", "yhteisötunnus", "business id", "FO-nummer", "VAT", "company number", "organisation number"],
  });

  return recognizers;
}

// Singleton — built once
const ALL_RECOGNIZERS = buildRecognizers();

/**
 * Check if any context word appears near the match position.
 * Returns boosted score if context found, original score otherwise.
 */
function applyContextBoost(
  text: string,
  matchStart: number,
  matchEnd: number,
  contextWords: string[],
  baseScore: number,
): number {
  if (contextWords.length === 0) return baseScore;

  const windowStart = Math.max(0, matchStart - CONTEXT_WINDOW);
  const windowEnd = Math.min(text.length, matchEnd + CONTEXT_WINDOW);
  // Normalize whitespace — PDFs often have "registration   number" with extra spaces
  const window = text.slice(windowStart, windowEnd).toLowerCase().replace(/\s+/g, " ");

  for (const cw of contextWords) {
    if (window.includes(cw.toLowerCase())) {
      return Math.min(1.0, baseScore + CONTEXT_BOOST);
    }
  }
  return baseScore;
}

// ════════════════════════════════════════════════════════════
// Labeled address extractor
// ════════════════════════════════════════════════════════════
// Finds addresses that follow explicit labels like "Registered address:",
// "Business address:", "Principal office:", etc.
// These are free-form text — can't be caught by simple regex patterns,
// but the label gives us a strong anchor to extract from.

/** Labels that strongly indicate a physical address follows */
const ADDRESS_LABEL_RE = /(?:registered\s+(?:address|office)|(?:business|postal|mailing|correspondence|head|principal|residential|home|billing|delivery|shipping)\s+(?:address|office)|principal\s+place\s+of\s+business|(?:^|[\n\r])\s*address)\s*[:]/gi;

/** Same labels but with "at" instead of ":" — common in legal prose: "having its registered address at" */
const ADDRESS_AT_LABEL_RE = /(?:registered\s+(?:address|office)|(?:business|postal|mailing|principal|residential)\s+(?:address|office)|whose\s+(?:address|office)\s+is)\s+at\b/gi;

/** Matches ", of [digit]" — catches "company number 123, of 15 Canary Wharf..." */
const ADDRESS_OF_RE = /,\s*of\s+(?=\d)/gi;

/**
 * Universal postcode-anchored address regex.
 * Matches: [street number] ... [postal code] [optional country]
 * Supports UK (E14 5AB), US (10118), EU (SE-431 36, D-10719), NL (1017 AB), etc.
 */
const POSTCODE_ADDRESS_RE = new RegExp(
  '\\b\\d{1,5}(?:/\\d{1,5})?(?!\\d)[A-Za-z]?' +        // street number (1-5 digits, optional /N for AU unit), NOT part of longer number
  '[\\w\\s\u2019\u2018\'.,\\-]{5,120}' +               // street name + comma-separated parts (up to ~120 chars to cover "S. Shawnee St., Aurora, CO,")
  '(?:' +
    '[A-Z]{1,2}\\d{1,2}[A-Z]?\\s+\\d[A-Z]{2}' +       // UK: E14 5AB, M3 2BA
    '|\\d{5}(?:-\\d{4})?' +                              // US: 10118, 10118-1234
    '|[A-Z]{1,2}-\\d{3,5}(?:\\s\\d{2})?' +               // EU: SE-431 36, D-10719 (dash required)
    '|\\d{4,5}\\s+[A-Z]{2}' +                            // NL: 1017 AB
    '|(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\\s+\\d{4}' +     // AU: VIC 3000, NSW 2150
  ')' +
  '(?:,\\s*(?:[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2}))?' , // optional: ", United Kingdom" (title-case words only)
  'g'
);

/** Reject postcode_address matches that are clearly not addresses */
const POSTCODE_FP_RE = /\b(?:GBP|USD|EUR|JPY|CNY|CHF|AUD|CAD|NZD|INR|SEK|NOK|DKK|rent|per\s+(?:annum|month|year|individual))\b/i;
const POSTCODE_BANK_RE = /\b(?:sort\s+code|account\s+number|IBAN|SWIFT|BIC|designated)\b/i;

/**
 * Extract addresses that follow labeled fields like "Registered address: ...".
 * Reads text after the colon until a natural boundary (double newline, next
 * label, or max length). Returns LOCATION entities.
 */
/** Matches a field label like "Company number:", "Phone (Primary):", "CEO / Signatory:" etc. */
const NEXT_LABEL_RE = /\s{2,}[A-Z][^\n:]{0,40}:|[\n\r]\s*[A-Z][^\n:]{0,40}:/;

function extractLabeledAddresses(text: string): DetectedEntity[] {
  const results: DetectedEntity[] = [];
  ADDRESS_LABEL_RE.lastIndex = 0;

  let labelMatch: RegExpExecArray | null;
  while ((labelMatch = ADDRESS_LABEL_RE.exec(text)) !== null) {
    const afterColon = labelMatch.index + labelMatch[0].length;

    // Skip whitespace/newlines after colon
    let start = afterColon;
    while (start < text.length && /[\s]/.test(text[start])) start++;
    if (start >= text.length) continue;

    // Read forward up to 200 chars, then truncate at the first boundary.
    const rawEnd = Math.min(text.length, start + 200);
    let candidateText = text.slice(start, rawEnd);

    // Stop at double newline
    const dblNl = candidateText.search(/\n\s*\n|\r\n\s*\r\n/);
    if (dblNl !== -1) candidateText = candidateText.slice(0, dblNl);

    // Stop at next field label: either "  SomeLabel:" (2+ spaces) or newline + "Label:"
    // Only look after the first 10 chars (avoid cutting the address itself)
    if (candidateText.length > 10) {
      const labelHit = candidateText.slice(10).search(NEXT_LABEL_RE);
      if (labelHit !== -1) candidateText = candidateText.slice(0, 10 + labelHit);
    }

    // Trim trailing whitespace, commas, periods, semicolons
    candidateText = candidateText.replace(/[\s,;.]+$/, "");

    const end = start + candidateText.length;

    // Validate: at least 10 chars, contains a digit (street number/postcode)
    // or a comma (city separator), and doesn't look like a URL/email
    if (candidateText.length < 10) continue;
    if (!/\d/.test(candidateText) && !/,/.test(candidateText)) continue;
    if (candidateText.includes("@") || candidateText.startsWith("http")) continue;

    results.push({
      text: candidateText,
      type: "LOCATION",
      start,
      end,
      score: 0.75,
      verified: true,
      reason: "pattern:labeled_address",
    });
  }

  // Second pass: "registered address at ..." (legal prose without colon)
  ADDRESS_AT_LABEL_RE.lastIndex = 0;
  let atMatch: RegExpExecArray | null;
  while ((atMatch = ADDRESS_AT_LABEL_RE.exec(text)) !== null) {
    const afterAt = atMatch.index + atMatch[0].length;

    let start = afterAt;
    while (start < text.length && /[\s]/.test(text[start])) start++;
    if (start >= text.length) continue;

    const rawEnd = Math.min(text.length, start + 200);
    let candidateText = text.slice(start, rawEnd);

    // In legal prose, address ends at ", (" or "; " or double newline
    const proseEnd = candidateText.search(/,\s*\(|;\s|\n\s*\n|\(hereinafter|\(the\s+["\u201c]|which\s+expression|\(["\u201c][A-Z]/);
    if (proseEnd !== -1) candidateText = candidateText.slice(0, proseEnd);

    candidateText = candidateText.replace(/[\s,;.]+$/, "");

    if (candidateText.length < 10) continue;
    if (!/\d/.test(candidateText) && !/,/.test(candidateText)) continue;
    if (candidateText.includes("@") || candidateText.startsWith("http")) continue;

    results.push({
      text: candidateText,
      type: "LOCATION",
      start,
      end: start + candidateText.length,
      score: 0.7,
      verified: true,
      reason: "pattern:labeled_address_at",
    });
  }

  // Third pass: ", of [number][address]" — common in legal docs:
  // "company number 07823456, of 19 Deansgate, Manchester M3 2BA"
  ADDRESS_OF_RE.lastIndex = 0;
  let ofMatch: RegExpExecArray | null;
  while ((ofMatch = ADDRESS_OF_RE.exec(text)) !== null) {
    const afterOf = ofMatch.index + ofMatch[0].length;

    // Start at the digit (ADDRESS_OF_RE lookahead ensures it's there)
    const start = afterOf;
    const rawEnd = Math.min(text.length, start + 200);
    let candidateText = text.slice(start, rawEnd);

    // End at prose boundaries: closing paren, semicolon, double newline, legal phrases
    const proseEnd = candidateText.search(/[);]\s|\n\s*\n|\(hereinafter|\(the\s+["\u201c]|\(["\u201c][A-Z]/);
    if (proseEnd !== -1) candidateText = candidateText.slice(0, proseEnd);

    candidateText = candidateText.replace(/[\s,;.]+$/, "");

    if (candidateText.length < 10) continue;
    if (candidateText.includes("@") || candidateText.startsWith("http")) continue;

    results.push({
      text: candidateText,
      type: "LOCATION",
      start,
      end: start + candidateText.length,
      score: 0.65,
      verified: true,
      reason: "pattern:address_of",
    });
  }

  // Fourth pass: postcode-anchored addresses (universal — no trigger required)
  POSTCODE_ADDRESS_RE.lastIndex = 0;
  let pcMatch: RegExpExecArray | null;
  while ((pcMatch = POSTCODE_ADDRESS_RE.exec(text)) !== null) {
    const start = pcMatch.index;
    const matchText = pcMatch[0].replace(/[\s,;.]+$/, "");
    const end = start + matchText.length;

    // Skip if already covered by a higher-confidence labeled address
    const alreadyCovered = results.some(
      r => r.start <= start && r.end >= end
    );
    if (alreadyCovered) continue;

    // Validate: must contain a comma (city separator) — reduces noise
    if (!matchText.includes(",")) continue;

    // Reject false positives: currency amounts, bank details
    if (POSTCODE_FP_RE.test(matchText)) continue;
    if (POSTCODE_BANK_RE.test(matchText)) continue;
    // Fix 9: Date ranges — "01, 2015 through September 30, 2016"
    if (/\b(?:january|february|march|april|may|june|july|august|september|october|november|december|through|fiscal\s+year)\b/i.test(matchText)) continue;
    // Fix 10: Executive orders / legal references
    if (/\b(?:executive\s+order|order\s+no|act\s+no|law\s+no|regulation|amended)\b/i.test(matchText)) continue;
    // Fix 11: Footer/header text
    if (/\b(?:CONFIDENTIAL|FORM|DRAFT|TEMPLATE|AMENDMENT|REVISION)\b/.test(matchText)) continue;
    // AIA/standards document codes: "A201®–2017", "A101-2017"
    if (/\b[A-Z]\d{3}[®\-\u2013]{1,2}\d{4}/.test(matchText)) continue;
    // Texas real-estate form codes: "TXR-2101)", "TREC 20-14", "TAR 1410"
    if (/\b(?:TXR|TREC|TAR)[\s\-]?\d+/i.test(matchText)) continue;
    // Multi-line blocks with > 3 newlines = not a single address
    if ((matchText.match(/\n/g) || []).length > 3) continue;
    // Form boilerplate
    if (/\b(?:Initialed\s+for\s+Identification|Signature\s+Page|SIGNATURE\s+BLOCK)\b/i.test(matchText)) continue;

    results.push({
      text: matchText,
      type: "LOCATION",
      start,
      end,
      score: 0.65,
      verified: true,
      reason: "pattern:postcode_address",
    });
  }

  return results;
}

// ════════════════════════════════════════════════════════════
// Labeled person field extractor
// ════════════════════════════════════════════════════════════
// Catches person names after labels like "Full Legal Name:", "CEO:",
// "Authorized Signatory:", "Emergency Contact:", etc.
// These labels appear in structured tables/forms — NER often misses
// names in tabular format because context is split across cells.

const PERSON_LABEL_RE = /(?:full\s+legal\s+name|(?:ceo|cto|cfo|coo|cio)\s*(?:\/\s*)?(?:authorized\s+)?signatory|authorized\s+(?:signatory|representative|officer)|emergency\s+contact|contact\s+(?:person|name)|(?:directors?|officers?|managers?|partners?|trustees?|nominees?|shareholders?|beneficiaries?)(?:\s+name)?|signatory|witness|name|fao|for\s+the\s+attention\s+of|contact|company\s+secretary|printed\s+name|(?:^|[\n\r])\s*by)\s*:/gim;

/** Matches "[action] by [Name]" — signed by, prepared by, etc. (no colon) */
const PERSON_BY_RE = /(?:signed|prepared|coordinated|drafted|witnessed|authorised|authorized|executed|approved|confirmed|certified|attested)\s+by\b/gi;

/** Corporate suffixes — used to reject ORG names captured as PERSON */
const CORPORATE_SUFFIX_RE = /\b(?:Limited|Ltd\.?|LLP|Inc\.?|Corp\.?|Corporation|PLC|LLC|GmbH|AG|AB|SA|NV|BV|Co\.)\s*$/i;

function extractLabeledPersons(text: string): DetectedEntity[] {
  const results: DetectedEntity[] = [];
  PERSON_LABEL_RE.lastIndex = 0;

  let labelMatch: RegExpExecArray | null;
  while ((labelMatch = PERSON_LABEL_RE.exec(text)) !== null) {
    const afterColon = labelMatch.index + labelMatch[0].length;

    // Skip whitespace after colon
    let start = afterColon;
    while (start < text.length && /[ \t]/.test(text[start])) start++;

    // Signature-block support: if the current line is empty or underscores,
    // skip up to 2 blank/underscore lines and extract from next non-empty line.
    if (start < text.length && (text[start] === "\n" || text[start] === "\r" || text[start] === "_")) {
      let newlineCount = 0;
      let probe = start;
      while (probe < text.length && newlineCount < 3) {
        const c = text[probe];
        if (c === "\n") { newlineCount++; probe++; continue; }
        if (/[\s_]/.test(c)) { probe++; continue; }
        break;
      }
      // Only accept the skip if next line starts with an uppercase letter (name-like)
      if (probe < text.length && /[A-Z\u00C0-\u024F]/.test(text[probe])) {
        start = probe;
      } else {
        continue;
      }
    }
    if (start >= text.length) continue;

    // Read until end of line or next label
    let end = start;
    const maxEnd = Math.min(text.length, start + 100);
    while (end < maxEnd && text[end] !== "\n" && text[end] !== "\r") end++;

    // Trim trailing whitespace/punctuation
    while (end > start && /[\s,;.]/.test(text[end - 1])) end--;

    let personText = text.slice(start, end);

    // Strip phone numbers and trailing data: "Name (role), +1 (650) 555-0291" → "Name (role)"
    personText = personText.replace(/,?\s*\+?\d[\d\s()\-]{6,}.*$/, "").trim();

    // Strip email/tel/fax suffixes: "Helen Graves, email: h@..." → "Helen Graves"
    personText = personText.replace(/,?\s*(?:email|e-?mail|tel(?:ephone)?|fax|mobile|phone)\s*:.*$/i, "").trim();

    // Strip all parenthetical annotations: "(spouse)", "(exp. 09/2031)", etc.
    personText = personText.replace(/\s*\([^)]*\)/g, "").trim();

    // Strip trailing role/title descriptions: "Margaret A. Chen, Chief Executive Officer"
    const commaIdx = personText.indexOf(",");
    if (commaIdx > 3) {
      const afterComma = personText.slice(commaIdx + 1).trim().toLowerCase();
      if (/\b(?:chief|officer|director|manager|partner|president|vp|vice|head|lead|senior|jr|sr|esq|spouse|husband|wife|sibling|parent|son|daughter)\b/i.test(afterComma)) {
        personText = personText.slice(0, commaIdx).trim();
      }
    }

    // Validate: at least 3 chars, contains a space (first+last name), starts with uppercase
    if (personText.length < 3) continue;
    if (!/\s/.test(personText)) continue;
    if (!/^[A-Z\u00C0-\u024F]/.test(personText)) continue;
    // Reject if looks like a number/date/email
    if (/^\d|@|\.com|\.org/.test(personText)) continue;
    // Reject corporate names captured via "Shareholder:" etc.
    if (CORPORATE_SUFFIX_RE.test(personText)) continue;
    // Reject if contains digits (likely not a person name)
    if (/\d/.test(personText)) continue;
    // Reject all-caps text with >3 words (likely a heading)
    if (personText === personText.toUpperCase() && personText.split(/\s+/).length > 3) continue;

    results.push({
      text: personText,
      type: "PERSON",
      start,
      end: start + personText.length,
      score: 0.8,
      verified: true,
      reason: "pattern:labeled_person",
    });
  }

  // Second pass: "[verb] by [Name]" patterns (no colon)
  PERSON_BY_RE.lastIndex = 0;
  let byMatch: RegExpExecArray | null;
  while ((byMatch = PERSON_BY_RE.exec(text)) !== null) {
    const afterBy = byMatch.index + byMatch[0].length;

    let start = afterBy;
    while (start < text.length && /[ \t]/.test(text[start])) start++;
    if (start >= text.length || text[start] === "\n") continue;

    // Read until end of line, comma, opening paren, or next clause
    let end = start;
    const maxEnd = Math.min(text.length, start + 80);
    while (end < maxEnd && !/[\n\r,;(]/.test(text[end])) end++;

    while (end > start && /[\s,;.]/.test(text[end - 1])) end--;

    let personText = text.slice(start, end);
    // Strip parentheticals
    personText = personText.replace(/\s*\([^)]*\)/g, "").trim();
    // Strip email/tel suffixes
    personText = personText.replace(/,?\s*(?:email|e-?mail|tel(?:ephone)?|fax|mobile|phone)\s*:.*$/i, "").trim();

    // Smart name truncation: keep only consecutive name-like words
    // (uppercase start, known particles like de/van/von, or titles like Dr./Sir)
    const rawWords = personText.split(/\s+/);
    const nameWords: string[] = [];
    for (const w of rawWords) {
      if (/^[A-Z\u00C0-\u024F]/.test(w) ||
          /^(?:de|del|di|van|von|der|den|la|le|da|dos|das)$/i.test(w) ||
          /^(?:Dr|Mr|Mrs|Ms|Sir|Prof|Rev|Dame|Lord|Lady)\.?$/i.test(w)) {
        nameWords.push(w);
      } else {
        break; // "in", "of", "with", "the" etc. → stop
      }
    }
    personText = nameWords.join(" ");

    if (personText.length < 3) continue;
    if (!/\s/.test(personText)) continue;
    if (!/^[A-Z\u00C0-\u024F]/.test(personText)) continue;
    if (/^\d|@|\.com|\.org/.test(personText)) continue;
    if (/\d/.test(personText)) continue;

    // Fix 8: Reclassify as ORG if text contains corporate suffix or "Association"
    const isCorporate = CORPORATE_SUFFIX_RE.test(personText) ||
      /\b(?:Association|Foundation|Institute|Commission|Committee|Authority|Department|Bureau|Agency)\b/i.test(personText);

    results.push({
      text: personText,
      type: isCorporate ? "ORGANIZATION" : "PERSON",
      start,
      end: start + personText.length,
      score: 0.75,
      verified: true,
      reason: isCorporate ? "pattern:labeled_org_by" : "pattern:labeled_person_by",
    });
  }

  return results;
}

// ════════════════════════════════════════════════════════════
// Defined party extractor — "between X and Y", "X (the 'Company')"
// ════════════════════════════════════════════════════════════

/** Corporate suffix regex for party validation */
const PARTY_CORP_RE = /\b(?:Ltd\.?|Limited|LLP|Inc\.?|Corp\.?|Corporation|GmbH|AG|AB|SA|NV|BV|PLC|LLC|Co\.|Pty\.?\s*Ltd\.?|Private\s+Limited|PVT\.?\s*LTD\.?)\b/i;

/** Defined term pattern: "Anchore, Inc. (the 'Company')", "John Doe (the "Buyer")" */
const DEFINED_TERM_RE = /\b([A-Z][\w\s&.,'\u2019-]{2,60}?)\s*\(\s*(?:the\s+)?["\u201c\u2018']([\w\s]+)["\u201d\u2019']\s*\)/g;

/** ORG-indicating defined terms */
const ORG_DEFINED_TERMS = /\b(?:company|corporation|employer|franchisor|franchisee|licensor|licensee|vendor|supplier|distributor|contractor|lender|borrower|landlord|tenant|lessor|lessee|developer|provider|operator|publisher|seller|buyer|party|principal|agent|grantor|grantee|client)\b/i;

/** PERSON-indicating defined terms */
const PERSON_DEFINED_TERMS = /\b(?:individual|employee|consultant|executive|director|officer|guarantor|witness|signatory)\b/i;

function extractDefinedParties(text: string): DetectedEntity[] {
  const results: DetectedEntity[] = [];
  // Only scan first 3000 chars (recitals/definitions section)
  const scanText = text.slice(0, 3000);

  DEFINED_TERM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DEFINED_TERM_RE.exec(scanText)) !== null) {
    let partyName = m[1].trim().replace(/[\s,;.]+$/, "");
    const definedTerm = m[2].trim().toLowerCase();

    // Validate: at least 2 chars, starts with uppercase
    if (partyName.length < 2) continue;
    if (!/^[A-Z]/.test(partyName)) continue;
    // Skip generic text like "This Agreement"
    if (/^(?:this|that|the|each|any|such|said|all)\s/i.test(partyName)) continue;

    // Reject document titles: "FRANCHISE AGREEMENT THIS FRANCHISE AGREEMENT"
    if (/\b(?:agreement|contract|deed|amendment|addendum|memorandum|certificate|notice)\b/i.test(partyName)) continue;
    // Reject sentence fragments with verbs
    if (/\b(?:are|shall|is|was|will|may|have|has|had|been|being|does|did)\b/i.test(partyName)) continue;
    // Reject titles/roles without corporate suffix
    if (/\b(?:officer|president|director|manager|secretary|treasurer|chairman|executive)\b/i.test(partyName) && !PARTY_CORP_RE.test(partyName)) continue;
    // Reject form fields with underscores or "No."
    if (/_/.test(partyName) || /\bNo\.\s*$/i.test(partyName)) continue;
    // Reject if contains digits (addresses, reference numbers)
    if (/\d/.test(partyName)) continue;

    // Determine type from defined term or corporate suffix
    let entityType: string;
    if (PARTY_CORP_RE.test(partyName) || ORG_DEFINED_TERMS.test(definedTerm)) {
      entityType = "ORGANIZATION";
    } else if (PERSON_DEFINED_TERMS.test(definedTerm)) {
      entityType = "PERSON";
    } else if (partyName === partyName.toUpperCase() && partyName.split(/\s+/).length >= 2) {
      entityType = "ORGANIZATION"; // ALL-CAPS multi-word → likely ORG
    } else {
      entityType = "ORGANIZATION"; // default for contract parties
    }

    const start = m.index;
    const end = start + partyName.length;

    results.push({
      text: partyName,
      type: entityType,
      start,
      end,
      score: 0.7,
      verified: true,
      reason: "pattern:defined_party",
    });
  }

  return results;
}

/**
 * Run all pattern-based recognizers on the given text.
 * Returns a list of detected entities with positions and scores.
 */
export function runPatternRecognizers(text: string): DetectedEntity[] {
  const results: DetectedEntity[] = [];

  for (const rec of ALL_RECOGNIZERS) {
    for (const pat of rec.patterns) {
      // Reset regex state (global flag)
      pat.regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pat.regex.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        const score = applyContextBoost(text, start, end, rec.context, pat.score);

        // IBAN false-positive filter: suppress trade mark registration numbers
        // e.g. "UK00003456789" preceded by "trade mark" or "registration number"
        if (rec.entityType === "IBAN_CODE") {
          const before = text.slice(Math.max(0, start - 120), start);
          if (/trade\s*mark|registration\s+(?:number|no\.?)|(?:classes?\s+\d)/i.test(before)) continue;
        }

        // Fix 1: IP_ADDRESS — filter legal section numbering (2.32.1.1, 5.1.6.1)
        if (rec.entityType === "IP_ADDRESS") {
          const matchText = match[0];
          const before = text.slice(Math.max(0, start - 30), start);
          // Skip if preceded by section/clause indicator or § symbol
          if (/(?:§|section|clause|article|item|paragraph|part|sub[-\s]?(?:section|clause))\s*$/i.test(before)) continue;
          // Skip if preceded by dotted-number pattern (legal numbering continuation)
          if (/\d+\.\s*$/.test(before)) continue;
          // Skip if all octets are small — real IPs almost never have first≤9 + all≤50
          const octets = matchText.split(".").map(Number);
          if (octets.length === 4 && octets[0] <= 9 && octets.every(o => o <= 50)) continue;
        }

        // Fix 3: UK_NHS — filter footer/order/reference numbers, phone context
        if (rec.entityType === "UK_NHS") {
          const before = text.slice(Math.max(0, start - 60), start);
          const after = text.slice(end, Math.min(text.length, end + 60));
          const ctx = before + after;
          // Order/document/reference numbers (handles "Order / No.", "Order No.", etc.)
          if (/\b(?:order[\s/]*no|document[\s/]*no|ref(?:erence)?[\s./]*no|license[\s/]*no|contract[\s/]*no|form[\s/]*no|page\s+\d)/i.test(ctx)) continue;
          // Footer/copyright context
          if (/(?:©|copyright|\bpage\b|\binitial)/i.test(ctx)) continue;
          // Phone/fax context — reclassify as PHONE_NUMBER rather than dropping.
          // Australian / international phone numbers often match the 10-digit NHS shape.
          if (/\b(?:tel|fax|phone|mobile|telephone)\s*:?\s*$/i.test(before)) {
            results.push({
              text: match[0],
              type: "PHONE_NUMBER",
              start,
              end,
              score: 0.75,
              verified: true,
              reason: "pattern:labeled_phone",
            });
            continue;
          }
        }

        // ORG false-positive: reject clause verbs / disclaimer fragments
        if (rec.entityType === "ORGANIZATION") {
          const matchText = match[0];
          // "BUT NOT LIMITED", "OR IMPLIED, INCLUDING, BUT NOT LIMITED" — disclaimer boilerplate
          if (/\b(?:NOT|BUT|OR|AND)\s+LIMITED\b/i.test(matchText)) continue;
          // All-caps clause fragments with disclaimer verbs
          if (/\b(?:EXPRESS|IMPLIED|INCLUDING|WARRANTIES|MERCHANTABILITY|FITNESS)\b/.test(matchText)) continue;
          // Pure list enumeration: "A Partnership, An LLC, An LLP"
          if (/\b(?:A|An|The)\s+(?:Partnership|LLC|LLP|Corporation|Limited)\b/i.test(matchText) && /,/.test(matchText)) continue;
        }

        results.push({
          text: match[0],
          type: rec.entityType,
          start,
          end,
          score,
          verified: true,
          reason: `pattern:${pat.name}`,
        });
      }
    }
  }

  // Labeled field extraction — structured tables/forms
  results.push(...extractLabeledAddresses(text));
  results.push(...extractLabeledPersons(text));

  // Defined party extraction — recitals/definitions in contracts
  results.push(...extractDefinedParties(text));

  // Final cleanup: trim trailing artifacts on ORG captures
  for (const e of results) {
    if (e.type !== "ORGANIZATION") continue;
    let cleaned = e.text;
    // Strip trailing "( ACRONYM" or bare "("
    cleaned = cleaned.replace(/\s*\(\s*[A-Z]{2,6}\s*$/, "").replace(/\s*\(\s*$/, "");
    // Strip trailing stopwords: "Restaurants as", "Smith Group and"
    cleaned = cleaned.replace(/\s+(?:as|of|the|and|to|in|or|but|for|with|by)\s*$/i, "");
    // Strip leading "See " / "See also " (citation artifact)
    cleaned = cleaned.replace(/^(?:See(?:\s+also)?)\s+/, "");
    // Strip leading quote/dash artifacts
    cleaned = cleaned.replace(/^["\u201c\u201d\u2013\u2014-]+\s*/, "");
    cleaned = cleaned.replace(/[\s,;.]+$/, "");
    if (cleaned !== e.text && cleaned.length >= 2) {
      e.text = cleaned;
      e.end = e.start + cleaned.length;
    }
  }

  // Final cleanup: strip label prefixes from PERSON captures & reject fragments
  const cleanedResults: DetectedEntity[] = [];
  for (const e of results) {
    if (e.type !== "PERSON") {
      cleanedResults.push(e);
      continue;
    }
    let cleaned = e.text;
    // Strip leading "Name:", "Signature of", "Signed", "Witness:", etc.
    cleaned = cleaned.replace(/^(?:Name|Signatory|Witness|Signature(?:\s+of)?|Signed(?:\s+sealed(?:\s+and)?)?|Printed\s+Name)\s*:?\s*/i, "");
    cleaned = cleaned.replace(/^["\u201c\u201d]+\s*/, "");
    cleaned = cleaned.replace(/[\s,;.]+$/, "");
    // Reject if now too short, missing space (single word), or contains no alphabetic
    if (cleaned.length < 3 || !/\s/.test(cleaned) || !/[A-Za-z]{2}/.test(cleaned)) continue;
    // Reject trailing-conjunction fragments: "Signed sealed and", "Signature of"
    if (/\b(?:of|and|by|the|for|to|in|or|with)$/i.test(cleaned.trim())) continue;
    if (cleaned !== e.text) {
      e.text = cleaned;
      e.end = e.start + cleaned.length;
    }
    cleanedResults.push(e);
  }

  return cleanedResults;
}
