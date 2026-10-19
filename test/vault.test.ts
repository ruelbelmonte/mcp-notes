import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VaultError, listNotes, readNote, resolveSafe, searchNotes } from "../src/vault";

let dir: string;
let outside: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-"));
  await fs.mkdir(path.join(dir, "ideas"), { recursive: true });
  await fs.writeFile(path.join(dir, "welcome.md"), "# Welcome\nThis vault holds notes.\n");
  await fs.writeFile(path.join(dir, "ideas", "rag.md"), "# RAG\nGround answers in sources.\n");
  await fs.writeFile(path.join(dir, ".env"), "API_KEY=not-a-note\n");

  outside = await fs.mkdtemp(path.join(os.tmpdir(), "outside-"));
  await fs.writeFile(path.join(outside, "secret.md"), "outside the vault\n");
  // A junction needs no admin rights on Windows; other platforms ignore the type.
  await fs.symlink(outside, path.join(dir, "escape"), "junction");
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rm(outside, { recursive: true, force: true });
});

describe("resolveSafe", () => {
  it("allows paths inside the vault", () => {
    expect(() => resolveSafe(dir, "ideas/rag.md")).not.toThrow();
  });

  it("blocks parent-directory traversal", () => {
    expect(() => resolveSafe(dir, "../secrets.txt")).toThrow(VaultError);
    expect(() => resolveSafe(dir, "ideas/../../../etc/passwd")).toThrow(VaultError);
  });

  it("blocks absolute paths outside the vault", () => {
    expect(() => resolveSafe(dir, "/etc/passwd")).toThrow(VaultError);
  });
});

describe("listNotes", () => {
  it("lists markdown files recursively as sorted vault-relative paths", async () => {
    expect(await listNotes(dir)).toEqual(["ideas/rag.md", "welcome.md"]);
  });
});

describe("readNote", () => {
  it("reads a note inside the vault", async () => {
    expect(await readNote(dir, "welcome.md")).toContain("Welcome");
  });

  it("refuses to read outside the vault", async () => {
    await expect(readNote(dir, "../../etc/passwd")).rejects.toThrow(VaultError);
  });

  it("refuses to follow a symlink that points outside the vault", async () => {
    await expect(readNote(dir, "escape/secret.md")).rejects.toThrow(VaultError);
    await expect(readNote(dir, "escape/secret.md")).rejects.not.toThrow(outside);
  });

  it("refuses to read files that are not markdown notes", async () => {
    await expect(readNote(dir, ".env")).rejects.toThrow(VaultError);
  });

  it("reports a missing note", async () => {
    await expect(readNote(dir, "nope.md")).rejects.toThrow(VaultError);
  });
});

describe("searchNotes", () => {
  it("finds matches with path and line number", async () => {
    const hits = await searchNotes(dir, "ground");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.path).toBe("ideas/rag.md");
  });

  it("returns nothing for a blank query", async () => {
    expect(await searchNotes(dir, "   ")).toEqual([]);
  });

  it("respects the limit", async () => {
    const hits = await searchNotes(dir, "e", 1);
    expect(hits).toHaveLength(1);
  });
});
