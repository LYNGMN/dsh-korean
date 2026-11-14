# DSH 개발팀 요청 초안 (올리지 않음)

올릴 곳: `deepseek-ai/deepseek-harness` 이슈. 올리기 전에 사용자 승인이 필요합니다.

---

**Title:** Sidebar: a seat for child rows under a session row

**Body:**

The workspace browser exposes `sidebar.session.row.leading`, `sidebar.session.row.trailing`, `sidebar.session.row.hover` and `sidebar.workspaces.session.row.action`, but no seat that renders *below* a session row. Plugins that want to show a session's subagents as an indented tree (parent row, then one row per child with a connector and a state icon) currently have to insert DOM next to `[data-row-key="session:<id>"]`, which is fragile across releases and sits outside the tree's keyboard model.

Proposal: a `list`-kind seat, e.g. `sidebar.session.row.children`, rendered right after the row inside the same tree group, with owner props `{ sessionId }`, plus an `expanded`/`onExpandedChange` pair so the row can show a disclosure control and children participate in tree keyboard navigation as `treeitem`s.

Context: DSH already derives `runningSubagentCount` for rows and lists children in the conversation header catalog; this would let that tree appear in the sidebar the way other agent apps show it.
