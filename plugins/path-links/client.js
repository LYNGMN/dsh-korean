/**
 * Path Links for DSH — browser half.
 *
 * DSH's markdown preview (the file tab in the right sidebar) draws inline code
 * as a bare `<code>`: unlike chat answers it has no file-mention resolver, so an
 * absolute path such as `/Users/me/.agents/skills/x/SKILL.md` cannot be
 * clicked. DSH's own skill wrappers point at the real SKILL.md that way. This
 * module leaves the renderer alone and adds on top of what it drew:
 *
 * - an absolute path to a file becomes a link: click or Enter opens the file in
 *   a sidebar tab (the tab already showing it, when there is one);
 * - a ↗ button after a file path shows the file in Finder; after a folder path
 *   it opens the folder in Finder;
 * - a path that does not exist, a placeholder (`<name>`), a slash command
 *   (`/review`), `~/…`, relative paths and fenced code stay as they are.
 *
 * Whether a path is a file, a folder or nothing is asked of the Host
 * (`remote.workspaceFiles.stat`), which reads outside the workspace too.
 * Labels follow the DSH language setting (`ctx.locale`). React's own nodes are
 * never moved or wrapped; the plugin only adds attributes and its own buttons.
 */
window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-path-links',
  factory() {
    const NS = 'path-links'
    const SCOPE = '[data-document-markdown]'  // the markdown preview body
    const ATTR = 'data-path-link'             // 'file' | 'dir' on a decorated <code>
    const PATH_ATTR = 'data-path-link-path'   // the path that decoration was made for
    const BTN_ATTR = 'data-path-link-reveal'  // the ↗ button after a decorated <code>
    const FAIL_ATTR = 'data-path-link-failed' // briefly marks a link or button that could not open
    const STYLE_ID = 'local-path-links-style'
    const LIVE_ID = 'local-path-links-live'
    const FOUND_TTL = 30000   // ms a found file or folder is trusted
    const MISSING_TTL = 5000  // ms a missing path is trusted
    const FAIL_TIME = 1600    // ms the failure mark stays
    const MAX_PATH = 1024

    const en = {
      open: 'Open this file',
      revealFinder: 'Show in Finder',
      openFolderFinder: 'Open folder in Finder',
      reveal: 'Show in file manager',
      openFolder: 'Open folder in file manager',
      failed: "Couldn't open: {path}"
    }
    const ko = {
      open: '본 문서 열기',
      revealFinder: 'Finder에서 보기',
      openFolderFinder: 'Finder에서 폴더 열기',
      reveal: '파일 관리자에서 보기',
      openFolder: '파일 관리자에서 폴더 열기',
      failed: '열 수 없어요: {path}'
    }
    const zh = {
      open: '打开此文件',
      revealFinder: '在访达中显示',
      openFolderFinder: '在访达中打开文件夹',
      reveal: '在文件管理器中显示',
      openFolder: '在文件管理器中打开文件夹',
      failed: '无法打开：{path}'
    }
    const fill = (template, params) => template.replace(/\{(\w+)\}/g, (m, name) => (params && name in params ? String(params[name]) : m))
    const fallbackT = (key, params) => fill(en[key] ?? key, params)

    // Lucide "square-arrow-out-up-right" (ISC License).
    const ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/><path d="m21 3-9 9"/><path d="M15 3h6v6"/></svg>'

    // DSH's link blue reads 4.1:1 on the light inline-code fill, under the 4.5:1 that
    // small text needs, so light mode takes the next shade of the same palette (5.5:1).
    // Dark mode keeps the link color (6.3:1).
    const LINK = 'var(--dsw-static-deepseek-600,#4868b2)'
    const LINK_DARK = 'var(--dsw-alias-link,#7aaaff)'
    const RING = 'var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,Highlight))'
    // DSH draws inline code as an inline-flex box, so a long path folds inside its own
    // box and the button after it could drop alone to the next line. The path keeps a
    // 26px right margin and the button sits inside it (2px gap) with no width of its
    // own, so the two always stay together, ↗ beside the path's first line.
    const CSS = `
code[${ATTR}=file]{color:${LINK};cursor:pointer}
body[data-ds-dark-theme] code[${ATTR}=file]{color:${LINK_DARK}}
code[${ATTR}=file]:hover,code[${ATTR}=file]:focus-visible{text-decoration:underline dotted currentColor;text-underline-offset:3px}
code[${ATTR}=file]:focus{outline:none}
code[${ATTR}]:has(+[${BTN_ATTR}]){margin-right:26px}
code[${ATTR}=file]:focus-visible{outline:2px solid ${RING};outline-offset:1px}
[${BTN_ATTR}]{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:24px;height:24px;margin:0 0 0 -24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,currentColor);font:inherit;line-height:1;vertical-align:middle;cursor:pointer;user-select:none;-webkit-user-select:none}
[${BTN_ATTR}]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));color:${LINK}}
body[data-ds-dark-theme] [${BTN_ATTR}]:hover{color:${LINK_DARK}}
[${BTN_ATTR}]:focus{outline:none}
[${BTN_ATTR}]:focus-visible{outline:2px solid ${RING};outline-offset:1px}
[${BTN_ATTR}] svg{display:block;flex:none;width:14px;height:14px;pointer-events:none}
[${FAIL_ATTR}]{color:var(--dsw-alias-state-error-primary,#ec1313)!important}
#${LIVE_ID}{position:fixed;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
`

    /**
     * The absolute path a piece of inline code spells, or null.
     * A path needs at least two segments, so slash commands (`/review`) stay out;
     * placeholders (`<name>`), globs and anything spread over lines stay out too.
     */
    function pathCandidate(text) {
      if (typeof text !== 'string') return null
      const value = text.trim()
      if (value.length < 4 || value.length > MAX_PATH) return null
      if (!value.startsWith('/') || value.startsWith('//')) return null
      if (/[\n\r\t<>*?|"`\u0000]/.test(value)) return null
      const path = value.length > 1 ? value.replace(/\/+$/, '') : value
      const segments = path.split('/').slice(1)
      if (segments.length < 2 || segments.some((s) => s === '' || s === '.' || s === '..')) return null
      return path
    }

    // Same address DSH's own file links open (`fileAddressFor` in
    // dsh-util-workspace-path): relative inside the session folder, absolute
    // (a double slash) outside it.
    const encodeSegment = (segment) => encodeURIComponent(segment).replace(/%3A/gi, ':')
    function fileAddress(sessionId, cwd, path) {
      const root = typeof cwd === 'string' ? cwd.replace(/\/+$/, '') : ''
      let rel = path
      if (root !== '' && path === root) rel = ''
      else if (root !== '' && path.startsWith(root + '/')) rel = path.slice(root.length + 1)
      return 'dsh-resource://file/session/' + encodeSegment(sessionId) + '/' + rel.split('/').map(encodeSegment).join('/')
    }

    /**
     * The real location of a folder, learned from a file inside it whose real
     * location the Host already reported. Finder refuses a path that runs through
     * a symlinked folder, and the Host only resolves files.
     * @param {string} dir - folder path as written.
     * @param {Iterable<[string, string]>} files - [written path, real path] of known files.
     */
    function realDirectory(dir, files) {
      for (const [written, real] of files) {
        if (!written.startsWith(dir + '/')) continue
        const rest = written.slice(dir.length)
        if (real.endsWith(rest) && real.length > rest.length) return real.slice(0, real.length - rest.length)
      }
      return dir
    }

    /**
     * Decorate paths in the markdown preview.
     * @param {Window} win
     * @param {object} deps
     * @param {(key: string, params?: object) => string} [deps.t]
     * @param {(fn: () => void) => (() => void)} [deps.subscribe] - language changes
     * @param {() => string | undefined} deps.sessionId - the session on screen
     * @param {(sessionId: string) => string | undefined} deps.cwd
     * @param {(sessionId: string, path: string, signal: AbortSignal) => Promise<{kind: 'file', absolutePath?: string} | {kind: 'dir'} | {kind: 'none'}>} deps.stat
     * @param {(address: string) => unknown} deps.open - open a file address in the sidebar
     * @param {(path: string, action: 'reveal' | 'open') => Promise<boolean>} [deps.reveal]
     * @param {() => Promise<boolean>} [deps.canReveal]
     * @param {() => number} [deps.now]
     * @returns {() => void} cleanup
     */
    function install(win, deps) {
      const doc = win.document
      const t = typeof deps.t === 'function' ? deps.t : fallbackT
      const now = typeof deps.now === 'function' ? deps.now : () => Date.now()
      const isMac = /Mac/i.test(win.navigator?.platform || win.navigator?.userAgent || '')
      const lifetime = new win.AbortController()

      const style = doc.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      doc.head.append(style)
      const live = doc.createElement('div')
      live.id = LIVE_ID
      live.setAttribute('aria-live', 'polite')
      live.setAttribute('role', 'status')
      doc.body.append(live)

      // Host answers, per session and path: { at, value }, or { pending, value? }
      // while one is asked (keeping the last answer, so a link does not blink).
      const cache = new Map()
      const key = (sid, path) => sid + '\u0000' + path
      function lookup(sid, path) {
        const k = key(sid, path)
        const hit = cache.get(k)
        if (hit && (hit.pending || now() - hit.at < (hit.value.kind === 'none' ? MISSING_TTL : FOUND_TTL))) return hit
        const entry = hit?.value ? { pending: true, value: hit.value } : { pending: true }
        cache.set(k, entry)
        Promise.resolve()
          .then(() => deps.stat(sid, path, lifetime.signal))
          .catch(() => ({ kind: 'none' }))
          .then((value) => {
            if (lifetime.signal.aborted) return
            const kind = value && (value.kind === 'file' || value.kind === 'dir') ? value.kind : 'none'
            const absolutePath = kind === 'file' && typeof value.absolutePath === 'string' && value.absolutePath ? value.absolutePath : undefined
            cache.set(k, { at: now(), value: absolutePath ? { kind, absolutePath } : { kind } })
            schedule()
          })
        return entry
      }
      const knownFiles = (sid) => {
        const out = []
        for (const [k, entry] of cache) {
          if (!k.startsWith(sid + '\u0000') || entry.value?.kind !== 'file' || !entry.value.absolutePath) continue
          out.push([k.slice(sid.length + 1), entry.value.absolutePath])
        }
        return out
      }

      let revealable = false
      if (typeof deps.reveal === 'function') {
        Promise.resolve()
          .then(() => (typeof deps.canReveal === 'function' ? deps.canReveal() : true))
          .catch(() => false)
          .then((ok) => {
            if (lifetime.signal.aborted) return
            revealable = ok === true
            schedule()
          })
      }

      const label = (kind) => t(kind === 'dir' ? (isMac ? 'openFolderFinder' : 'openFolder') : (isMac ? 'revealFinder' : 'reveal'))
      const isOwnButton = (n) => n && n.nodeType === 1 && n.hasAttribute(BTN_ATTR)
      const isDecorated = (n) => n && n.nodeType === 1 && n.tagName === 'CODE' && n.hasAttribute(ATTR)

      function makeButton(code, kind) {
        const btn = doc.createElement('button')
        btn.type = 'button'
        btn.setAttribute(BTN_ATTR, kind)
        btn.innerHTML = ICON
        relabelButton(btn, kind)
        code.after(btn)
        return btn
      }
      function relabelButton(btn, kind) {
        const text = label(kind)
        btn.setAttribute('aria-label', text)
        btn.title = text
      }

      function undecorate(code) {
        for (const a of [ATTR, PATH_ATTR, FAIL_ATTR, 'role', 'tabindex', 'title']) code.removeAttribute(a)
        if (isOwnButton(code.nextSibling)) code.nextSibling.remove()
      }

      function decorateOne(code, sid) {
        const prev = code.getAttribute(PATH_ATTR)
        const path = code.closest('pre,a,button') ? null : pathCandidate(code.textContent)
        if (!path || !sid) {
          if (prev !== null) undecorate(code)
          return
        }
        if (prev !== null && prev !== path) undecorate(code)
        const entry = lookup(sid, path)
        if (!entry.value) return // first answer still coming
        const kind = entry.value.kind
        if (kind === 'none') {
          if (code.hasAttribute(ATTR)) undecorate(code)
          return
        }
        if (code.getAttribute(ATTR) !== kind) {
          undecorate(code)
          code.setAttribute(ATTR, kind)
          if (kind === 'file') {
            code.setAttribute('role', 'link')
            code.setAttribute('tabindex', '0')
            code.title = t('open')
          }
        }
        code.setAttribute(PATH_ATTR, path)
        const next = code.nextSibling
        if (revealable) {
          if (!isOwnButton(next)) makeButton(code, kind)
          else if (next.getAttribute(BTN_ATTR) !== kind) { next.setAttribute(BTN_ATTR, kind); relabelButton(next, kind) }
        } else if (isOwnButton(next)) next.remove()
      }

      function decorate() {
        const sid = deps.sessionId()
        for (const code of doc.querySelectorAll(`${SCOPE} code`)) decorateOne(code, sid)
        // A button whose code was redrawn or left the preview goes too.
        for (const btn of doc.querySelectorAll(`[${BTN_ATTR}]`)) {
          if (!isDecorated(btn.previousSibling)) btn.remove()
        }
        for (const code of doc.querySelectorAll(`code[${ATTR}]`)) {
          if (!code.closest(SCOPE)) undecorate(code)
        }
      }

      let frame = 0
      function schedule() {
        if (frame || lifetime.signal.aborted) return
        frame = win.requestAnimationFrame(() => {
          frame = 0
          decorate()
        })
      }

      let failTimer = 0
      function fail(el, path) {
        win.clearTimeout(failTimer)
        for (const other of doc.querySelectorAll(`[${FAIL_ATTR}]`)) other.removeAttribute(FAIL_ATTR)
        el.setAttribute(FAIL_ATTR, '')
        live.textContent = ''
        win.setTimeout(() => { live.textContent = t('failed', { path }) }, 30)
        failTimer = win.setTimeout(() => el.removeAttribute(FAIL_ATTR), FAIL_TIME)
      }

      function openFile(code) {
        const path = code.getAttribute(PATH_ATTR)
        const sid = deps.sessionId()
        if (!path || !sid) return fail(code, path || '')
        Promise.resolve()
          .then(() => deps.open(fileAddress(sid, deps.cwd(sid), path)))
          .catch(() => fail(code, path))
      }

      function reveal(btn) {
        const code = btn.previousSibling
        if (!isDecorated(code) || typeof deps.reveal !== 'function') return
        const path = code.getAttribute(PATH_ATTR)
        const sid = deps.sessionId()
        const kind = code.getAttribute(ATTR)
        const hit = sid ? cache.get(key(sid, path)) : undefined
        let target = path
        let action = 'reveal'
        if (kind === 'file') {
          target = hit?.value?.absolutePath || path
        } else {
          target = sid ? realDirectory(path, knownFiles(sid)) : path
          // `open` on a bundle folder (Foo.app) would launch it, so show those instead.
          if (!/\.[A-Za-z0-9]+$/.test(target.slice(target.lastIndexOf('/') + 1))) action = 'open'
        }
        Promise.resolve()
          .then(() => deps.reveal(target, action))
          .catch(() => false)
          .then((ok) => { if (ok !== true) fail(btn, path) })
      }

      const selectionInside = (el) => {
        const sel = win.getSelection?.()
        return !!(sel && !sel.isCollapsed && sel.toString().trim() && el.contains(sel.anchorNode))
      }
      const linkOf = (target) => {
        const code = target?.closest?.(`code[${ATTR}=file]`)
        return code && code.closest(SCOPE) ? code : null
      }
      const buttonOf = (target) => target?.closest?.(`[${BTN_ATTR}]`) || null

      const listeners = [
        ['click', (e) => {
          if (e.button !== 0) return
          const btn = buttonOf(e.target)
          if (btn) {
            e.preventDefault()
            e.stopPropagation()
            return reveal(btn)
          }
          const code = linkOf(e.target)
          if (!code || selectionInside(code)) return
          e.preventDefault()
          openFile(code)
        }],
        ['keydown', (e) => {
          if (e.key !== 'Enter' || e.isComposing) return
          const code = linkOf(e.target)
          if (!code || e.target !== code) return
          e.preventDefault()
          openFile(code)
        }]
      ]
      for (const [type, fn] of listeners) doc.addEventListener(type, fn)

      function relabel() {
        for (const code of doc.querySelectorAll(`code[${ATTR}=file]`)) code.title = t('open')
        for (const btn of doc.querySelectorAll(`[${BTN_ATTR}]`)) relabelButton(btn, btn.getAttribute(BTN_ATTR))
      }
      const unsubscribe = typeof deps.subscribe === 'function' ? deps.subscribe(relabel) : null

      // The preview renders (and re-renders as pages load) after the tab opens.
      const ownMutation = (r) => r.target === live || live.contains(r.target) ||
        (r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every(isOwnButton))
      const observer = new win.MutationObserver((records) => {
        if (records.every(ownMutation)) return
        schedule()
      })
      observer.observe(doc.body, { childList: true, subtree: true, characterData: true })
      decorate()

      return () => {
        lifetime.abort()
        observer.disconnect()
        if (frame) win.cancelAnimationFrame(frame)
        win.clearTimeout(failTimer)
        unsubscribe?.()
        for (const [type, fn] of listeners) doc.removeEventListener(type, fn)
        for (const btn of doc.querySelectorAll(`[${BTN_ATTR}]`)) btn.remove()
        for (const code of doc.querySelectorAll(`code[${ATTR}],code[${PATH_ATTR}]`)) undecorate(code)
        live.remove()
        style.remove()
      }
    }

    /** What install() needs, read from DSH's services. */
    function depsFrom(scope, i18n) {
      return {
        ...i18n,
        sessionId: () => scope.sidebarRight?.mounted?.getSnapshot?.() ?? undefined,
        cwd: (sid) => scope.sessions?.list?.getSnapshot?.()?.byId?.[sid]?.cwd,
        async stat(sid, path, signal) {
          const result = await scope.remote.workspaceFiles.stat(sid, path, signal)
          if (result?.ok) return { kind: 'file', absolutePath: result.value?.absolutePath }
          const error = result?.error
          if (error?.code === 'workspace-file/not-regular-file' && error.details?.kind === 'directory') return { kind: 'dir' }
          return { kind: 'none' }
        },
        open: (address) => scope.sidebarRight.openResource(address, { destination: 'sidebar', revealIfOpened: true }),
        async reveal(path, action) {
          const result = await scope.remote.session.openWorkspacePath(action === 'reveal' ? { path, action } : { path })
          return result?.ok === true
        },
        async canReveal() {
          const result = await scope.remote.session.canOpenWorkspacePath()
          return result?.ok === true && result.value === true
        }
      }
    }

    const SERVICES = ['sidebarRight', 'sessions', 'remote', 'remote.session', 'remote.workspaceFiles']

    return {
      inject: ['locale'],
      apply(ctx) {
        if (typeof window === 'undefined' || !window.document) return
        const locale = ctx.locale
        let i18n = {}
        if (locale && typeof locale.register === 'function') {
          ctx.effect(() => locale.register(NS, { en, zh, ko }), 'path-links: dictionaries')
          i18n = { t: locale.bind(NS), subscribe: typeof locale.subscribe === 'function' ? (fn) => locale.subscribe(fn) : undefined }
        }
        // The sidebar, sessions and Host calls may come up after this plugin.
        if (typeof ctx.inject !== 'function') return
        ctx.inject(SERVICES, (scope) => {
          scope.effect(() => install(window, depsFrom(scope, i18n)), 'path-links: path links in the markdown preview')
        })
      },
      // For tests only.
      internals: { pathCandidate, fileAddress, realDirectory, install, depsFrom, dictionaries: { en, ko, zh } }
    }
  }
})
