// DSH 왼쪽 목록의 대화를 다른 작업공간으로 옮기는 화면 쪽 번들.
// lib/client.js는 scripts/build.mjs가 이 파일과 src/client/*.js, src/style.css로 만든다. 직접 고치지 않는다.
window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-workspace-move',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef } = React
    const VERSION = "0.1.0"
    const STYLE_TEXT = "/* 작업공간 대화 옮기기. 색은 DSH 테마 토큰만 쓰고, 어두운 테마도 그대로 따라간다. */\n.dwm-backdrop {\n  position: fixed;\n  inset: 0;\n  z-index: 60;\n  display: grid;\n  place-items: center;\n  padding: 16px;\n  background: rgb(0 0 0 / 38%);\n  pointer-events: auto;\n}\n\n.dwm-dialog {\n  width: min(440px, 100%);\n  max-height: min(84vh, 680px);\n  overflow: auto;\n  padding: 20px;\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 14px;\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  box-shadow: 0 24px 60px rgb(0 0 0 / 32%);\n  word-break: keep-all;\n}\n\n.dwm-dialog:focus {\n  outline: none;\n}\n\n.dwm-title {\n  margin: 0 0 6px;\n  font-size: 17px;\n  font-weight: 650;\n  line-height: 1.4;\n}\n\n.dwm-desc,\n.dwm-current,\n.dwm-note,\n.dwm-hint {\n  margin: 0;\n  font-size: 13px;\n  line-height: 1.55;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dwm-desc {\n  margin-bottom: 4px;\n  color: var(--dsw-alias-label-primary);\n}\n\n.dwm-current {\n  margin-bottom: 14px;\n}\n\n.dwm-note {\n  margin-top: 10px;\n}\n\n.dwm-hint {\n  margin-top: 4px;\n}\n\n.dwm-list {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  max-height: 44vh;\n  overflow: auto;\n  margin: 4px 0 0;\n  padding: 2px;\n}\n\n.dwm-option {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  min-height: 44px;\n  padding: 8px 10px;\n  border-radius: 8px;\n  cursor: pointer;\n}\n\n.dwm-option:hover {\n  background: var(--dsw-alias-bg-layer-2);\n}\n\n.dwm-option input {\n  flex: none;\n  width: 16px;\n  height: 16px;\n  margin: 0;\n  accent-color: var(--dsw-alias-brand-primary);\n}\n\n.dwm-option-text {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n  gap: 2px;\n}\n\n.dwm-option-title {\n  font-size: 14px;\n  line-height: 1.4;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.dwm-option-path {\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.dwm-warning,\n.dwm-error {\n  margin-top: 12px;\n  padding: 10px 12px;\n  border-radius: 8px;\n  font-size: 13px;\n  line-height: 1.55;\n}\n\n.dwm-warning {\n  border: 1px solid var(--dsw-alias-state-warn-primary);\n  color: var(--dsw-alias-label-primary);\n  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);\n}\n\n.dwm-error {\n  border: 1px solid var(--dsw-alias-state-error-primary);\n  color: var(--dsw-alias-label-primary);\n  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);\n}\n\n.dwm-status {\n  margin: 12px 0 0;\n  font-size: 13px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dwm-done {\n  margin: 12px 0 0;\n  font-size: 14px;\n  line-height: 1.55;\n}\n\n.dwm-actions {\n  display: flex;\n  justify-content: flex-end;\n  gap: 8px;\n  margin-top: 18px;\n}\n\n.dwm-button {\n  min-height: 34px;\n  padding: 6px 14px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 13px;\n  cursor: pointer;\n}\n\n.dwm-button:hover:not([disabled]) {\n  background: var(--dsw-alias-bg-layer-2);\n}\n\n.dwm-button:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 2px;\n}\n\n.dwm-button[disabled] {\n  opacity: 0.5;\n  cursor: default;\n}\n\n.dwm-primary {\n  border-color: var(--dsw-alias-brand-primary);\n  background: var(--dsw-alias-brand-primary);\n  color: #fff;\n}\n\n.dwm-primary:hover:not([disabled]) {\n  background: var(--dsw-alias-brand-primary);\n  filter: brightness(1.06);\n}\n\n@media (pointer: coarse) {\n  .dwm-button {\n    min-height: 44px;\n    font-size: 14px;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .dwm-primary:hover:not([disabled]) {\n    filter: none;\n  }\n}\n\n.dwm-error-text {\n  display: block;\n}\n\n.dwm-code {\n  display: inline-block;\n  margin-top: 6px;\n  padding: 1px 6px;\n  border-radius: 4px;\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-secondary);\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: 11px;\n}\n\n/* 다른 작업공간 줄 위로 끌고 왔을 때의 표시. React가 className을 다시 그려도 남도록 data 속성을 쓴다. */\n[data-dwm-drop=\"1\"] {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: -2px;\n  border-radius: 8px;\n  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);\n}\n\n.dwm-toast {\n  position: fixed;\n  left: 50%;\n  bottom: 28px;\n  z-index: 80;\n  max-width: min(520px, calc(100vw - 32px));\n  padding: 10px 14px;\n  transform: translateX(-50%);\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 10px;\n  background: var(--dsw-alias-bg-overlay);\n  color: var(--dsw-alias-label-primary);\n  box-shadow: 0 12px 32px rgb(0 0 0 / 26%);\n  font-size: 13px;\n  line-height: 1.5;\n  word-break: keep-all;\n  pointer-events: auto;\n}\n\n.dwm-toast-success {\n  border-color: var(--dsw-alias-state-success-primary);\n}\n\n.dwm-toast-error {\n  border-color: var(--dsw-alias-state-error-primary);\n}\n\n.dwm-toast-progress {\n  border-color: var(--dsw-alias-brand-primary);\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* 다음 시작 때 이동할 예약 표시. 세션 줄 끝에 작게 붙는다. */\n.dwm-badge {\n  display: inline-flex;\n  align-items: center;\n  max-width: 96px;\n  margin-left: 4px;\n  padding: 0 5px;\n  border: 1px solid var(--dsw-alias-brand-primary);\n  border-radius: 4px;\n  color: var(--dsw-alias-brand-primary);\n  font-size: 10px;\n  line-height: 16px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n/* 삭제는 되돌리기 어려운 동작이라 버튼을 경고색으로 둔다. */\n.dwm-danger {\n  border-color: var(--dsw-alias-state-error-primary);\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.dwm-danger:hover:not([disabled]) {\n  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);\n}"

    function createRequestStore() {
      let request = null
      const listeners = new Set()
      return {
        get: () => request,
        set(next) {
          request = next
          for (const listener of [...listeners]) listener()
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      }
    }
    
    const moveRequest = createRequestStore()
    
    const TEXT = {
      menu: '작업공간 이동',
      deleteMenu: '세션 삭제',
      deleteTitle: '세션 삭제',
      deleteDesc: title => `‘${title}’ 세션을 삭제할까요?`,
      deleteWarn: '기록이 휴지통으로 이동하고 목록에서 사라져요. 세션 보관과 달리 되돌리기 버튼은 없어요. 지금 열려 있는 세션이라면 목록에서는 바로 숨기고, 열려 있는 화면은 앱을 다시 켤 때 사라져요.',
      deleteAction: '삭제',
      deleting: '삭제하는 중…',
      deletedDone: '세션을 삭제했어요. 기록은 휴지통으로 옮겼어요.',
      title: '작업공간 이동',
      desc: title => (title === '' ? '옮길 작업공간을 골라 주세요.' : `‘${title}’ 대화를 옮길 작업공간을 골라 주세요.`),
      unnamed: '이름 없는 대화',
      currentNone: '지금은 어느 작업공간에도 속해 있지 않아요.',
      current: name => `지금 작업공간: ${name}`,
      loading: '확인하는 중…',
      empty: '옮길 다른 작업공간이 없어요. 먼저 작업공간을 하나 더 만들어 주세요.',
      noteDirectory: '작업 폴더를 바꾼 기록이 있는 대화는 옮긴 뒤 작업 폴더도 대상 작업공간으로 맞춰요.',
      move: '옮기기',
      queueNote: '이 대화는 이번 실행에서 한 번 열려서, DSH가 앱이 끝날 때까지 기록 파일을 잡고 있어요. 지금 쓰고 있지 않아도 마찬가지예요. “다시 켜고 그대로 이동”을 누르면 앱을 껐다 켤 때 같은 세션 id로 자동으로 옮겨집니다.',
      queueAction: '다시 켜고 그대로 이동',
      queuedDone: workspace => `‘${workspace}’ 작업공간으로 이동을 예약했어요.`,
      queuedTarget: workspace => `옮길 작업공간: ${workspace}`,
      queuedHint: 'DeepSeek Harness를 ⌘Q로 완전히 끈 뒤 다시 열면 자동으로 옮겨집니다. 세션 id와 기록은 그대로, 원본은 남지 않아요.',
      cancelQueued: '예약 취소',
      cancelledQueued: '이동 예약을 취소했어요.',
      resultDesc: '요청한 이동의 결과예요.',
      moveNote: '이 대화는 그대로 이동해요. 세션 id와 기록이 유지되고 원본 로그는 지워져요.',
      moving: '옮기는 중…',
      cancel: '취소',
      close: '닫기',
      confirm: '확인',
      undo: '되돌리기',
      undoing: '되돌리는 중…',
      done: workspace => `‘${workspace}’ 작업공간에 옮겼어요.`,
      undone: workspace => `‘${workspace}’ 작업공간에 되돌렸어요.`,
      doneHint: '대화 기록과 제목은 그대로예요.',
      openMoved: '옮긴 대화 열기',
      staleHost: '앱 화면만 새 코드이고 앱 서버는 예전 코드예요. DeepSeek Harness를 ⌘Q로 완전히 끈 뒤 다시 열어 주세요.',
      errorCode: code => `오류 코드: ${code}`,
      failedTitle: '옮기지 못했어요',
      retry: '다시 시도',
      targetLabel: '옮길 작업공간',
    }
    
    const ERRORS = {
      'session-open': '이 대화는 열려 있어요. … 메뉴에서 “다시 켜고 그대로 이동”을 골라 주세요.',
      'session-subagent': '하위 에이전트 대화는 옮길 수 없어요.',
      'same-workspace': '이미 그 작업공간에 있어요.',
      'workspace-not-found': '그 작업공간을 찾지 못했어요. 앱을 다시 시작한 뒤 시도해 주세요.',
      'workspace-missing-dir': '대상 작업공간의 폴더가 없어요. 폴더를 확인해 주세요.',
      'too-large': '대화 기록이 너무 커서 옮길 수 없어요.',
      'recovery-required': '이전 이동이 끝나지 않았어요. 앱을 다시 시작한 뒤 시도해 주세요.',
      'storage-failed': '대화 기록을 옮기지 못했어요. 원래 상태로 되돌렸어요.',
      'registry-failed': '대화는 옮겼지만 목록을 갱신하지 못했어요. 앱을 다시 시작해 주세요.',
      'bad-request': '요청을 처리하지 못했어요.',
      unauthorized: '이 창에서 옮길 권한을 확인하지 못했어요. 앱을 새로 고친 뒤 시도해 주세요.',
      network: '앱과 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    }
    
    function errorText(error) {
      const code = error && typeof error === 'object' ? error.code : undefined
      if (typeof code === 'string' && Object.hasOwn(ERRORS, code)) return ERRORS[code]
      return '옮기지 못했어요. 잠시 뒤 다시 시도해 주세요.'
    }
    
    let services = { uiWorkspace: null, sessions: null }
    
    function bindServices(uiWorkspace, sessions) {
      services = { uiWorkspace, sessions }
    }
    
    function openSessionById(sessionId) {
      try {
        services.uiWorkspace?.openSession(sessionId)
        return true
      } catch {
        return false
      }
    }
    
    async function refreshSessions() {
      try {
        await services.sessions?.refresh()
      } catch {
        // 목록 새로 고침 실패는 삭제 결과를 되돌리지 않는다.
      }
    }
    
    class MoveFailure extends Error {
      constructor(code, message) {
        super(message)
        this.name = 'MoveFailure'
        this.code = code
      }
    }
    
    async function moveApi(body, signal) {
      let response
      try {
        response = await fetch('/api/workspace-move', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          credentials: 'same-origin',
          cache: 'no-store',
          signal,
        })
      } catch (error) {
        if (error && error.name === 'AbortError') throw error
        throw new MoveFailure('network', 'network')
      }
      if (response.status === 401 || response.status === 403) throw new MoveFailure('unauthorized', 'unauthorized')
      let payload
      try {
        payload = await response.json()
      } catch {
        throw new MoveFailure('network', 'bad response')
      }
      if (payload === null || typeof payload !== 'object' || payload.ok !== true) {
        const failure = payload && typeof payload === 'object' ? payload.error : undefined
        throw new MoveFailure(failure?.code ?? 'failed', failure?.message ?? 'failed')
      }
      return payload.value
    }
    
    /** 호스트가 로그를 놓는 데 잠깐 걸릴 수 있어, session-open일 때만 몇 번 더 시도한다. */
    async function moveWithRetry(body, options = {}) {
      const attempts = options.attempts ?? 10
      const waitMs = options.waitMs ?? 300
      let last
      for (let index = 0; index < attempts; index += 1) {
        try {
          return await moveApi(body)
        } catch (failure) {
          last = failure
          if (failure?.code !== 'session-open') throw failure
          await new Promise(resolve => setTimeout(resolve, waitMs))
        }
      }
      throw last
    }
    
    function targetWorkspaces(items, sourceWorkspaceId) {
      return items.filter(item => item.workspaceId !== sourceWorkspaceId)
    }
    
    function duplicateTitles(items) {
      const counts = new Map()
      for (const item of items) counts.set(item.title, (counts.get(item.title) ?? 0) + 1)
      return new Set([...counts].filter(([, count]) => count > 1).map(([title]) => title))
    }
    
    function trailingSegments(targetPath) {
      return String(targetPath).split('/').filter(segment => segment.length > 0)
    }
    
    function pathSuffix(item, others) {
      const mine = trailingSegments(item.path)
      for (let count = 1; count <= mine.length; count += 1) {
        const tail = mine.slice(-count).join('/')
        const clash = others.some(other => {
          if (other.workspaceId === item.workspaceId) return false
          const segments = trailingSegments(other.path)
          return count <= segments.length && segments.slice(-count).join('/') === tail
        })
        if (!clash) return tail
      }
      return mine.join('/')
    }
    
    function targetRows(items, sourceWorkspaceId) {
      const targets = targetWorkspaces(items, sourceWorkspaceId)
      const duplicated = duplicateTitles(targets)
      return targets.map(item => ({
        id: item.workspaceId,
        title: item.title,
        path: item.path,
        suffix: duplicated.has(item.title) ? pathSuffix(item, targets) : '',
      }))
    }
    
    function createToastStore() {
      let toast = null
      const listeners = new Set()
      return {
        get: () => toast,
        set(next) {
          toast = next
          for (const listener of [...listeners]) listener()
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      }
    }
    
    const toastStore = createToastStore()
    let toastSeq = 0
    
    function showToast(text, tone = 'info', ms = 5000) {
      const toast = { id: (toastSeq += 1), text, tone }
      toastStore.set(toast)
      if (ms > 0) {
        setTimeout(() => {
          if (toastStore.get()?.id === toast.id) toastStore.set(null)
        }, ms)
      }
      return toast.id
    }
    
    function MoveToast() {
      const toast = React.useSyncExternalStore(toastStore.subscribe, toastStore.get, toastStore.get)
      if (toast === null) return null
      return h('div', {
        className: `dwm-toast dwm-toast-${toast.tone}`,
        role: toast.tone === 'error' ? 'alert' : 'status',
      }, toast.text)
    }
    
    function createPendingStore() {
      let byId = {}
      const listeners = new Set()
      return {
        get: () => byId,
        set(next) {
          byId = next
          for (const listener of [...listeners]) listener()
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      }
    }
    
    const pendingStore = createPendingStore()
    
    let deleteCapability = false
    const capabilityListeners = new Set()
    
    function applyPendingStatus(value) {
      const next = {}
      for (const entry of value.pending ?? []) next[entry.sessionId] = entry.targetTitle
      pendingStore.set(next)
      const nextCapability = value.capabilities?.delete === true
      if (nextCapability !== deleteCapability) {
        deleteCapability = nextCapability
        for (const listener of [...capabilityListeners]) listener()
      }
      return value.completed ?? []
    }
    
    function deleteAvailable() {
      return deleteCapability
    }
    
    function subscribeDeleteCapability(listener) {
      capabilityListeners.add(listener)
      return () => { capabilityListeners.delete(listener) }
    }
    
    async function refreshPending() {
      try {
        const value = await moveApi({ action: 'pending' })
        const completed = applyPendingStatus(value)
        if (completed.length > 0) {
          for (const entry of completed) {
            showToast(`‘${entry.targetTitle}’ 작업공간으로 이동을 마쳤어요.`, 'success', 9000)
          }
          await moveApi({ action: 'ack', ids: completed.map(entry => entry.sessionId) }).catch(() => {})
        }
      } catch {
        // 예전 Host이거나 잠깐 실패한 경우. 배지 없이 나머지 기능은 그대로 동작한다.
      }
    }
    
    function usePendingTarget(sessionId) {
      return React.useSyncExternalStore(
        pendingStore.subscribe,
        () => pendingStore.get()[sessionId] ?? null,
        () => null,
      )
    }
    
    function MoveBadge({ sessionId }) {
      const target = usePendingTarget(sessionId)
      if (target === null || target === undefined) return null
      const label = `다음 시작 때 ${target} 작업공간으로 이동 예약됨`
      return h('span', {
        className: 'dwm-badge',
        title: label,
        role: 'img',
        'aria-label': label,
      }, `→ ${target}`)
    }
    
    function createDeleteRequestStore() {
      let request = null
      const listeners = new Set()
      return {
        get: () => request,
        set(next) {
          request = next
          for (const listener of [...listeners]) listener()
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      }
    }
    
    const deleteRequest = createDeleteRequestStore()
    
    function parseRowKey(key) {
      if (typeof key !== 'string') return { kind: 'other' }
      if (key === 'empty') return { kind: 'empty' }
      if (key.startsWith('workspace:')) return { kind: 'workspace', group: key.slice('workspace:'.length) }
      if (key.startsWith('session:')) return { kind: 'session', id: key.slice('session:'.length) }
      if (key.startsWith('overflow:')) return { kind: 'overflow', group: key.slice('overflow:'.length) }
      return { kind: 'other' }
    }
    
    /** 행 키 목록에서 각 행이 속한 작업공간(그룹)을 문서 순서대로 계산한다. */
    function groupMapOf(keys) {
      let group = null
      const map = new Map()
      for (const key of keys) {
        const parsed = parseRowKey(key)
        if (parsed.kind === 'workspace') group = parsed.group
        map.set(key, group)
      }
      return map
    }
    
    /** 지금 가리키는 행이 옮겨도 되는 다른 작업공간이면 그 id를, 아니면 null을 돌려준다. */
    function dropTargetFor(key, sourceGroup, groups) {
      const parsed = parseRowKey(key)
      let group = null
      if (parsed.kind === 'workspace') group = parsed.group
      else if (parsed.kind === 'session' || parsed.kind === 'overflow') group = groups?.get(key) ?? null
      if (group === null || group === undefined || group === '' || group === sourceGroup) return null
      return group
    }
    
    let currentDrag = null
    
    function installDragMove() {
      const onDragStart = event => {
        const row = event.target instanceof Element ? event.target.closest('[data-row-key^="session:"]') : null
        if (row === null) return
        const id = parseRowKey(row.getAttribute('data-row-key')).id
        if (typeof id !== 'string' || id.length === 0) return
        const scope = row.closest('[role="tree"]') ?? document
        const rows = [...scope.querySelectorAll('[data-row-key]')]
        const groups = new Map()
        const headers = new Map()
        let group = null
        for (const element of rows) {
          const key = element.getAttribute('data-row-key') ?? ''
          const parsed = parseRowKey(key)
          if (parsed.kind === 'workspace') {
            group = parsed.group
            headers.set(parsed.group, element)
          }
          groups.set(element, group)
        }
        currentDrag = {
          sessionId: id,
          sourceGroup: groups.get(row) ?? null,
          groups,
          headers,
          target: null,
          header: null,
        }
      }
    
      const onDragOver = event => {
        if (currentDrag === null) return
        const element = event.target instanceof Element ? event.target.closest('[data-row-key]') : null
        const target = element === null ? null : dropTargetFor(element.getAttribute('data-row-key'), currentDrag.sourceGroup, currentDrag.groups)
        if (target === null) {
          clearDropTarget()
          return
        }
        event.preventDefault()
        if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
        if (currentDrag.target === target) return
        clearDropTarget()
        currentDrag.target = target
        const header = currentDrag.headers.get(target)
        if (header !== undefined) {
          header.dataset.dwmDrop = '1'
          currentDrag.header = header
        }
      }
    
      const onDrop = event => {
        if (currentDrag === null || currentDrag.target === null) return
        const { sessionId, target } = currentDrag
        event.preventDefault()
        event.stopPropagation()
        endDrag()
        void moveByDrop(sessionId, target)
      }
    
      const onDragEnd = () => { endDrag() }
    
      function clearDropTarget() {
        if (currentDrag?.header != null) delete currentDrag.header.dataset.dwmDrop
        if (currentDrag !== null) {
          currentDrag.target = null
          currentDrag.header = null
        }
      }
    
      function endDrag() {
        clearDropTarget()
        currentDrag = null
      }
    
      document.addEventListener('dragstart', onDragStart, true)
      document.addEventListener('dragover', onDragOver, true)
      document.addEventListener('drop', onDrop, true)
      document.addEventListener('dragend', onDragEnd, true)
      return () => {
        document.removeEventListener('dragstart', onDragStart, true)
        document.removeEventListener('dragover', onDragOver, true)
        document.removeEventListener('drop', onDrop, true)
        document.removeEventListener('dragend', onDragEnd, true)
        endDrag()
      }
    }
    
    async function moveByDrop(sessionId, targetWorkspaceId) {
      try {
        // 열린 대화는 바로 옮길 수 없다. 메뉴로 보내지 않고, 대상 작업공간을 미리 고른 확인 창을 연다.
        const info = await moveApi({ action: 'preflight', sessionId })
        if (info.blocked !== null && info.blocked !== undefined) {
          showToast(errorText(info.blocked), 'error', 8000)
          return
        }
        if (info.open === true) {
          moveRequest.set({ sessionId, title: '', targetWorkspaceId })
          return
        }
        showToast('옮기는 중…', 'progress', 0)
        await moveWithRetry({ action: 'move', sessionId, targetWorkspaceId })
        void refreshPending()
        showToast('다른 작업공간으로 옮겼어요.', 'success', 7000)
      } catch (failure) {
        showToast(errorText(failure), 'error', 8000)
      }
    }
    
    function cssEscape(value) {
      if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(String(value))
      return String(value).replace(/["\\]/g, '\\$&')
    }
    
    function focusRowBack(sessionId) {
      try {
        const row = document.querySelector(`[data-row-key="session:${cssEscape(sessionId)}"]`)
        if (row !== null && typeof row.focus === 'function') row.focus({ preventScroll: true })
      } catch {
        // 줄을 못 찾으면 포커스만 포기한다. 옮긴 결과에는 영향이 없다.
      }
    }
    
    const DELETE_ICON_KEY = 'workspace.delete'
    const MOVE_ICON_KEY = 'dsh-workspace-move.folder-move'
    
    function FolderMoveIcon() {
      const line = { stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' }
      return h('svg', {
        width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', strokeWidth: 1,
        'aria-hidden': 'true', 'data-icon': 'dsh-workspace-move-folder-move',
      },
      h('path', {
        d: 'M1.50439 3.11059C1.50439 2.55831 1.95211 2.1106 2.50439 2.1106H5.43389C5.67773 2.1106 5.91318 2.19969 6.09593 2.36113L7.71649 3.79265C7.89924 3.95409 8.1347 4.04319 8.3785 4.04319H13.4958C14.0481 4.04319 14.4958 4.4909 14.4958 5.04319V12.8894C14.4958 13.4417 14.0481 13.8894 13.4958 13.8894H2.50439C1.95211 13.8894 1.50439 13.4417 1.50439 12.8894V4.04319V3.11059Z',
        stroke: 'currentColor',
      }),
      h('path', { d: 'M4.6 8.95H11.1', ...line }),
      h('path', { d: 'M8.85 6.7L11.1 8.95L8.85 11.2', ...line }))
    }
    
    const deleteCapabilitySource = {
      subscribe: listener => subscribeDeleteCapability(listener),
      getSnapshot: () => deleteAvailable(),
    }
    
    function moveMenuAction({ sessionId, displayTitle }) {
      return {
        id: 'move', label: TEXT.menu, icon: { key: MOVE_ICON_KEY },
        run: () => { moveRequest.set({ sessionId, title: displayTitle || TEXT.unnamed }) },
      }
    }
    
    function deleteMenuAction({ sessionId, displayTitle }) {
      return {
        id: 'delete', label: TEXT.deleteMenu, icon: { key: DELETE_ICON_KEY }, danger: true, afterContent: true,
        run: () => { deleteRequest.set({ sessionId, title: displayTitle || TEXT.unnamed }) },
      }
    }
    
    function registerSessionMenus(ctx) {
      ctx.slots.inject('contextMenu.icon', () => ctx.slots.register(
        { name: 'contextMenu.icon', key: MOVE_ICON_KEY },
        FolderMoveIcon,
      ))
      ctx.effect(() => ctx.contextMenus.register({
        id: 'dsh-workspace-move.move', target: 'session', order: 550,
        resolve: target => [moveMenuAction(target)],
      }), 'dsh-workspace-move: move menu')
      ctx.effect(() => ctx.contextMenus.register({
        id: 'dsh-workspace-move.delete', target: 'session', order: 650,
        observe: () => [deleteCapabilitySource],
        resolve: target => (deleteAvailable() ? [deleteMenuAction(target)] : []),
      }), 'dsh-workspace-move: delete menu')
    }
    
    function MoveDialog({ useWorkspaces }) {
      const request = React.useSyncExternalStore(moveRequest.subscribe, moveRequest.get, moveRequest.get)
      if (request === null) return null
      return h(MoveDialogBody, { key: request.sessionId, request, useWorkspaces })
    }
    
    function MoveDialogBody({ request, useWorkspaces }) {
      const workspaces = useWorkspaces(state => state.items)
      const dialogRef = useRef(null)
      const [attempt, setAttempt] = useState(0)
      const [phase, setPhase] = useState('loading')
      const [info, setInfo] = useState(null)
      const [selected, setSelected] = useState('')
      const [error, setError] = useState(null)
      const [result, setResult] = useState(null)
    
      const sourceWorkspaceId = info === null ? null : info.sourceWorkspaceId
      const sourceTitle = workspaces.find(workspace => workspace.workspaceId === sourceWorkspaceId)?.title ?? null
      const rows = targetRows(workspaces, sourceWorkspaceId)
      const blocked = info === null ? null : info.blocked
      const canQueue = info !== null && info.open === true && info.queue === true && info.trueMove === true
      const staleHost = info !== null && (info.hostRevision === undefined || info.hostRevision === null)
      const listVisible = blocked === null && !staleHost
      const moving = phase === 'moving'
    
      useEffect(() => {
        let alive = true
        const controller = new AbortController()
        moveApi({ action: 'preflight', sessionId: request.sessionId }, controller.signal)
          .then(value => {
            if (!alive) return
            setInfo(value)
            setPhase('ready')
          })
          .catch(failure => {
            if (!alive || failure?.name === 'AbortError') return
            setError(failure)
            setPhase('error')
          })
        return () => { alive = false; controller.abort() }
      }, [request.sessionId, attempt])
    
      useEffect(() => {
        const node = dialogRef.current
        if (node !== null && typeof node.focus === 'function') node.focus({ preventScroll: true })
      }, [])
    
      useEffect(() => {
        if (phase !== 'ready' || selected !== '' || rows.length === 0) return
        const wanted = request.targetWorkspaceId
        setSelected(rows.some(row => row.id === wanted) ? wanted : rows[0].id)
      }, [phase, selected, rows.length, request.targetWorkspaceId])
    
      const close = () => {
        if (moving) return
        moveRequest.set(null)
        focusRowBack(request.sessionId)
      }
    
      const retryPreflight = () => {
        setInfo(null)
        setSelected('')
        setError(null)
        setPhase('loading')
        setAttempt(value => value + 1)
      }
    
      const run = async () => {
        if (selected === '' || moving || blocked !== null) return
        setPhase('moving')
        setError(null)
        try {
          const value = await moveWithRetry({ action: 'move', sessionId: request.sessionId, targetWorkspaceId: selected })
          const workspaceTitle = rows.find(row => row.id === selected)?.title ?? value.toWorkspaceId
          setResult({ kind: 'done', workspaceTitle, openId: request.sessionId, reopened: false })
          setPhase('done')
        } catch (failure) {
          setError(failure)
          setPhase('ready')
        }
      }
    
      const queueRun = async () => {
        if (selected === '' || moving || blocked !== null) return
        setPhase('moving')
        setError(null)
        try {
          await moveWithRetry({ action: 'queue', sessionId: request.sessionId, targetWorkspaceId: selected })
          void refreshPending()
          const workspaceTitle = rows.find(row => row.id === selected)?.title ?? selected
          setResult({ kind: 'queued', workspaceTitle })
          setPhase('queued')
        } catch (failure) {
          setError(failure)
          setPhase('ready')
        }
      }
    
      const cancelQueue = async () => {
        if (moving) return
        setPhase('moving')
        setError(null)
        try {
          await moveApi({ action: 'cancel', sessionId: request.sessionId })
          void refreshPending()
          setResult({ kind: 'cancelled' })
          setPhase('cancelled')
        } catch (failure) {
          setError(failure)
          setPhase('queued')
        }
      }
    
      const undo = async () => {
        if (sourceWorkspaceId === null || moving) return
        setPhase('moving')
        setError(null)
        try {
          await moveWithRetry({ action: 'move', sessionId: request.sessionId, targetWorkspaceId: sourceWorkspaceId })
          setResult({ kind: 'undone', workspaceTitle: sourceTitle ?? sourceWorkspaceId })
          setPhase('undone')
        } catch (failure) {
          setError(failure)
          setPhase('done')
        }
      }
    
      const openMoved = () => {
        const id = result?.openId ?? request.sessionId
        moveRequest.set(null)
        openSessionById(id)
      }
    
      const onKeyDown = event => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          close()
          return
        }
        if (event.key !== 'Tab') return
        const node = dialogRef.current
        if (node === null) return
        const focusable = [...node.querySelectorAll('button:not([disabled]), input:not([disabled])')]
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    
      const warning = message => h('div', { className: 'dwm-warning', role: 'alert' }, message)
      const errorBox = (message, code) => h('div', { className: 'dwm-error', role: 'alert' },
        h('span', { className: 'dwm-error-text' }, message),
        typeof code === 'string' && code !== '' ? h('span', { className: 'dwm-code' }, TEXT.errorCode(code)) : null)
    
      let body
      if (phase === 'loading') {
        body = h('p', { className: 'dwm-status', role: 'status' }, TEXT.loading)
      } else if (phase === 'error') {
        body = h(React.Fragment, null,
          errorBox(errorText(error), error?.code),
          h('div', { className: 'dwm-actions' },
            h('button', { type: 'button', className: 'dwm-button', onClick: close }, TEXT.confirm),
            h('button', { type: 'button', className: 'dwm-button dwm-primary', onClick: retryPreflight }, TEXT.retry)
          )
        )
      } else if (phase === 'queued') {
        body = h(React.Fragment, null,
          h('p', { className: 'dwm-done', role: 'status' }, TEXT.queuedDone(result.workspaceTitle)),
          h('p', { className: 'dwm-current' }, TEXT.queuedTarget(result.workspaceTitle)),
          h('p', { className: 'dwm-hint' }, TEXT.queuedHint),
          error !== null ? errorBox(errorText(error), error.code) : null,
          h('div', { className: 'dwm-actions' },
            h('button', { type: 'button', className: 'dwm-button', disabled: moving, onClick: close }, TEXT.confirm),
            info !== null && info.cancel === true && !moving
              ? h('button', { type: 'button', className: 'dwm-button', onClick: cancelQueue }, TEXT.cancelQueued)
              : null
          )
        )
      } else if (phase === 'cancelled') {
        body = h(React.Fragment, null,
          h('p', { className: 'dwm-done', role: 'status' }, TEXT.cancelledQueued),
          h('div', { className: 'dwm-actions' },
            h('button', { type: 'button', className: 'dwm-button dwm-primary', onClick: close }, TEXT.confirm)
          )
        )
      } else if (phase === 'done' || phase === 'undone') {
        body = h(React.Fragment, null,
          h('p', { className: 'dwm-done', role: 'status' }, result.kind === 'undone'
            ? TEXT.undone(result.workspaceTitle)
            : TEXT.done(result.workspaceTitle)),
          h('p', { className: 'dwm-hint' }, TEXT.doneHint),
          error !== null ? errorBox(errorText(error), error.code) : null,
          h('div', { className: 'dwm-actions' },
            h('button', { type: 'button', className: 'dwm-button', onClick: close }, TEXT.confirm),
            result.kind === 'done' && sourceWorkspaceId !== null
              ? h('button', { type: 'button', className: 'dwm-button', disabled: moving, onClick: undo },
                moving ? TEXT.undoing : TEXT.undo)
              : null,
            result.kind === 'done' && result.reopened !== true
              ? h('button', { type: 'button', className: 'dwm-button dwm-primary', onClick: openMoved }, TEXT.openMoved)
              : null
          )
        )
      } else {
        body = h(React.Fragment, null,
          staleHost ? warning(TEXT.staleHost) : blocked !== null ? errorBox(errorText(blocked), blocked.code) : null,
          !staleHost && blocked === null
            ? canQueue ? warning(TEXT.queueNote) : h('p', { className: 'dwm-note' }, TEXT.moveNote)
            : null,
          listVisible && rows.length === 0 ? warning(TEXT.empty) : null,
          listVisible && rows.length > 0
            ? h('div', { className: 'dwm-list', role: 'radiogroup', 'aria-label': TEXT.targetLabel },
              rows.map(row => h('label', { key: row.id, className: 'dwm-option' },
                h('input', {
                  type: 'radio',
                  name: `dwm-target-${request.sessionId}`,
                  value: row.id,
                  checked: selected === row.id,
                  disabled: moving,
                  onChange: () => setSelected(row.id),
                }),
                h('span', { className: 'dwm-option-text' },
                  h('span', { className: 'dwm-option-title' }, row.title),
                  row.suffix !== '' ? h('span', { className: 'dwm-option-path' }, row.suffix) : null
                )
              ))
            )
            : null,
          h('p', { className: 'dwm-note' }, TEXT.noteDirectory),
          error !== null ? errorBox(errorText(error), error.code) : null,
          moving ? h('p', { className: 'dwm-status', role: 'status' }, TEXT.moving) : null,
          h('div', { className: 'dwm-actions' },
            h('button', { type: 'button', className: 'dwm-button', disabled: moving, onClick: close }, TEXT.cancel),
            moving || staleHost ? null : canQueue
              ? h('button', {
                type: 'button',
                className: 'dwm-button dwm-primary',
                disabled: selected === '' || blocked !== null,
                onClick: queueRun,
              }, TEXT.queueAction)
              : h('button', {
                type: 'button',
                className: 'dwm-button dwm-primary',
                disabled: selected === '' || blocked !== null,
                onClick: run,
              }, TEXT.move)
          )
        )
      }
    
      return h('div', {
        className: 'dwm-backdrop',
        onMouseDown: event => { if (event.target === event.currentTarget) close() },
      }, h('div', {
        className: 'dwm-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'dwm-title',
        'aria-describedby': 'dwm-desc',
        tabIndex: -1,
        ref: dialogRef,
        onKeyDown,
      },
      h('h2', { className: 'dwm-title', id: 'dwm-title' }, TEXT.title),
      h('p', { className: 'dwm-desc', id: 'dwm-desc' }, phase === 'ready' || phase === 'loading' || phase === 'error' || phase === 'moving'
        ? TEXT.desc(request.title)
        : TEXT.resultDesc),
      h('p', { className: 'dwm-current' }, sourceTitle === null ? TEXT.currentNone : TEXT.current(sourceTitle)),
      body
      ))
    }
    
    function DeleteDialog() {
      const request = React.useSyncExternalStore(deleteRequest.subscribe, deleteRequest.get, deleteRequest.get)
      if (request === null) return null
      return h(DeleteDialogBody, { key: request.sessionId, request })
    }
    
    function DeleteDialogBody({ request }) {
      const dialogRef = useRef(null)
      const [phase, setPhase] = useState('ready')
      const [error, setError] = useState(null)
      const busy = phase === 'deleting'
    
      useEffect(() => {
        const node = dialogRef.current
        if (node !== null && typeof node.focus === 'function') node.focus({ preventScroll: true })
      }, [])
    
      const close = () => {
        if (busy) return
        deleteRequest.set(null)
        focusRowBack(request.sessionId)
      }
    
      const confirm = async () => {
        if (busy) return
        setPhase('deleting')
        setError(null)
        try {
          await moveApi({ action: 'delete', sessionId: request.sessionId })
          await refreshSessions()
          setPhase('done')
        } catch (failure) {
          setError(failure)
          setPhase('ready')
        }
      }
    
      const onKeyDown = event => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          close()
        }
      }
    
      const errorBox = (message, code) => h('div', { className: 'dwm-error', role: 'alert' },
        h('span', { className: 'dwm-error-text' }, message),
        typeof code === 'string' && code !== '' ? h('span', { className: 'dwm-code' }, TEXT.errorCode(code)) : null)
    
      let body
      if (phase === 'done') {
        body = h(React.Fragment, null,
          h('p', { className: 'dwm-done', role: 'status' }, TEXT.deletedDone),
          h('div', { className: 'dwm-actions' },
            h('button', { type: 'button', className: 'dwm-button dwm-primary', onClick: close }, TEXT.confirm)
          )
        )
      } else {
        body = h(React.Fragment, null,
          h('div', { className: 'dwm-warning', role: 'alert' }, TEXT.deleteWarn),
          error !== null ? errorBox(errorText(error), error.code) : null,
          busy ? h('p', { className: 'dwm-status', role: 'status' }, TEXT.deleting) : null,
          h('div', { className: 'dwm-actions' },
            h('button', { type: 'button', className: 'dwm-button', disabled: busy, onClick: close }, TEXT.cancel),
            h('button', { type: 'button', className: 'dwm-button dwm-danger', disabled: busy, onClick: confirm }, TEXT.deleteAction)
          )
        )
      }
    
      return h('div', {
        className: 'dwm-backdrop',
        onMouseDown: event => { if (event.target === event.currentTarget) close() },
      }, h('div', {
        className: 'dwm-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'dwm-delete-title',
        tabIndex: -1,
        ref: dialogRef,
        onKeyDown,
      },
      h('h2', { className: 'dwm-title', id: 'dwm-delete-title' }, TEXT.deleteTitle),
      h('p', { className: 'dwm-desc' }, TEXT.deleteDesc(request.title)),
      body
      ))
    }

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
