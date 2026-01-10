const CSV_STORAGE_VERSION = 1;

type CsvBackup = {
  version: number;
  headers: string[];
  rows: string[];
};

const quote = (value: string) => {
  const safe = value.replace(/"/g, '""');
  return `"${safe}"`;
};

const createBaseBackup = (headers: string[]): CsvBackup => ({
  version: CSV_STORAGE_VERSION,
  headers,
  rows: [],
});

const coerceBackup = (raw: unknown, headers: string[]): CsvBackup => {
  if (
    typeof raw === "object" &&
    raw !== null &&
    Array.isArray((raw as CsvBackup).headers) &&
    Array.isArray((raw as CsvBackup).rows)
  ) {
    const parsed = raw as CsvBackup;
    const safeHeaders =
      parsed.headers.length > 0 ? parsed.headers : headers;
    return {
      version: parsed.version ?? CSV_STORAGE_VERSION,
      headers: safeHeaders,
      rows: parsed.rows,
    };
  }

  return createBaseBackup(headers);
};

export const appendToLocalStorageCsv = (
  storageKey: string,
  headers: string[],
  values: string[]
) => {
  if (typeof window === "undefined") {
    return;
  }

  const row = values.map((value) => quote(value)).join(",");
  const existing = localStorage.getItem(storageKey);

  let backup: CsvBackup;
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      backup = coerceBackup(parsed, headers);
    } catch (err) {
      console.error("Unable to parse CSV backup, resetting", err);
      backup = createBaseBackup(headers);
    }
  } else {
    backup = createBaseBackup(headers);
  }

  backup.rows.push(row);
  localStorage.setItem(storageKey, JSON.stringify(backup));
};

