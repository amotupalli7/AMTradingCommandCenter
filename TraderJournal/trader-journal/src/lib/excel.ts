import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { Trade, Execution, EDITABLE_FIELDS, EditableField } from "./types";

const EXCEL_PATH = path.resolve(process.cwd(), "..", "trades.xlsx");
const BACKUP_DIR = path.resolve(process.cwd(), "..", "backups");

// Read Excel file via buffer to avoid file locking issues on Windows
// (when Excel has the file open, direct readFile fails)
function readWorkbook(options?: XLSX.ParsingOptions): XLSX.WorkBook {
  const buffer = fs.readFileSync(EXCEL_PATH);
  return XLSX.read(buffer, { ...options });
}

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function createBackup(): string {
  ensureBackupDir();
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const backupPath = path.join(BACKUP_DIR, `trades_${timestamp}.xlsx`);
  fs.copyFileSync(EXCEL_PATH, backupPath);
  return backupPath;
}

function formatExcelDate(serial: number | string | Date): string {
  if (!serial && serial !== 0) return "";
  if (typeof serial === "string") return serial;
  if (serial instanceof Date) {
    return serial.toISOString().split("T")[0];
  }
  // Excel serial date
  const date = new Date((serial - 25569) * 86400 * 1000);
  return date.toISOString().split("T")[0];
}

function formatExcelTime(value: number | string | Date | undefined): string {
  if (!value && value !== 0) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) {
    return value.toTimeString().slice(0, 8);
  }
  // Excel time as fraction of day
  if (typeof value === "number" && value < 1) {
    const totalSeconds = Math.round(value * 86400);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return String(value);
}

// Helper to get a value from a row, trying trimmed key variations
function getVal(row: Record<string, unknown>, key: string): unknown {
  if (key in row) return row[key];
  // Try with spaces
  const trimmedKeys = Object.keys(row);
  for (const k of trimmedKeys) {
    if (k.trim() === key) return row[k];
  }
  return undefined;
}

export function readTrades(): Trade[] {
  const workbook = readWorkbook({ cellDates: true });
  const sheet = workbook.Sheets["Trades"];
  if (!sheet) throw new Error('Sheet "Trades" not found');

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  return raw.map((row) => {
    const g = (key: string) => getVal(row, key);
    return {
      "Trade ID": Number(g("Trade ID")) || 0,
      Date: formatExcelDate(g("Date") as number | string | Date),
      "Enter Time": formatExcelTime(g("Enter Time") as number | string | Date | undefined),
      Ticker: String(g("Ticker") || ""),
      Side: String(g("Side") || ""),
      Price: Number(g("Price")) || 0,
      "Net P&L": Number(g("Net P&L")) || 0,
      "Net R": Number(g("Net R")) || 0,
      Win: Number(g("Win")) || 0,
      "X Score": Number(g("Xscore") || g("X Score")) || 0,
      Setup: String(g("Setup") || ""),
      "Sub-Setup": String(g("Sub-Setup") || ""),
      Trigger: String(g("Trigger") || ""),
      Tags: String(g("Tags") || ""),
      "Entry Notes": String(g("Entry Notes") || ""),
      "Exit Notes": String(g("Exit Notes") || ""),
      Notes: String(g("Notes") || ""),
      "Mistake Notes": String(g("Mistake Notes") || ""),
      Chart: String(g("Chart") || ""),
      search: String(g("search") || ""),
    };
  });
}

