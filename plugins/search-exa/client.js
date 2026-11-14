/**
 * Browser half of the Exa Search bundle.
 *
 * It adds an "Exa Search" key form to the bundle's Plugins page. The key is
 * written through the Host credential service as EXA_API_KEY and read on every
 * search, so the web_search provider picks it up without a restart. While the Host
 * is still answering, the card shows neutral "checking" text instead of an error.
 */
window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-search-exa',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'exaSearchSettings'
    const REF = 'EXA_API_KEY'
    /** How long the card waits for the Host before it offers a retry. */
    const READY_TIMEOUT_MS = 8000
    /** Retry delay while the Host reports no credential service yet. */
    const RETRY_DELAY_MS = 1500

    const en = {
      title: 'Exa Search',
      summary: 'Exa Search API key used by web_search.',
      description: 'The Exa Search provider uses this key for web_search. The key is stored in the DSH credential store and is never shown again.',
      apiKey: 'Exa API key',
      placeholder: 'Paste the Exa API key',
      hint: 'Get a key from the Exa dashboard:',
      save: 'Save key',
      saving: 'Saving…',
      saved: 'Exa API key saved.',
      checking: 'Checking the current key status…',
      stillChecking: 'The key status is not available yet. Saving a key still works, and this line disappears once the status loads.',
      configured: 'An Exa API key is configured.',
      notConfigured: 'No Exa API key is configured yet.',
      readOnly: 'This credential store is read-only; the key cannot be saved here.',
      required: 'Enter an Exa API key first.',
      invalid: 'This API key is not in a valid format. Please check it.',
      failed: 'The key could not be saved.'
    }

    // The Web client ships English and Chinese dictionaries. Keep Chinese as an
    // English fallback rather than showing missing-key markers.
    const zh = en

    // Korean copy, shown when a Korean language pack is active.
    const ko = {
      title: 'Exa Search',
      summary: 'web_search가 쓰는 Exa Search API 키예요.',
      description: 'Exa Search 공급자가 web_search에 이 키를 써요. 키는 DSH 자격 증명 저장소에 보관되고 다시 표시되지 않아요.',
      apiKey: 'Exa API 키',
      placeholder: 'Exa API 키 붙여넣기',
      hint: 'Exa 대시보드에서 키를 받을 수 있어요:',
      save: '키 저장',
      saving: '저장하는 중…',
      saved: 'Exa API 키를 저장했어요.',
      checking: '키 상태를 확인하는 중이에요…',
      stillChecking: '아직 키 상태를 불러오지 못했어요. 키 저장은 그대로 할 수 있고, 상태를 읽으면 이 안내는 사라져요.',
      configured: 'Exa API 키가 설정돼 있어요.',
      notConfigured: '아직 Exa API 키가 설정되지 않았어요.',
      readOnly: '이 자격 증명 저장소는 읽기 전용이라 여기서는 키를 저장할 수 없어요.',
      required: '먼저 Exa API 키를 입력해 주세요.',
      invalid: '이 API 키는 형식이 올바르지 않아요. 확인해 주세요.',
      failed: '키를 저장하지 못했어요.'
    }

    const styles = {
      label: { fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary, #111827)', wordBreak: 'keep-all' },
      // keep-all keeps Korean words whole; overflowWrap lets the long URL wrap instead of overflowing.
      hint: { margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-tertiary, #6b7280)', wordBreak: 'keep-all', overflowWrap: 'anywhere' },
      input: {
        width: '100%',
        boxSizing: 'border-box',
        minHeight: 44,
        padding: '8px 10px',
        borderRadius: 8,
        // The tertiary label colour keeps the field edge at 3:1 or more in both themes.
        border: '1px solid var(--dsw-alias-label-tertiary, #6b7280)',
        background: 'var(--dsw-alias-bg-base, #fff)',
        color: 'var(--dsw-alias-label-primary, #111827)',
        fontSize: 13
      },
      row: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }
    }

    function toneStyle(tone) {
      if (tone === 'success') return { ...styles.hint, color: 'var(--dsw-alias-label-success, #15803d)' }
      if (tone === 'danger') return { ...styles.hint, color: 'var(--dsw-alias-label-danger, #b91c1c)' }
      return styles.hint
    }

    function ExaSettingsCard(props) {
      const { t, view } = props
      if (view === 'summary') return t('summary')

      const credentials = props.credentials
      const [draft, setDraft] = React.useState('')
      const [configured, setConfigured] = React.useState(null)
      const [writable, setWritable] = React.useState(true)
      const [saving, setSaving] = React.useState(false)
      const [status, setStatus] = React.useState(null)

      React.useEffect(() => {
        let alive = true
        let timer
        let attempts = 0
        const started = Date.now()

        const attempt = async () => {
          if (!alive) return
          if (!credentials || typeof credentials.describe !== 'function') {
            if (Date.now() - started < READY_TIMEOUT_MS) {
              timer = setTimeout(attempt, RETRY_DELAY_MS)
              return
            }
            setWritable(false)
            setStatus({ tone: 'muted', text: t('stillChecking') })
            return
          }
          attempts += 1
          try {
            const response = await credentials.describe([REF])
            if (!alive) return
            if (!response?.ok) {
              if (Date.now() - started < READY_TIMEOUT_MS) {
                timer = setTimeout(attempt, RETRY_DELAY_MS)
                return
              }
              setStatus({ tone: 'muted', text: t('stillChecking') })
              return
            }
            const info = response.value?.[REF]
            setConfigured(info?.configured === true)
            setWritable(info?.writable !== false)
            setStatus((current) => (current?.tone === 'muted' ? null : current))
          } catch {
            if (!alive) return
            if (attempts < 4) {
              timer = setTimeout(attempt, RETRY_DELAY_MS)
              return
            }
            setStatus({ tone: 'muted', text: t('stillChecking') })
          }
        }

        attempt()
        return () => {
          alive = false
          clearTimeout(timer)
        }
      }, [credentials])

      const save = async () => {
        const value = draft.trim()
        if (value.length === 0) {
          setStatus({ tone: 'danger', text: t('required') })
          return
        }
        if (!/^[\x21-\x7E]+$/.test(value)) {
          setStatus({ tone: 'danger', text: t('invalid') })
          return
        }
        if (!credentials || typeof credentials.set !== 'function') {
          setStatus({ tone: 'danger', text: t('readOnly') })
          return
        }
        setSaving(true)
        setStatus(null)
        try {
          const response = await credentials.set(REF, value)
          if (response && response.ok === false) throw new Error(response.message ?? t('failed'))
          setConfigured(true)
          setDraft('')
          setStatus({ tone: 'success', text: t('saved') })
        } catch (error) {
          // The host's own message is not translated: lead with the translated one, keep the detail after it.
          const detail = typeof error?.message === 'string' ? error.message.trim() : ''
          setStatus({ tone: 'danger', text: detail && detail !== t('failed') ? `${t('failed')} (${detail})` : t('failed') })
        } finally {
          setSaving(false)
        }
      }

      const buttonStyle = {
        justifySelf: 'start',
        minHeight: 44,
        padding: '8px 16px',
        borderRadius: 8,
        border: 'none',
        background: 'var(--dsw-alias-brand-primary, #2563eb)',
        color: '#fff',
        fontSize: 13,
        cursor: saving || !writable ? 'default' : 'pointer',
        opacity: saving || !writable ? 0.6 : 1
      }

      const stateText = configured === null
        ? null
        : configured
          ? t('configured')
          : t('notConfigured')

      return h(
        'div',
        { style: { display: 'grid', gap: 10, maxWidth: 640 } },
        h('p', { style: { ...styles.hint, fontSize: 13, color: 'var(--dsw-alias-label-secondary, #374151)' } }, t('description')),
        h('label', { htmlFor: 'exa-search-api-key', style: styles.label }, t('apiKey')),
        h('input', {
          id: 'exa-search-api-key',
          type: 'password',
          autoComplete: 'new-password',
          value: draft,
          placeholder: t('placeholder'),
          disabled: saving || !writable,
          onChange: (event) => setDraft(event.target.value),
          style: styles.input
        }),
        h(
          'div',
          { style: styles.row },
          h(
            'button',
            { type: 'button', onClick: save, disabled: saving || !writable || draft.trim().length === 0, style: buttonStyle },
            saving ? t('saving') : t('save')
          ),
          h('span', { style: styles.hint }, configured === null ? t('checking') : stateText)
        ),
        // Always mounted so screen readers announce save results as they appear.
        h('div', { role: 'status', 'aria-live': 'polite' }, status === null ? null : h('p', { style: toneStyle(status.tone) }, status.text)),
        writable ? null : h('p', { style: styles.hint }, t('readOnly')),
        h(
          'p',
          { style: styles.hint },
          t('hint'),
          h('br'),
          h(
            'a',
            {
              href: 'https://dashboard.exa.ai/api-keys',
              target: '_blank',
              rel: 'noreferrer',
              style: { color: 'var(--dsw-alias-link, #2563eb)' }
            },
            'dashboard.exa.ai/api-keys'
          )
        )
      )
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.credentials'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, { en, zh, ko }), 'exa-search-settings: dictionaries')
        // The Exa Search bundle's own detail page renders this keyed config
        // section, so the key is entered where the installed bundle is shown.
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config',
          key: '@lyngmn/dsh-search-exa',
          locale: NS,
          inject: () => ({ credentials: ctx.remote.credentials })
        }, ExaSettingsCard))
      }
    }
  }
})
