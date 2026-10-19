import { constants, promises as fs } from "node:fs";
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

function isMarkdown(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".md");
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
      } else if (
        entry.isFile() &&
        isMarkdown(full) &&
        (await fs.lstat(full)).nlink === 1 // readNote refuses hard links
      ) {
        out.push(path.relative(base, full).split(path.sep).join("/"));
      }
    }
  }

  await walk(base);
  return out.sort();
}

/** Read a markdown note's contents, refusing anything outside the vault. */
export async function readNote(baseDir: string, relativePath: string): Promise<string> {
  const target = resolveSafe(baseDir, relativePath);
  if (!isMarkdown(target)) {
    throw new VaultError(`not a markdown note: ${relativePath}`);
  }

  let realTarget: string;
  try {
    realTarget = await fs.realpath(target);
  } catch {
    throw new VaultError(`note not found: ${relativePath}`);
  }
  // resolveSafe checks the path as written; a symlink inside the vault can still
  // point outside it, so containment is re-checked on the real location. The
  // error names only the requested path: the real one would leak host layout.
  try {
    resolveSafe(await fs.realpath(baseDir), realTarget);
  } catch {
    throw new VaultError(`path escapes the vault: ${relativePath}`);
  }
  if (!isMarkdown(realTarget)) {
    throw new VaultError(`not a markdown note: ${relativePath}`);
  }

  // Open once without following links and read from that handle, so the file
  // checked is the file read. A hard link is invisible to realpath, so any
  // file with more than one link is refused.
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(realTarget, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    throw new VaultError(`note not found: ${relativePath}`);
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1) {
      throw new VaultError(`not a plain note file: ${relativePath}`);
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
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
