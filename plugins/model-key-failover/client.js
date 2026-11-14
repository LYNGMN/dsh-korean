/**
 * Browser half of the model-key failover bundle.
 *
 * It adds a panel inside every provider card of Settings → Models whose
 * provider authenticates with a named key; the Host half says which do. Each row shows which key slot is active, lets the user save spare
 * keys into the credential store, and can move to the next key or go back to
 * the first one. Key values are never rendered back.
 */
window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-model-key-failover',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'modelKeyFailover'
    const RETRY_DELAY_MS = 1500
    const READY_TIMEOUT_MS = 8000

    const en = {
      title: 'Model spare keys',
      description: 'Add spare API keys for this provider. When the key in use is rejected or runs out, the next key takes over and the request is sent again.',
      cardHint: 'The API key field above is key 1, the main key. It stays as you typed it even when a spare takes over. A rate-limited key rests for a moment and is used again; a rejected key rests for several hours.',
      filled: 'saved',
      commandHint: 'To switch by hand, type /model-keys-next {route} or /model-keys-sync {route} in a chat.',
      key: 'Key {n}',
      save: 'Save keys',
      saving: 'Saving…',
      saved: 'Spare keys saved.',
      active: 'key {n} in use',
      none: 'No spare key yet.',
      configured: '{count} spare key(s) saved',
      readOnly: 'The credential store is read-only here.',
      failed: 'The keys could not be saved.',
      statusFailed: 'The key state could not be read yet.',
      checking: 'Checking the current keys…',
    }

    const ko = {
      title: '모델 예비 키',
      description: '이 공급자에 예비 API 키를 등록해요. 쓰던 키가 거절되거나 한도가 다 차면 다음 키로 바꿔서 같은 요청을 다시 보내요.',
      cardHint: '위의 API 키 칸이 1번 키(메인)예요. 예비 키로 넘어가도 이 칸은 바뀌지 않아요. 요청 제한에 걸린 키는 잠시 쉬었다가 다시 쓰고, 거절된 키는 몇 시간 쉬어요.',
      filled: '저장됨',
      commandHint: '직접 바꾸려면 대화창에 /model-keys-next {route} 또는 /model-keys-sync {route}를 입력해 주세요.',
      key: '{n}번 키',
      save: '키 저장',
      saving: '저장하는 중…',
      saved: '예비 키를 저장했어요.',
      active: '{n}번 키 사용 중',
      none: '아직 예비 키가 없어요.',
      configured: '예비 키 {count}개 저장됨',
      readOnly: '이 자격 증명 저장소는 읽기 전용이라 여기서 저장할 수 없어요.',
      failed: '키를 저장하지 못했어요.',
      statusFailed: '아직 키 상태를 읽지 못했어요.',
      checking: '키 상태를 확인하는 중이에요…',
    }

    const zh = en

    const styles = {
      section: { display: 'grid', gap: 12, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--dsw-alias-border-secondary, #e5e7eb)' },
      title: { margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #111827)' },
      hint: { margin: 0, fontSize: 12, lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere', textWrap: 'pretty', color: 'var(--dsw-alias-label-tertiary, #6b7280)' },
      row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      card: { display: 'grid', gap: 8, padding: 12, border: '1px solid var(--dsw-alias-border-secondary, #e5e7eb)', borderRadius: 10 },
      label: { fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary, #111827)' },
      input: {
        width: '100%',
        boxSizing: 'border-box',
        minHeight: 36,
        padding: '7px 10px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-secondary, #d1d5db)',
        background: 'var(--dsw-alias-bg-base, #fff)',
        color: 'var(--dsw-alias-label-primary, #111827)',
        fontSize: 12,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
      },
      button: {
        minHeight: 36,
        padding: '7px 12px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-secondary, #d1d5db)',
        background: 'var(--dsw-alias-bg-base, #fff)',
        color: 'var(--dsw-alias-label-primary, #111827)',
        fontSize: 12,
        cursor: 'pointer'
      },
      primary: {
        minHeight: 36,
        padding: '7px 12px',
        borderRadius: 8,
        border: 'none',
        background: 'var(--dsw-alias-brand-primary, #2563eb)',
        color: '#fff',
        fontSize: 12,
        cursor: 'pointer'
      }
    }

    function toneStyle(tone) {
      if (tone === 'success') return { ...styles.hint, color: 'var(--dsw-alias-label-success, #15803d)' }
      if (tone === 'danger') return { ...styles.hint, color: 'var(--dsw-alias-label-danger, #b91c1c)' }
      return styles.hint
    }

    /** Spare keys per provider; the Host half uses the same default. */
    const SPARE_SLOTS = 4

    /** The credential reference a provider's profile names, read from the settings the page already shows. */
    function keyRefOf(view, entry) {
      const namespaces = Array.isArray(view?.namespaces) ? view.namespaces : []
      let node = namespaces.find((namespace) => namespace.ns === entry.settingsNs)?.value
      for (const segment of entry.settingsPath ?? []) node = node === null || typeof node !== 'object' ? undefined : node[segment]
      const ref = node?.apiKeyEnv
      if (typeof ref === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) return ref
      // The official DeepSeek route is a single connection whose schema default
      // is DEEPSEEK_API_KEY; a view that omits the default still names it.
      if (entry?.provider === 'deepseek-official') return 'DEEPSEEK_API_KEY'
      return undefined
    }

    /** The reference that records the key actually in use; keep in step with failover-core.js. */
    function activeRefOf(keyRef) {
      return keyRef.endsWith('_API_KEY')
        ? `${keyRef.slice(0, -'_API_KEY'.length)}_ACTIVE_KEY`
        : `${keyRef}_ACTIVE`
    }

    function ProviderRow(props) {
      const { t, entry, settings, credentials } = props
      const [info, setInfo] = React.useState(null)
      const [missing, setMissing] = React.useState(false)
      const [drafts, setDrafts] = React.useState({})
      const [saving, setSaving] = React.useState(false)
      const [status, setStatus] = React.useState(null)
      const frame = (body) => h(
        'section',
        { style: styles.section, 'aria-label': t('title') },
        h('h4', { style: styles.title }, t('title')),
        h('p', { style: styles.hint }, t('description')),
        h('p', { style: styles.hint }, t('cardHint')),
        body
      )

      // Slot names follow from the provider's own key reference, so a provider
      // added later shows up here without any change to this plugin.
      const readState = React.useCallback(async () => {
        if (!settings || typeof settings.describe !== 'function' || !credentials || typeof credentials.describe !== 'function') return 'retry'
        try {
          const described = await settings.describe()
          if (!described?.ok) return 'retry'
          const keyRef = keyRefOf(described.value, entry)
          if (keyRef === undefined) return 'none'
          const activeRef = activeRefOf(keyRef)
          const names = Array.from({ length: SPARE_SLOTS + 1 }, (_, index) => `${keyRef}_${index + 1}`)
          const response = await credentials.describe([keyRef, ...names, activeRef])
          if (!response?.ok) return 'retry'
          const main = response.value?.[keyRef]
          const activeInfo = response.value?.[activeRef]
          const slots = names.map((name, index) => ({
            slot: index + 1,
            name,
            configured: response.value?.[name]?.configured === true,
            masked: response.value?.[name]?.masked
          }))
          // Key values never reach the page; the masked previews are enough to
          // tell which slot holds the key in use. The active reference is the
          // source of truth; the main reference is the fallback for a state
          // written before this layout existed.
          const findSlot = (masked) => typeof masked === 'string'
            ? slots.find((slot) => slot.configured && slot.masked === masked)
            : undefined
          const active = findSlot(activeInfo?.masked) ?? findSlot(main?.masked)
          setInfo({ keyRef, activeRef, slots, active: active?.slot ?? null })
          return 'ok'
        } catch {
          return 'retry'
        }
      }, [settings, credentials, entry])

      React.useEffect(() => {
        let alive = true
        const started = Date.now()
        const tick = async () => {
          if (!alive) return
          const outcome = await readState()
          if (!alive || outcome === 'ok') return
          if (outcome === 'retry' && Date.now() - started < READY_TIMEOUT_MS) setTimeout(tick, RETRY_DELAY_MS)
          else setMissing(outcome === 'none' ? 'none' : 'failed')
        }
        tick()
        return () => {
          alive = false
        }
      }, [readState])

      // A provider without a named key (account sign-in, native auth) has no
      // spare-key slots, so its card shows nothing extra.
      if (info === null) {
        if (missing === 'none') return null
        return frame(h('p', { role: 'status', style: styles.hint }, missing === 'failed' ? t('statusFailed') : t('checking')))
      }

      const spare = info.slots.slice(1)

      const save = async () => {
        if (typeof credentials.set !== 'function') {
          setStatus({ tone: 'danger', text: t('readOnly') })
          return
        }
        const entries = spare.map((slot) => [slot.name, String(drafts[slot.name] ?? '').trim()]).filter(([, value]) => value.length > 0)
        if (entries.length === 0) return
        setSaving(true)
        setStatus(null)
        try {
          for (const [ref, value] of entries) {
            if (!/^[\x21-\x7E]+$/.test(value)) throw new Error(t('failed'))
            const response = await credentials.set(ref, value)
            if (response && response.ok === false) throw new Error(response.error?.message ?? response.message ?? t('failed'))
          }
          setDrafts({})
          setStatus({ tone: 'success', text: t('saved') })
          await readState()
        } catch (error) {
          // The host's own message is not translated: lead with the translated one, keep the detail after it.
          const detail = typeof error?.message === 'string' ? error.message.trim() : ''
          setStatus({ tone: 'danger', text: detail && detail !== t('failed') ? `${t('failed')} (${detail})` : t('failed') })
        } finally {
          setSaving(false)
        }
      }

      const spareCount = spare.filter((slot) => slot.configured).length
      const summary = [
        spareCount === 0 ? t('none') : t('configured').replace('{count}', () => String(spareCount)),
        spareCount === 0 || info.active === null ? null : t('active').replace('{n}', () => String(info.active))
      ].filter(Boolean).join(' · ')
      return frame(h(
        'div',
        { style: styles.card },
        h('p', { style: styles.hint }, summary),
        spare.map((slot) =>
          h('input', {
            key: slot.name,
            type: 'password',
            autoComplete: 'new-password',
            'aria-label': t('key').replace('{n}', () => String(slot.slot)),
            // Match the main API key field: a saved key shows the server's
            // masked preview (first and last characters) as the placeholder.
            placeholder: slot.configured && slot.masked
              ? `${t('key').replace('{n}', () => String(slot.slot))} · ${slot.masked}`
              : `${t('key').replace('{n}', () => String(slot.slot))}${slot.configured ? ` · ${t('filled')}` : ''}`,
            value: drafts[slot.name] ?? '',
            disabled: saving,
            onChange: (event) => setDrafts({ ...drafts, [slot.name]: event.target.value }),
            style: styles.input
          })
        ),
        h(
          'div',
          { style: styles.row },
          h('button', { type: 'button', onClick: save, disabled: saving, style: styles.primary }, saving ? t('saving') : t('save'))
        ),
        h('p', { style: styles.hint }, t('commandHint').split('{route}').join(entry.provider)),
        status === null ? null : h('p', { role: status.tone === 'danger' ? 'alert' : 'status', style: toneStyle(status.tone) }, status.text)
      ))
    }

    /**
     * Render the spare-key editor inside a provider card. The Models page
     * dispatches this keyed slot for every llm-pi-ai card; a card that is not
     * configured yet, or whose provider has no named key, renders nothing.
     */
    function ModelKeyFailoverPanel(props) {
      const { t } = props
      const entry = props.provider
      if (typeof entry?.provider !== 'string' || entry.provider === '' || props.configured === false) return null
      return h(ProviderRow, { key: entry.provider, t, entry, settings: props.settings, credentials: props.credentials })
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.credentials', 'remote.settings'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh, ko }), 'model-key-failover: dictionaries')
        // Bound once here, where both Remote namespaces are declared in this
        // plugin's own `inject`: a namespace read from inside a render is not
        // guaranteed to be reachable.
        const credentials = ctx.remote.credentials
        const settings = ctx.remote.settings
        const face = {
          credentials: {
            describe: (refs) => credentials.describe(refs),
            set: (ref, value) => credentials.set(ref, value)
          },
          settings: { describe: () => settings.describe() }
        }
        // The slot key is the owning settings namespace: pi-ai covers custom
        // providers, llm-deepseek is the official DeepSeek single connection.
        for (const key of ['llm-pi-ai', 'llm-deepseek']) {
          ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
            name: 'settings.models.provider-card',
            key,
            locale: NS,
            inject: () => face
          }, ModelKeyFailoverPanel))
        }
      }
    }
  }
})
