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

**Only notes.** `readNote` refuses anything that is not a `.md` file, so a stray
`.env` or key file inside the vault is not readable through the tool.

**Limit.** There is a small window between the containment check and the read in
which a local process could swap a file for a symlink. Closing it needs
file-descriptor-based checks; it is out of scope for a local, single-user vault.

## 4. Search is keyword-only, on purpose

**Decision.** `search_notes` does case-insensitive substring matching with a
bounded result count.

**Why.** For a personal vault it is predictable, dependency-free, and fast
enough. Semantic search is the obvious upgrade and is noted as such; adding it
before it is needed would be speculative complexity.
