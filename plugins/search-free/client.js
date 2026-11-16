/**
 * Browser half of the Search bundle (@lyngmn/dsh-search-free).
 *
 * It adds a key card to the bundle's Plugins page: one row per engine with its
 * state, a password field per credential, Save and Clear buttons and a link to
 * where the key is issued. Keys go through the Host credential service and are
 * read on every search, so no restart is needed. Key values are never shown
 * again or logged.
 */
window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-search-free',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'freeSearchSettings'
    /** How long the card waits for the Host before it shows "still checking". */
    const READY_TIMEOUT_MS = 8000
    /** Retry delay while the Host reports no credential service yet. */
    const RETRY_DELAY_MS = 1500

    /**
     * Engines in the order the card lists them. `mode`: 'optional' works without
     * a key, 'required' is skipped without one, 'none' takes no key.
     */
    const ENGINES = [
      { id: 'naver', name: 'Naver', mode: 'required', refs: ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET'], link: 'https://developers.naver.com/apps/#/register' },
      { id: 'kakao', name: 'Kakao (Daum)', mode: 'required', refs: ['KAKAO_REST_API_KEY'], link: 'https://developers.kakao.com/console/app' },
      { id: 'you', name: 'You.com', mode: 'optional', refs: ['YDC_API_KEY'], link: 'https://you.com/platform/api-keys' },
      { id: 'parallel', name: 'Parallel', mode: 'optional', refs: ['PARALLEL_API_KEY'], link: 'https://platform.parallel.ai' },
      { id: 'keenable', name: 'Keenable', mode: 'optional', refs: ['KEENABLE_API_KEY'], link: 'https://keenable.ai/login' },
      { id: 'tavily', name: 'Tavily', mode: 'optional', refs: ['TAVILY_API_KEY'], link: 'https://app.tavily.com/home' },
      { id: 'tinyfish', name: 'TinyFish', mode: 'required', refs: ['TINYFISH_API_KEY'], link: 'https://tinyfish.ai' },
      { id: 'jina', name: 'Jina', mode: 'required', refs: ['JINA_API_KEY'], link: 'https://jina.ai/api-dashboard' },
      { id: 'firecrawl', name: 'Firecrawl', mode: 'optional', refs: ['FIRECRAWL_API_KEY'], link: 'https://www.firecrawl.dev/app/api-keys' },
      { id: 'bing', name: 'Bing', mode: 'none', refs: [], link: '' }
    ]
    const ALL_REFS = ENGINES.flatMap((engine) => engine.refs)

    const en = {
      title: 'Search',
      summary: 'Keys for the search engines. A key raises the limit, and some engines need one.',
      description: 'Engines marked "works without a key" search on their free tier; a key raises the limit. Engines marked "key needed" are skipped until you add one. Keys are stored in the DSH credential store, never shown again, and apply from the next search.',
      checking: 'Checking which keys are set…',
      stillChecking: 'The key status is not available yet. Saving still works, and this line disappears once the status loads.',
      stateKeyed: 'Key set',
      statePartial: 'Partly set',
      stateKeyless: 'Works without a key',
      stateNeeded: 'Key needed',
      stateNone: 'No key used',
      apiKey: 'API key',
      clientId: 'Client ID',
      clientSecret: 'Client Secret',
      placeholder: 'Paste the key',
      save: 'Save',
      saving: 'Saving…',
      clear: 'Clear',
      clearing: 'Clearing…',
      saved: 'Saved. It applies from the next search.',
      cleared: 'Cleared.',
      required: 'Enter a key first.',
      invalid: 'This key has characters a key cannot have. Please check it.',
      readOnly: 'This credential store is read-only; keys cannot be saved here.',
      failed: 'The key could not be saved.',
      clearFailed: 'The key could not be cleared.',
      getKey: 'Get a key',
      'note.naver': 'Korean web documents. Free, 25,000 calls a day. Register an app with the Search API.',
      'note.kakao': 'Korean web search (Daum). Free daily quota with a REST API key.',
      'note.you': 'Without a key: 100 searches a day.',
      'note.parallel': 'Without a key: only a few searches in a row.',
      'note.keenable': 'Works without a key; a key gives a higher limit.',
      'note.tavily': 'Without a key the daily cap is very small; the free key gives 1,000 credits a month.',
      'note.tinyfish': 'Free plan with a key.',
      'note.jina': 'Free tokens when you sign up.',
      'note.firecrawl': 'Without a key it may be refused behind a VPN or proxy.',
      'note.bing': 'Reads the Bing result page. No key or quota.'
    }

    // The Web client ships English and Chinese dictionaries. Keep Chinese as an
    // English fallback rather than showing missing-key markers.
    const zh = en

    const ko = {
      title: '검색',
      summary: '검색 엔진의 키예요. 키를 넣으면 한도가 늘고, 일부 엔진은 키가 있어야 써요.',
      description: '"키 없이 써요"인 엔진은 무료 등급으로 검색하고, 키를 넣으면 한도가 늘어요. "키 필요"인 엔진은 키를 넣기 전까지 건너뛰어요. 키는 DSH 자격 증명 저장소에 보관되고 다시 표시되지 않으며, 다음 검색부터 적용돼요.',
      checking: '어떤 키가 설정됐는지 확인하는 중이에요…',
      stillChecking: '아직 키 상태를 불러오지 못했어요. 저장은 그대로 할 수 있고, 상태를 읽으면 이 안내는 사라져요.',
      stateKeyed: '키 설정됨',
      statePartial: '일부만 설정됨',
      stateKeyless: '키 없이 써요',
      stateNeeded: '키 필요',
      stateNone: '키를 쓰지 않아요',
      apiKey: 'API 키',
      clientId: 'Client ID',
      clientSecret: 'Client Secret',
      placeholder: '키 붙여넣기',
      save: '저장',
      saving: '저장하는 중…',
      clear: '지우기',
      clearing: '지우는 중…',
      saved: '저장했어요. 다음 검색부터 적용돼요.',
      cleared: '지웠어요.',
      required: '먼저 키를 입력해 주세요.',
      invalid: '키에 쓸 수 없는 문자가 들어 있어요. 확인해 주세요.',
      readOnly: '이 자격 증명 저장소는 읽기 전용이라 여기서는 키를 저장할 수 없어요.',
      failed: '키를 저장하지 못했어요.',
      clearFailed: '키를 지우지 못했어요.',
      getKey: '키 받기',
      'note.naver': '한국어 웹문서 검색이에요. 무료로 하루 25,000번까지 써요. 검색 API로 앱을 등록해 받아요.',
      'note.kakao': '다음 웹검색이에요. REST API 키로 하루 무료 한도만큼 써요.',
      'note.you': '키 없이 하루 100번까지 써요.',
      'note.parallel': '키 없이는 연달아 몇 번만 쓸 수 있어요.',
      'note.keenable': '키 없이 쓰고, 키를 넣으면 한도가 늘어요.',
      'note.tavily': '키 없이는 하루 한도가 아주 작아요. 무료 키로 한 달에 1,000 크레딧을 써요.',
      'note.tinyfish': '키를 넣으면 무료 요금제로 써요.',
      'note.jina': '가입하면 무료 토큰을 줘요.',
      'note.firecrawl': '키 없이 쓰지만 VPN·프록시에서는 막힐 수 있어요.',
      'note.bing': 'Bing 검색 결과 페이지를 읽어요. 키와 한도가 없어요.'
    }

    const color = {
      primary: 'var(--dsw-alias-label-primary, #111827)',
      secondary: 'var(--dsw-alias-label-secondary, #374151)',
      tertiary: 'var(--dsw-alias-label-tertiary, #4b5563)',
      border: 'var(--dsw-alias-border-secondary, #d1d5db)',
      divider: 'var(--dsw-alias-border-tertiary, #e5e7eb)',
      base: 'var(--dsw-alias-bg-base, #fff)',
      brand: 'var(--dsw-alias-brand-primary, #2563eb)',
      link: 'var(--dsw-alias-link, #2563eb)',
      success: 'var(--dsw-alias-label-success, #15803d)',
      danger: 'var(--dsw-alias-label-danger, #b91c1c)'
    }

    const styles = {
      card: { display: 'grid', gap: 12, maxWidth: 640, wordBreak: 'keep-all', overflowWrap: 'anywhere' },
      intro: { margin: 0, fontSize: 13, lineHeight: 1.6, color: color.secondary },
      hint: { margin: 0, fontSize: 12, lineHeight: 1.5, color: color.tertiary, textWrap: 'pretty' },
      row: { display: 'grid', gap: 8, paddingTop: 12, borderTop: `1px solid ${color.divider}` },
      head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 24 },
      name: { margin: 0, fontSize: 14, fontWeight: 600, lineHeight: '24px', color: color.primary, whiteSpace: 'nowrap' },
      label: { fontSize: 13, fontWeight: 500, color: color.primary },
      input: {
        width: '100%',
        boxSizing: 'border-box',
        minHeight: 44,
        padding: '8px 12px',
        borderRadius: 8,
        // The field edge uses the tertiary label colour: the DSH border tokens are
        // decorative and can fall under the 3:1 a form field needs (WCAG 1.4.11).
        border: `1px solid ${color.tertiary}`,
        background: color.base,
        color: color.primary,
        fontSize: 16
      },
      buttons: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, maxWidth: 320 },
      link: { display: 'inline-flex', alignItems: 'center', minHeight: 44, minWidth: 44, color: color.link, fontSize: 13, alignSelf: 'start', justifySelf: 'start' }
    }

    function chipStyle(tone) {
      const tint = tone === 'success' ? color.success : tone === 'danger' ? color.danger : color.tertiary
      return {
        flex: 'none',
        padding: '2px 10px',
        borderRadius: 999,
        border: `1px solid ${tint}`,
        color: tint,
        fontSize: 12,
        lineHeight: '18px',
        whiteSpace: 'nowrap'
      }
    }

    function buttonStyle(kind, disabled) {
      const primary = kind === 'primary'
      return {
        minHeight: 44,
        padding: '0 14px',
        borderRadius: 8,
        border: primary ? 'none' : `1px solid ${color.border}`,
        background: primary ? color.brand : color.base,
        color: primary ? '#fff' : color.primary,
        fontSize: 14,
        whiteSpace: 'nowrap',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1
      }
    }

    function messageStyle(tone) {
      if (tone === 'success') return { ...styles.hint, color: color.success }
      if (tone === 'danger') return { ...styles.hint, color: color.danger }
      return styles.hint
    }

    /** Engine state from the credential description. */
    function engineState(engine, info) {
      if (engine.mode === 'none') return { key: 'stateNone', tone: 'muted' }
      if (info === null) return null
      const set = engine.refs.filter((ref) => info[ref]?.configured === true).length
      if (set === engine.refs.length) return { key: 'stateKeyed', tone: 'success' }
      if (set > 0) return { key: 'statePartial', tone: 'danger' }
      return engine.mode === 'required' ? { key: 'stateNeeded', tone: 'danger' } : { key: 'stateKeyless', tone: 'muted' }
    }

    function fieldLabel(engine, index, t) {
      if (engine.id === 'naver') return index === 0 ? t('clientId') : t('clientSecret')
      return t('apiKey')
    }

    function EngineRow({ engine, info, writable, credentials, t, onChanged }) {
      const [drafts, setDrafts] = React.useState(() => engine.refs.map(() => ''))
      const [busy, setBusy] = React.useState(null)
      const [message, setMessage] = React.useState(null)
      const state = engineState(engine, info)
      const headingId = `free-search-${engine.id}-name`
      const anyConfigured = info !== null && engine.refs.some((ref) => info[ref]?.configured === true)

      const save = async () => {
        const entries = engine.refs.map((ref, index) => [ref, drafts[index].trim()]).filter(([, value]) => value !== '')
        if (entries.length === 0) return setMessage({ tone: 'danger', text: t('required') })
        if (entries.some(([, value]) => !/^[\x21-\x7E]+$/.test(value))) return setMessage({ tone: 'danger', text: t('invalid') })
        if (!credentials || typeof credentials.set !== 'function') return setMessage({ tone: 'danger', text: t('readOnly') })
        setBusy('save')
        setMessage(null)
        try {
          for (const [ref, value] of entries) {
            const response = await credentials.set(ref, value)
            if (response && response.ok === false) throw new Error(response.message ?? '')
          }
          setDrafts(engine.refs.map(() => ''))
          setMessage({ tone: 'success', text: t('saved') })
          onChanged()
        } catch (error) {
          // The host's own message is not translated: lead with the translated one, keep the detail after it.
          const detail = typeof error?.message === 'string' ? error.message.trim() : ''
          setMessage({ tone: 'danger', text: detail ? `${t('failed')} (${detail})` : t('failed') })
        } finally {
          setBusy(null)
        }
      }

      const clear = async () => {
        if (!credentials || typeof credentials.unset !== 'function') return setMessage({ tone: 'danger', text: t('readOnly') })
        setBusy('clear')
        setMessage(null)
        try {
          for (const ref of engine.refs) {
            if (info !== null && info[ref]?.configured !== true) continue
            const response = await credentials.unset(ref)
            if (response && response.ok === false) throw new Error(response.message ?? '')
          }
          setMessage({ tone: 'success', text: t('cleared') })
          onChanged()
        } catch (error) {
          const detail = typeof error?.message === 'string' ? error.message.trim() : ''
          setMessage({ tone: 'danger', text: detail ? `${t('clearFailed')} (${detail})` : t('clearFailed') })
        } finally {
          setBusy(null)
        }
      }

      const hasDraft = drafts.some((value) => value.trim() !== '')
      const saveDisabled = busy !== null || !writable || !hasDraft
      const clearDisabled = busy !== null || !writable || !anyConfigured

      return h(
        'section',
        { style: styles.row, 'aria-labelledby': headingId },
        h(
          'div',
          { style: styles.head },
          h('h3', { id: headingId, style: styles.name }, engine.name),
          state === null ? null : h('span', { style: chipStyle(state.tone) }, t(state.key))
        ),
        h('p', { style: styles.hint }, t(`note.${engine.id}`)),
        ...engine.refs.map((ref, index) => {
          const inputId = `free-search-${ref.toLowerCase()}`
          return h(
            'div',
            { key: ref, style: { display: 'grid', gap: 4 } },
            h('label', { htmlFor: inputId, style: styles.label }, fieldLabel(engine, index, t)),
            h('input', {
              id: inputId,
              type: 'password',
              autoComplete: 'new-password',
              spellCheck: false,
              value: drafts[index],
              placeholder: t('placeholder'),
              disabled: busy !== null || !writable,
              onChange: (event) => {
                const next = drafts.slice()
                next[index] = event.target.value
                setDrafts(next)
              },
              style: styles.input
            })
          )
        }),
        engine.refs.length === 0
          ? null
          : h(
            'div',
            { style: styles.buttons },
            h('button', { type: 'button', onClick: save, disabled: saveDisabled, style: buttonStyle('primary', saveDisabled) }, busy === 'save' ? t('saving') : t('save')),
            h('button', { type: 'button', onClick: clear, disabled: clearDisabled, style: buttonStyle('secondary', clearDisabled) }, busy === 'clear' ? t('clearing') : t('clear'))
          ),
        // Always present so screen readers hear the result of Save and Clear (WCAG 4.1.3).
        h('div', { role: 'status', 'aria-live': 'polite' }, message === null ? null : h('p', { style: messageStyle(message.tone) }, message.text)),
        engine.link
          ? h('a', { href: engine.link, target: '_blank', rel: 'noreferrer', style: styles.link, 'aria-label': `${t('getKey')}: ${engine.name}` }, `${t('getKey')} ↗`)
          : null
      )
    }

    function FreeSearchSettingsCard(props) {
      const { t, view } = props
      if (view === 'summary') return t('summary')

      const credentials = props.credentials
      const [info, setInfo] = React.useState(null)
      const [writable, setWritable] = React.useState(true)
      const [notice, setNotice] = React.useState(null)
      const [revision, setRevision] = React.useState(0)

      React.useEffect(() => {
        let alive = true
        let timer
        let attempts = 0
        const started = Date.now()
        const waitOrGiveUp = () => {
          if (Date.now() - started < READY_TIMEOUT_MS) {
            timer = setTimeout(attempt, RETRY_DELAY_MS)
            return
          }
          setNotice(t('stillChecking'))
        }
        const attempt = async () => {
          if (!alive) return
          if (!credentials || typeof credentials.describe !== 'function') return waitOrGiveUp()
          attempts += 1
          try {
            const response = await credentials.describe(ALL_REFS)
            if (!alive) return
            if (!response?.ok) return waitOrGiveUp()
            const value = response.value ?? {}
            setInfo(value)
            setWritable(ALL_REFS.every((ref) => value[ref]?.writable !== false))
            setNotice(null)
          } catch {
            if (!alive) return
            if (attempts < 4) {
              timer = setTimeout(attempt, RETRY_DELAY_MS)
              return
            }
            setNotice(t('stillChecking'))
          }
        }
        attempt()
        return () => {
          alive = false
          clearTimeout(timer)
        }
      }, [credentials, revision])

      return h(
        'div',
        { style: styles.card },
        h('p', { style: styles.intro }, t('description')),
        info === null ? h('p', { role: 'status', style: styles.hint }, notice ?? t('checking')) : null,
        writable ? null : h('p', { style: styles.hint }, t('readOnly')),
        ...ENGINES.map((engine) => h(EngineRow, {
          key: engine.id,
          engine,
          info,
          writable,
          credentials,
          t,
          onChanged: () => setRevision((value) => value + 1)
        }))
      )
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.credentials'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, { en, zh, ko }), 'free-search-settings: dictionaries')
        // The bundle's own detail page renders this keyed config section.
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config',
          key: '@lyngmn/dsh-search-free',
          locale: NS,
          inject: () => ({ credentials: ctx.remote.credentials })
        }, FreeSearchSettingsCard))
      }
    }
  }
})
