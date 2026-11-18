// DSH 왼쪽 목록의 대화를 다른 작업공간으로 옮기는 화면 쪽 번들.
// lib/client.js는 scripts/build.mjs가 이 파일과 src/client/*.js, src/style.css로 만든다. 직접 고치지 않는다.
window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-workspace-move',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef } = React
    const VERSION = __VERSION__
    const STYLE_TEXT = __CSS__

    __PURE__

    function MoveOverlay({ useWorkspaces }) {
      return h(React.Fragment, null,
        h(MoveDialog, { useWorkspaces }),
        h(DeleteDialog),
        h(MoveToast))
    }

    return {
      inject: ['slots', 'contextMenus', 'uiWorkspace', 'sessions'],
      apply(ctx) {
        bindServices(ctx.uiWorkspace, ctx.sessions)
        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = 'dsh-workspace-move'
          tag.dataset.version = VERSION
          tag.textContent = STYLE_TEXT
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'dsh-workspace-move: styles')

        registerSessionMenus(ctx)
        ctx.slots.inject('shell.overlay', () => ctx.slots.register(
          { name: 'shell.overlay', id: 'dsh-workspace-move.dialog' },
          MoveOverlay,
        ))
        ctx.slots.inject('sidebar.session.row.trailing', () => ctx.slots.register(
          { name: 'sidebar.session.row.trailing', id: 'dsh-workspace-move.pending', order: 60 },
          MoveBadge,
        ))
        ctx.effect(() => installDragMove(), 'dsh-workspace-move: cross-workspace drag')
        void refreshPending()
      },
    }
  },
})
