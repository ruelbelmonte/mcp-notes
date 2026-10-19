# Design decisions

## 1. Logic split from the MCP wiring

**Decision.** All behaviour and the security boundary live in `vault.ts` as
plain async functions. `server.ts` is a thin adapter that registers them as MCP
tools. The test suite imports `vault.ts` directly.

**Why.** It means the parts that matter (path sandboxing, search) are tested
without standing up an MCP transport or depending on the SDK's surface. The same
separation a good service uses between transport and behaviour.

**Cost.** One extra module and a small amount of indirection. Worth it the first
time the SDK changes shape and the tests keep passing unchanged.

## 2. Read-only by construction

**Decision.** There is no write, move, or delete tool. The server can list,
read, and search, nothing else.

**Why.** Least privilege. A notes reader does not need to mutate files, and a
tool a model can call to delete files is a liability. Removing the capability
entirely is stronger than guarding it.

**Cost.** Anyone wanting write access has to add it deliberately, which is the
point.

## 3. Path traversal is prevented in one tested place

**Decision.** Every file access goes through `resolveSafe`, which resolves the
requested path against the vault root and rejects anything that lands outside it
(`..` traversal or absolute paths). It is covered by tests that assert escapes
throw.

**Why.** A model can be steered by its input; "read `../../etc/passwd`" must
fail by construction, not by hoping the model behaves. Centralising it in one
function means there is exactly one place to audit.

**Symlinks.** A path can look contained and still escape through a symlink
inside the vault. `readNote` resolves the real location with `realpath` and
re-checks containment on that, and the error names only the requested path so
host layout is not leaked to the model. Listing and search skip symlinks.

**Only notes.** `readNote` refuses anything that is not a `.md` file, checked on
both the requested and the resolved path, so a stray `.env` or key file is not
readable through the tool, including via a `.md` symlink pointing at it.

**Hard links.** A hard link has no "real" path to resolve, so `realpath` cannot
see through it. The file is opened once without following links, and refused
unless the open handle is a regular file with exactly one link. Listing skips
the same files, so list, search and read agree.

**Size.** `readNote` checks the open handle's size and refuses notes over 1 MB,
so one file cannot flood the model's context.

**Limit.** The open uses `O_NOFOLLOW`, which covers only the last path
component, and Windows has no equivalent flag. A local process that swaps a
directory for a symlink between the containment check and the open could still
redirect the read. That needs an attacker who can already write to the vault;
it is out of scope for a local, single-user vault.

## 4. Search is keyword-only, on purpose

**Decision.** `search_notes` does case-insensitive substring matching with a
bounded result count. Each matched line is cut to 200 characters around the
match, and notes `readNote` refuses (too large, links) are skipped rather than
failing the whole search.

**Why.** For a personal vault it is predictable, dependency-free, and fast
enough. Semantic search is the obvious upgrade and is noted as such; adding it
before it is needed would be speculative complexity.
