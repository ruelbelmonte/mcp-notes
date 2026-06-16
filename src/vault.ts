import { promises as fs } from "node:fs";
import path from "node:path";

/** Raised when a request would read outside the vault, or a note is missing. */
export class VaultError extends Error {}

/**
 * Resolve a vault-relative path to an absolute path, refusing anything that
 * escapes the vault. This is the security boundary: an MCP tool exposed to a
 * model must never be talked into reading `../../etc/passwd`. Tested directly.
 */
export function resolveSafe(baseDir: string, relativePath: string): string {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, relativePath);
  const rel = path.relative(base, target);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    if (rel === "") return target; // the vault root itself is fine
    throw new VaultError(`path escapes the vault: ${relativePath}`);
  }
  return target;
}

/** All markdown notes in the vault, as sorted vault-relative paths with `/`. */
export async function listNotes(baseDir: string): Promise<string[]> {
  const base = path.resolve(baseDir);
  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && full.toLowerCase().endsWith(".md")) {
        out.push(path.relative(base, full).split(path.sep).join("/"));
      }
    }
  }

  await walk(base);
  return out.sort();
}

/** Read a note's contents, refusing paths outside the vault. */
export async function readNote(baseDir: string, relativePath: string): Promise<string> {
  const target = resolveSafe(baseDir, relativePath);
  try {
    return await fs.readFile(target, "utf8");
  } catch {
    throw new VaultError(`note not found: ${relativePath}`);
  }
}

export interface SearchHit {
  path: string;
  line: number;
  text: string;
}

/** Case-insensitive substring search across all notes, bounded by `limit`. */
export async function searchNotes(
  baseDir: string,
  query: string,
  limit = 20,
): Promise<SearchHit[]> {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];

  const hits: SearchHit[] = [];
  for (const rel of await listNotes(baseDir)) {
    const content = await readNote(baseDir, rel);
    let lineNo = 0;
    for (const line of content.split(/\r?\n/)) {
      lineNo++;
      if (line.toLowerCase().includes(needle)) {
        hits.push({ path: rel, line: lineNo, text: line.trim() });
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}