export function readExecutions(): Execution[] {
  const workbook = readWorkbook({ cellDates: true });
  const sheet = workbook.Sheets["Executions"];
  if (!sheet) throw new Error('Sheet "Executions" not found');

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  return raw.map((row) => {
    const g = (key: string) => getVal(row, key);
    return {
    "Trade ID": Number(g("Trade ID")) || 0,
    Date: formatExcelDate(g("Date") as number | string | Date),
    "Enter Time": formatExcelTime(g("Enter Time") as number | string | Date | undefined),
    "Symbol / Ticker": String(g("Symbol / Ticker") || g("Symbol") || g("Ticker") || ""),
    Side: String(g("Side") || ""),
    Price: Number(g("Price")) || 0,
    Qty: Number(g("Qty")) || 0,
    Route: String(g("Route") || ""),
    Type: String(g("Type") || ""),
    "New Trade": Number(g("New Trade")) || 0,
    "$ Value": Number(g("$ Value")) || 0,
    "Gross P&L": Number(g("Gross P&L")) || 0,
    Quantity: Number(g("Quantity")) || 0,
    "Exit Time": formatExcelTime(g("Exit Time") as number | string | Date | undefined),
    ECN: Number(g("ECN")) || 0,
    Comms: Number(g("Comms")) || 0,
    SEC: Number(g("SEC")) || 0,
    FINRA: Number(g("FINRA")) || 0,
    Locates: Number(g("Locates")) || 0,
    "CAT FEE": Number(g("CAT Fee") || g("CAT FEE")) || 0,
    "Net P&L": Number(g("Net P&L")) || 0,
    "$ Risk": Number(g("$ Risk")) || 0,
    "R Net": Number(g("R Net")) || 0,
    Win: Number(g("Win")) || 0,
    "Risk %": Number(g("Risk %")) || 0,
    "X: Failing Goal": Number(g("X: Failing Goal")) || 0,
    "X: Non-Playbook Trade": Number(g("X: Non-Playbook Trade")) || 0,
    "X: Selection Mistake": Number(g("X: Selection Mistake")) || 0,
    "X: Entry Mistake": Number(g("X: Entry Mistake")) || 0,
    "X: Sizing Mistake": Number(g("X: Sizing Mistake")) || 0,
    "X: Exit Mistake": Number(g("X: Exit Mistake")) || 0,
    "X: Emotional Mistake": Number(g("X: Emotional Mistake")) || 0,
    "X: Preparation Mistake": Number(g("X: Preparation Mistake")) || 0,
    "X Score": Number(g("Xscore") || g("X Score")) || 0,
    Month: Number(g("Month")) || 0,
    "~Pos Size": Number(g("~Pos Size")) || 0,
    };
  });
}

export function getTradeById(tradeId: number): Trade | undefined {
  const trades = readTrades();
  return trades.find((t) => t["Trade ID"] === tradeId);
}

export function updateTradeField(
  tradeId: number,
  field: string,
  value: string
): { success: boolean; error?: string } {
  if (!EDITABLE_FIELDS.includes(field as EditableField)) {
    return { success: false, error: `Field "${field}" is not editable` };
  }

  try {
    // Create backup before any modification
    createBackup();

    // Read the raw workbook (preserving structure)
    const workbook = readWorkbook();
    const sheet = workbook.Sheets["Trades"];
    if (!sheet) {
      return { success: false, error: 'Sheet "Trades" not found' };
    }

    // Get range
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");

    // Find the column index for the field
    let fieldCol = -1;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddr = XLSX.utils.encode_cell({ r: 0, c });
      const cell = sheet[cellAddr];
      if (cell && String(cell.v).trim() === field) {
        fieldCol = c;
        break;
      }
    }

    if (fieldCol === -1) {
      return { success: false, error: `Column "${field}" not found in sheet` };
    }

    // Find the row with matching Trade ID
    let targetRow = -1;
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const cellAddr = XLSX.utils.encode_cell({ r, c: 0 });
      const cell = sheet[cellAddr];
      if (cell && Number(cell.v) === tradeId) {
        targetRow = r;
        break;
      }
    }

    if (targetRow === -1) {
      return {
        success: false,
        error: `Trade ID ${tradeId} not found`,
      };
    }

    // Update the cell
    const targetAddr = XLSX.utils.encode_cell({ r: targetRow, c: fieldCol });
    sheet[targetAddr] = { t: "s", v: value };

    // Write back using buffer to handle file locking on Windows
    const wbOut = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    fs.writeFileSync(EXCEL_PATH, wbOut);

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
