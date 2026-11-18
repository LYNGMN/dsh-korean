# DSH 개발팀 요청 초안 (올리지 않음)

올릴 곳: `deepseek-ai/deepseek-harness` 이슈. 올리기 전에 사용자 승인이 필요합니다.
관련 공개 요청: Discussion #10006, #6448, #4741.

---

**Title:** `workspace/moveSession`: move an existing conversation to another workspace

**Body:**

DSH binds a Session to the directory it was created in: `Workspace.attachSession` requires `realpath(header.cwd) === workspace.path`, the header `cwd` is documented as immutable, and the JSONL backend derives the project directory from that same `cwd`. There is no `workspace/moveSession` (or public attach/detach), and the Session row menu only offers pin / rename / fork / archive. Today a user whose project moved to a new folder must either keep the conversation in the old workspace and change the working directory at runtime (stored workspace and live cwd drift), or start a new conversation and lose the history.

Community plugins do implement the move, but through private internals and with known side effects (one leaves a stale durable `working-directory` row; another exposes an unauthenticated local HTTP endpoint). A native operation would let them, and script users (`dsh session move`), rely on one supported path.

**Proposal**

1. `WorkspaceRegistry.moveSession(sessionId, targetWorkspaceId)` (or public `attachSession`/`detachSession` plus a documented order): validate the target, refuse while the Session has a live writer or running work through the existing `workspace/session-activity` gate, `detachSession(source)` first and `attachSession(target)` second, and make an interrupted operation recoverable.
2. A persistence-owned header relocation primitive: quiesce the writer, rewrite only the header frame with the new `cwd`, keep the event frames byte-identical, publish without overwrite, verify the new artifact, and only then remove the old generation. `create` + replay is a correct fallback but re-encodes the whole log.
3. A built-in **Move to workspace…** row in the Session `…` menu (and later a cross-workspace drop target), reusing the same command.

**Acceptance**

- Moving an idle Session, then resuming it from the target workspace, opens with the target `cwd` and the full history and title.
- A running or open Session is refused with a clear reason, listing the running work families as `archiveSession` already does.
- A move interrupted between relocation and registry update leaves either the old state or the new state, never a Session owned by two workspaces (the registry currently refuses to load that state, which blanks the whole workspace list).
- No Session format version change; existing logs still load.
- A Session that changed its working directory during the conversation keeps behaving consistently: either the move rewrites the durable `working-directory` state to the target, or the UI states that the effective directory will stay elsewhere.

**Field notes from a plugin implementation (0.2.2-rc.3)**

- `stat()` returns `sizeBytes` but no `eventCount` in the JSONL backend, so a copy-based implementation must verify event counts by reading first/tail events.
- `create()` rejects when any log for the same id exists anywhere under the root, and while a write handle for that id is open; relocate and close first.
- Opening a Session for `write` briefly is the only public way to prove no writer is active.
- A Session owned by two workspaces makes `@deepseek-ai/dsh-workspace` refuse the stored state, so `detach` must precede `attach`.
