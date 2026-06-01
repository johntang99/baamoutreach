import Papa from "papaparse";
import * as XLSX from "xlsx";

const EMAIL_KEYS = [
  "email",
  "email_address",
  "e_mail",
  "e-mail",
  "mail",
];

const FULL_NAME_KEYS = ["full_name", "fullname", "name", "contact_name"];
const FIRST_NAME_KEYS = ["first_name", "firstname", "first"];
const LAST_NAME_KEYS = ["last_name", "lastname", "last"];
const COMPANY_KEYS = ["company", "company_name", "business", "business_name"];
const LANGUAGE_KEYS = ["language", "lang", "locale"];

export type ListLanguage = "en" | "zh" | "es";

export interface ListCandidateRow {
  email: string;
  fullName: string;
  companyName: string | null;
  language: ListLanguage;
  sourceRow: Record<string, string>;
}

export function normalizeKey(key: string) {
  return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function firstNonEmpty(
  row: Record<string, string>,
  candidateKeys: string[],
): string {
  for (const key of candidateKeys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toRowMap(raw: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    normalized[normalizeKey(key)] =
      typeof value === "string" ? value.trim() : String(value ?? "").trim();
  }
  return normalized;
}

function hasAnyKey(rows: Record<string, string>[], keys: string[]) {
  return rows.some((row) =>
    keys.some((key) => {
      const value = row[key];
      return typeof value === "string" && value.trim().length > 0;
    }),
  );
}

export function assertRequiredListFormat(rows: Record<string, string>[]) {
  if (rows.length === 0) {
    throw new Error("The uploaded file has no data rows.");
  }

  const hasEmail = hasAnyKey(rows, EMAIL_KEYS);
  const hasName =
    hasAnyKey(rows, FULL_NAME_KEYS) ||
    (hasAnyKey(rows, FIRST_NAME_KEYS) && hasAnyKey(rows, LAST_NAME_KEYS));

  if (!hasEmail || !hasName) {
    throw new Error(
      "List file format requires email and name columns. Optional columns: company, language.",
    );
  }
}

function normalizeLanguage(value: string, fallback: ListLanguage): ListLanguage {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "zh" || normalized === "cn" || normalized === "chinese" || normalized === "中文") {
    return "zh";
  }
  if (normalized === "es" || normalized === "spanish" || normalized === "espanol" || normalized === "español") {
    return "es";
  }
  if (normalized === "en" || normalized === "english") {
    return "en";
  }
  return fallback;
}

export function parseCsvRows(csvText: string): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeKey,
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(`CSV parse error at row ${first.row ?? "unknown"}.`);
  }

  return (parsed.data ?? []).map((row) => toRowMap(row));
}

export async function parseSpreadsheetRows(
  fileLike: File,
): Promise<Record<string, string>[]> {
  const filename = fileLike.name.toLowerCase();
  if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
    const buffer = await fileLike.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("Excel file has no sheets.");
    }
    const sheet = workbook.Sheets[firstSheetName];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      blankrows: false,
    });
    return jsonRows.map((row) => toRowMap(row));
  }

  const csvText = await fileLike.text();
  return parseCsvRows(csvText);
}

export function toListCandidate(
  row: Record<string, string>,
  defaultLanguage: ListLanguage,
): ListCandidateRow | null {
  const email = firstNonEmpty(row, EMAIL_KEYS).toLowerCase();
  if (!email || !isValidEmail(email)) {
    return null;
  }

  let fullName = firstNonEmpty(row, FULL_NAME_KEYS);
  if (!fullName) {
    const firstName = firstNonEmpty(row, FIRST_NAME_KEYS);
    const lastName = firstNonEmpty(row, LAST_NAME_KEYS);
    const joined = `${firstName} ${lastName}`.trim();
    fullName = joined;
  }

  if (!fullName) {
    return null;
  }

  const companyName = firstNonEmpty(row, COMPANY_KEYS) || null;
  const language = normalizeLanguage(
    firstNonEmpty(row, LANGUAGE_KEYS),
    defaultLanguage,
  );

  return {
    email,
    fullName,
    companyName,
    language,
    sourceRow: row,
  };
}
