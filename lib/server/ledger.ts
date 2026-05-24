import fs from "fs/promises"
import path from "path"
import type { LedgerEntry } from "@/lib/types"

const DATA_DIR = path.join(process.cwd(), "data", "books")

function ledgerPath(bookId: string): string {
  return path.join(DATA_DIR, bookId, "ledger.jsonl")
}

export async function appendLedgerEntry(
  bookId: string,
  entry: Omit<LedgerEntry, "id" | "bookId" | "timestamp">,
): Promise<void> {
  const record: LedgerEntry = {
    id: `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    bookId,
    timestamp: new Date().toISOString(),
    ...entry,
  }

  const line = JSON.stringify(record) + "\n"
  await fs.appendFile(ledgerPath(bookId), line, "utf-8")
}

export async function listLedgerEntries(bookId: string): Promise<LedgerEntry[]> {
  const filePath = ledgerPath(bookId)
  try {
    const raw = await fs.readFile(filePath, "utf-8")
    const lines = raw.trim().split("\n").filter(Boolean)
    const entries: LedgerEntry[] = []
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line))
      } catch {
        // skip malformed lines
      }
    }
    // newest first
    return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  } catch {
    return []
  }
}
