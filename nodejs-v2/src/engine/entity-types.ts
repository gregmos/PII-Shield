/**
 * PII Shield v2.0.0 — Entity type constants
 * Ported from pii_shield_server.py lines 361-392
 */

/** All entity types supported by PII Shield */
export const SUPPORTED_ENTITIES = [
  "PERSON", "ORGANIZATION", "LOCATION", "NRP",
  "EMAIL_ADDRESS", "PHONE_NUMBER", "URL", "IP_ADDRESS",
  "ID_DOC", "CREDIT_CARD", "IBAN_CODE", "CRYPTO",
  "US_SSN", "US_PASSPORT", "US_DRIVER_LICENSE",
  "UK_NHS", "UK_NIN", "UK_PASSPORT", "UK_CRN", "UK_DRIVING_LICENCE",
  "EU_VAT", "EU_PASSPORT",
  "DE_TAX_ID", "DE_SOCIAL_SECURITY",
  "FR_NIR", "FR_CNI",
  "IT_FISCAL_CODE", "IT_VAT",
  "ES_DNI", "ES_NIE",
  "CY_TIC", "CY_ID_CARD",
  "FI_HETU", "FI_BUSINESS_ID",
  "MEDICAL_LICENSE",
] as const;

export type EntityType = (typeof SUPPORTED_ENTITIES)[number];

/** Short tag names for placeholders: ORGANIZATION → ORG, etc. */
export const TAG_NAMES: Record<string, string> = {
  PERSON: "PERSON",
  ORGANIZATION: "ORG",
  LOCATION: "LOCATION",
  NRP: "NRP",
  EMAIL_ADDRESS: "EMAIL",
  PHONE_NUMBER: "PHONE",
  URL: "URL",
  IP_ADDRESS: "IP",
  ID_DOC: "ID_DOC",
  CREDIT_CARD: "CREDIT_CARD",
  IBAN_CODE: "IBAN",
  CRYPTO: "CRYPTO",
  US_SSN: "US_SSN",
  US_PASSPORT: "US_PASSPORT",
  US_DRIVER_LICENSE: "US_DL",
  UK_NHS: "UK_NHS",
  UK_NIN: "UK_NIN",
  UK_PASSPORT: "UK_PASSPORT",
  UK_CRN: "UK_CRN",
  UK_DRIVING_LICENCE: "UK_DL",
  EU_VAT: "EU_VAT",
  EU_PASSPORT: "EU_PASSPORT",
  DE_TAX_ID: "DE_TAX",
  DE_SOCIAL_SECURITY: "DE_SSN",
  FR_NIR: "FR_NIR",
  FR_CNI: "FR_CNI",
  IT_FISCAL_CODE: "IT_CF",
  IT_VAT: "IT_VAT",
  ES_DNI: "ES_DNI",
  ES_NIE: "ES_NIE",
  CY_TIC: "CY_TIC",
  CY_ID_CARD: "CY_ID",
  FI_HETU: "FI_HETU",
  FI_BUSINESS_ID: "FI_YID",
  MEDICAL_LICENSE: "MED_LIC",
};

/** Entity types that represent proper nouns (names, organizations, locations) */
export const NAMED_ENTITY_TYPES = new Set([
  "PERSON", "ORGANIZATION", "LOCATION", "NRP",
]);
