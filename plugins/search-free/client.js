/**
 * Browser half of the Search bundle (@lyngmn/dsh-search-free).
 *
 * It adds a card to the bundle's Plugins page:
 * - the automatic engine's order: which engines it uses and in what order,
 *   saved to this entry's settings (`autoOrder`, a volatile field read on every
 *   search);
 * - one row per engine with its country, its quota with and without a key, a
 *   password field per credential, Save and Clear buttons, and links to where
 *   the key is issued and to the pricing page.
 * Keys go through the Host credential service and are read on every search, so
 * no restart is needed. Key values are never shown again or logged.
 * A bare `/search` opens an engine picker with each engine's short quota.
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
     * Engines in the default order of the automatic engine, which is also the
     * order the key list uses. `mode`: 'optional' works without
     * a key, 'required' is skipped without one, 'none' takes no key. `country`
     * is where the company is based (ISO 3166 code); `keyLink` is where a key is
     * issued and `priceLink` the official pricing or quota page; `note` adds
     * one engine-specific line. Quotas and links checked 2026-11-17 against the
     * official pages.
     */
    const ENGINES = [
      { id: 'you', country: 'US', name: 'You.com', mode: 'optional', refs: ['YDC_API_KEY'], keyLink: 'https://you.com/platform', priceLink: 'https://you.com/plans' },
      { id: 'parallel', country: 'US', name: 'Parallel', mode: 'optional', refs: ['PARALLEL_API_KEY'], keyLink: 'https://platform.parallel.ai/', priceLink: 'https://parallel.ai/pricing' },
      { id: 'keenable', country: 'US', name: 'Keenable', mode: 'optional', refs: ['KEENABLE_API_KEY'], keyLink: 'https://app.keenable.ai/console', priceLink: 'https://keenable.ai/pricing' },
      { id: 'tavily', country: 'IL', owner: true, name: 'Tavily', mode: 'optional', refs: ['TAVILY_API_KEY'], keyLink: 'https://app.tavily.com', priceLink: 'https://www.tavily.com/pricing' },
      { id: 'tinyfish', country: 'US', name: 'TinyFish', mode: 'required', refs: ['TINYFISH_API_KEY'], keyLink: 'https://agent.tinyfish.ai/api-keys', priceLink: 'https://www.tinyfish.ai/pricing' },
      { id: 'jina', country: 'DE', owner: true, name: 'Jina', mode: 'required', refs: ['JINA_API_KEY'], keyLink: 'https://jina.ai/api-dashboard', priceLink: 'https://jina.ai/api-dashboard/pricing' },
      { id: 'firecrawl', country: 'US', name: 'Firecrawl', note: true, mode: 'optional', refs: ['FIRECRAWL_API_KEY'], keyLink: 'https://www.firecrawl.dev/app/api-keys', priceLink: 'https://www.firecrawl.dev/pricing' },
      { id: 'naver', country: 'KR', name: 'Naver', note: true, mode: 'required', refs: ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET'], keyLink: 'https://www.ncloud.com/product/applicationService/naverApiHub', priceLink: 'https://api.ncloud-docs.com/docs/naver-api-hub-search-webkr' },
      { id: 'kakao', country: 'KR', name: 'Kakao (Daum)', mode: 'required', refs: ['KAKAO_REST_API_KEY'], keyLink: 'https://developers.kakao.com/console/app', priceLink: 'https://developers.kakao.com/docs/latest/ko/getting-started/quota' },
      { id: 'bing', country: 'US', name: 'Bing', mode: 'none', refs: [], keyLink: '', priceLink: '' }
    ]
    const ALL_REFS = ENGINES.flatMap((engine) => engine.refs)
    const DEFAULT_ORDER = ENGINES.map((engine) => engine.id)
    const ENGINE_BY_ID = new Map(ENGINES.map((engine) => [engine.id, engine]))
    /** This bundle's settings namespace: its entry id in cordis.patch.yml. */
    const SETTINGS_NS = 'search-free'

    const en = {
      title: 'Search',
      summary: 'Engine order and keys. A key raises the limit, and some engines need one.',
      description: 'Choose which engines the automatic engine uses and in what order, and add an API key per engine. Leave a key empty to search without one on a small quota; a key raises the limit. Engines that need a sign-up are skipped by the automatic engine until you add a key. Keys are stored in the DSH credential store, never shown again, and apply from the next search.',
      checking: 'Checking which keys are set…',
      stillChecking: 'The key status is not available yet. Saving still works, and this line disappears once the status loads.',
      stateKeyed: 'Key set',
      statePartial: 'Partly set',
      stateKeyless: 'Keyless, small quota',
      stateNeeded: 'Key needed',
      stateNone: 'No key used',
      apiKey: 'API key',
      apiKeyOptional: 'API key (optional)',
      clientId: 'Client ID',
      clientSecret: 'Client Secret',
      placeholder: 'Paste the key',
      placeholderOptional: 'Empty: search without a key',
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
      quotaFree: 'Without a key',
      quotaKeyed: 'With a free key',
      pricing: 'Pricing and limits',
      'free.naver': 'Not available',
      'keyed.naver': '25,000 a day (all Naver search APIs together)',
      'free.kakao': 'Not available',
      'keyed.kakao': '30,000 web searches a day',
      'free.you': '100 a day',
      'keyed.you': '$10 on sign-up + $90 after verifying, for 60 days (about 20,000)',
      'free.parallel': 'Light personal use (number not published)',
      'keyed.parallel': '$5 a month with a card on file (about 5,000)',
      'free.keenable': '1,000 an hour per IP',
      'keyed.keenable': '100,000 a month',
      'free.tavily': 'A little (number not published)',
      'keyed.tavily': '1,000 credits a month (1,000 basic searches)',
      'free.tinyfish': 'Not available',
      'keyed.tinyfish': '12,000 a day (30 a minute)',
      'free.jina': 'Not available',
      'keyed.jina': '10 million tokens on a new key (about 1,000)',
      'free.firecrawl': 'A little per IP (number not published)',
      'keyed.firecrawl': '1,000 credits a month (up to 500)',
      'free.bing': 'No set limit; frequent use can be blocked',
      'brief.optional': '{free} keyless · key: {keyed}',
      'brief.required': 'Key needed · {keyed}',
      'brief.keyed': 'Key set · {keyed}',
      'brief.none': 'No key · no set limit',
      'briefFree.you': '100/day',
      'briefFree.parallel': 'light use',
      'briefFree.keenable': '1,000/hour',
      'briefFree.tavily': 'a little',
      'briefFree.firecrawl': 'a little',
      'briefKeyed.naver': '25,000/day',
      'briefKeyed.kakao': '30,000/day',
      'briefKeyed.you': '~20,000 in 60 days',
      'briefKeyed.parallel': '~5,000/month',
      'briefKeyed.keenable': '100,000/month',
      'briefKeyed.tavily': '1,000/month',
      'briefKeyed.tinyfish': '12,000/day',
      'briefKeyed.jina': '~1,000 on sign-up',
      'briefKeyed.firecrawl': '500/month',
      'note.naver': 'New keys come from NAVER API HUB (NAVER Cloud) since 2026-07-31.',
      'note.firecrawl': 'Without a key it may be refused behind a VPN or proxy.',
      'country.KR': 'Korea',
      'country.US': 'United States',
      'country.IL': 'Israel',
      'country.DE': 'Germany',
      'owner.tavily': 'acquired by Nebius, Netherlands',
      'owner.jina': 'acquired by Elastic',
      'signup.optional': 'Signing up for a key raises the limit',
      'signup.required': 'Needs a sign-up and a key',
      'signup.none': 'No sign-up',
      'pick.auto': 'Auto',
      'pick.autoDetail': 'Tries the engines in the order set on the plugin page',
      'pick.placeholder': 'Find an engine',
      'pick.empty': 'No engines',
      'pick.noResults': 'No matching engine',
      'group.auto': 'Automatic',
      'group.used': 'Used by auto, in order',
      'group.unused': 'Not used by auto',
      'group.engines': 'Engines',
      orderTitle: 'Automatic engine order',
      orderHint: 'The automatic engine (/search auto) tries the checked engines from the top. An unchecked engine is left out of auto but can still be picked by name.',
      orderReset: 'Default order',
      orderSaved: 'Saved. It applies from the next search.',
      orderFailed: 'The order could not be saved.',
      orderLoading: 'Reading the order…',
      orderUnavailable: 'The order setting is not available yet. If the plugin was just updated, restart DSH.',
      orderReadOnly: 'The settings are read-only, so the order cannot be changed here.',
      orderEmpty: 'No engine is checked, so the automatic engine will not search.',
      moveUp: 'Move {name} up',
      moveDown: 'Move {name} down',
      moved: '{name} is now number {n}.',
      keysTitle: 'Keys and limits'
    }

    // The Web client ships English and Chinese dictionaries. Keep Chinese as an
    // English fallback rather than showing missing-key markers.
    const zh = en

    const ko = {
      title: '검색',
      summary: '엔진 순서와 키예요. 키를 넣으면 한도가 늘고, 일부 엔진은 키가 있어야 써요.',
      description: '자동 엔진이 어떤 엔진을 어떤 순서로 쓸지 고르고, 엔진마다 API 키를 넣을 수 있어요. 키를 비워 두면 키 없이 적은 한도로 검색하고, 키를 넣으면 한도가 늘어요. 가입해야 쓰는 엔진은 키를 넣기 전까지 자동 엔진이 건너뛰어요. 키는 DSH 자격 증명 저장소에 보관되고 다시 표시되지 않으며, 다음 검색부터 적용돼요.',
      checking: '어떤 키가 설정됐는지 확인하는 중이에요…',
      stillChecking: '아직 키 상태를 불러오지 못했어요. 저장은 그대로 할 수 있고, 상태를 읽으면 이 안내는 사라져요.',
      stateKeyed: '키 설정됨',
      statePartial: '일부만 설정됨',
      stateKeyless: '키 없이 쓰는 중',
      stateNeeded: '키 필요',
      stateNone: '키를 쓰지 않아요',
      apiKey: 'API 키',
      apiKeyOptional: 'API 키(선택)',
      clientId: 'Client ID',
      clientSecret: 'Client Secret',
      placeholder: '키 붙여넣기',
      placeholderOptional: '비워 두면 키 없이 써요',
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
      quotaFree: '키 없이',
      quotaKeyed: '무료 키',
      pricing: '요금·한도',
      'free.naver': '쓸 수 없어요',
      'keyed.naver': '하루 25,000회(네이버 검색 API 합산)',
      'free.kakao': '쓸 수 없어요',
      'keyed.kakao': '웹문서 검색 하루 30,000회',
      'free.you': '하루 100회',
      'keyed.you': '가입 $10 + 인증 $90, 60일 동안(약 2만 회)',
      'free.parallel': '개인용 수준(숫자 비공개)',
      'keyed.parallel': '카드 등록 시 매달 $5(약 5,000회)',
      'free.keenable': 'IP당 시간당 1,000회',
      'keyed.keenable': '매달 10만 회',
      'free.tavily': '조금(숫자 비공개)',
      'keyed.tavily': '매달 1,000크레딧(기본 검색 1,000회)',
      'free.tinyfish': '쓸 수 없어요',
      'keyed.tinyfish': '하루 12,000회(분당 30회)',
      'free.jina': '쓸 수 없어요',
      'keyed.jina': '새 키에 1,000만 토큰(약 1,000회)',
      'free.firecrawl': 'IP당 조금(숫자 비공개)',
      'keyed.firecrawl': '매달 1,000크레딧(최대 500회)',
      'free.bing': '정해진 한도 없음, 자주 쓰면 막힐 수 있어요',
      'brief.optional': '키 없이 {free} · 키 넣으면 {keyed}',
      'brief.required': '키 필요 · {keyed}',
      'brief.keyed': '키 설정됨 · {keyed}',
      'brief.none': '키 없음 · 정해진 한도 없음',
      'briefFree.you': '하루 100회',
      'briefFree.parallel': '소량',
      'briefFree.keenable': '시간당 1천 회',
      'briefFree.tavily': '소량',
      'briefFree.firecrawl': '소량',
      'briefKeyed.naver': '하루 2.5만 회',
      'briefKeyed.kakao': '하루 3만 회',
      'briefKeyed.you': '60일 약 2만 회',
      'briefKeyed.parallel': '월 약 5천 회',
      'briefKeyed.keenable': '월 10만 회',
      'briefKeyed.tavily': '월 1천 회',
      'briefKeyed.tinyfish': '하루 1.2만 회',
      'briefKeyed.jina': '가입 때 약 1천 회',
      'briefKeyed.firecrawl': '월 500회',
      'note.naver': '2026-07-31부터 새 키는 NAVER API HUB(네이버 클라우드)에서 받아요.',
      'note.firecrawl': '키 없이 쓰면 VPN·프록시에서 막힐 수 있어요.',
      'country.KR': '한국',
      'country.US': '미국',
      'country.IL': '이스라엘',
      'country.DE': '독일',
      'owner.tavily': '네덜란드 Nebius가 인수',
      'owner.jina': 'Elastic이 인수',
      'signup.optional': '가입하고 키를 넣으면 한도가 늘어요',
      'signup.required': '가입하고 키를 넣어야 써요',
      'signup.none': '가입하지 않아도 돼요',
      'pick.auto': '자동',
      'pick.autoDetail': '플러그인 페이지에서 정한 순서로 써요',
      'pick.placeholder': '엔진 찾기',
      'pick.empty': '엔진이 없어요',
      'pick.noResults': '맞는 엔진이 없어요',
      'group.auto': '자동',
      'group.used': '자동에 쓰는 순서',
      'group.unused': '자동에서 뺀 엔진',
      'group.engines': '엔진',
      orderTitle: '자동 엔진 순서',
      orderHint: '자동 엔진(/search auto)은 체크한 엔진을 위에서부터 차례로 써요. 체크를 끈 엔진은 자동에서 빠지지만, 이름으로 고르면 쓸 수 있어요.',
      orderReset: '기본 순서로',
      orderSaved: '저장했어요. 다음 검색부터 적용돼요.',
      orderFailed: '순서를 저장하지 못했어요.',
      orderLoading: '순서를 읽는 중이에요…',
      orderUnavailable: '아직 순서 설정을 읽지 못했어요. 플러그인을 막 고쳤다면 DSH를 다시 켜 주세요.',
      orderReadOnly: '설정이 읽기 전용이라 여기서 순서를 바꿀 수 없어요.',
      orderEmpty: '체크한 엔진이 없어서 자동 엔진이 검색하지 않아요.',
      moveUp: '{name} 위로',
      moveDown: '{name} 아래로',
      moved: '{name}: {n}번째로 옮겼어요.',
      keysTitle: '엔진별 키와 한도'
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
      meta: { margin: 0, fontSize: 12, lineHeight: 1.5, fontWeight: 500, color: color.secondary, textWrap: 'balance' },
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
      link: { display: 'inline-flex', alignItems: 'center', minHeight: 44, minWidth: 44, color: color.link, fontSize: 13 },
      links: { display: 'flex', flexWrap: 'wrap', columnGap: 20, rowGap: 0 },
      section: { display: 'grid', gap: 8 },
      sectionTitle: { margin: '8px 0 0', fontSize: 15, fontWeight: 600, lineHeight: '24px', color: color.primary },
      quota: { display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', columnGap: 12, rowGap: 2, margin: 0, fontSize: 12, lineHeight: 1.5 },
      quotaTerm: { fontWeight: 500, color: color.secondary },
      quotaValue: { margin: 0, color: color.tertiary, textWrap: 'pretty' },
      orderList: { display: 'grid', gap: 4, maxWidth: 420, margin: 0, padding: 0, listStyle: 'none' },
      orderRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 44px 44px', alignItems: 'center', gap: 8 },
      orderLabel: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, minHeight: 44, fontSize: 14, color: color.primary, cursor: 'pointer' },
      orderBox: { width: 18, height: 18, margin: 0, flex: 'none', accentColor: color.brand, cursor: 'pointer' },
      orderRank: { display: 'inline-block', minWidth: '1.5em', color: color.tertiary, fontVariantNumeric: 'tabular-nums' },
      move: { width: 44, height: 44, padding: 0, display: 'inline-grid', placeItems: 'center', borderRadius: 8, border: `1px solid ${color.border}`, background: color.base, color: color.primary, fontSize: 16, lineHeight: 1 }
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

    /** Fill `{name}` placeholders in a dictionary string. */
    function fill(text, values) {
      return String(text).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''))
    }

    /** The flag emoji of an ISO 3166 country code, from its regional indicator letters. */
    function flagOf(code) {
      return String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65))
    }

    /** "🇰🇷 Korea", or "🇮🇱 Israel (acquired by …)" with the owner note when `full`. */
    function originText(engine, t, full = true) {
      const country = t(`country.${engine.country}`)
      const named = full && engine.owner ? `${country}(${t(`owner.${engine.id}`)})` : country
      return `${flagOf(engine.country)} ${named}`
    }

    function signupText(engine, t) {
      return t(`signup.${engine.mode}`)
    }

    /** The picker's one-line quota: keyless and keyed limits, or the keyed one once a key is set. */
    function briefText(engine, state, t) {
      if (engine.mode === 'none') return t('brief.none')
      const keyed = t(`briefKeyed.${engine.id}`)
      if (state?.key === 'stateKeyed') return fill(t('brief.keyed'), { keyed })
      if (engine.mode === 'required') return fill(t('brief.required'), { keyed })
      return fill(t('brief.optional'), { free: t(`briefFree.${engine.id}`), keyed })
    }

    /** Known engine ids, each once, in the given order. */
    function cleanOrder(raw) {
      if (!Array.isArray(raw)) return DEFAULT_ORDER.slice()
      return [...new Set(raw.map((id) => String(id).trim()))].filter((id) => ENGINE_BY_ID.has(id))
    }

    /**
     * Read the automatic engine's order from this entry's settings namespace.
     * Returns null when the Host has no settings service or no such namespace.
     */
    async function readOrder(settings) {
      if (!settings || typeof settings.describe !== 'function') return null
      const response = await settings.describe()
      if (!response?.ok) return null
      const namespaces = Array.isArray(response.value?.namespaces) ? response.value.namespaces : []
      const own = namespaces.find((entry) => String(entry?.ns) === SETTINGS_NS && Array.isArray(entry?.value?.autoOrder)) ??
        namespaces.find((entry) => Array.isArray(entry?.value?.autoOrder) && Array.isArray(entry?.value?.providers))
      if (own === undefined) return null
      return {
        ns: String(own.ns),
        revision: own.revision,
        writable: response.value?.writable !== false,
        order: cleanOrder(own.value.autoOrder)
      }
    }

    function fieldLabel(engine, index, t) {
      if (engine.id === 'naver') return index === 0 ? t('clientId') : t('clientSecret')
      return engine.mode === 'optional' ? t('apiKeyOptional') : t('apiKey')
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
          h('h4', { id: headingId, style: styles.name }, engine.name),
          state === null ? null : h('span', { style: chipStyle(state.tone) }, t(state.key))
        ),
        h('p', { style: styles.meta }, `${originText(engine, t)} · ${signupText(engine, t)}`),
        h(
          'dl',
          { style: styles.quota },
          h('dt', { style: styles.quotaTerm }, t('quotaFree')),
          h('dd', { style: styles.quotaValue }, t(`free.${engine.id}`)),
          ...(engine.mode === 'none' ? [] : [
            h('dt', { key: 'kt', style: styles.quotaTerm }, t('quotaKeyed')),
            h('dd', { key: 'kv', style: styles.quotaValue }, t(`keyed.${engine.id}`))
          ])
        ),
        engine.note ? h('p', { style: styles.hint }, t(`note.${engine.id}`)) : null,
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
              placeholder: engine.mode === 'optional' ? t('placeholderOptional') : t('placeholder'),
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
        engine.keyLink || engine.priceLink
          ? h(
            'div',
            { style: styles.links },
            engine.keyLink
              ? h('a', { href: engine.keyLink, target: '_blank', rel: 'noreferrer', style: styles.link, 'aria-label': `${t('getKey')}: ${engine.name}` }, `${t('getKey')} ↗`)
              : null,
            engine.priceLink
              ? h('a', { href: engine.priceLink, target: '_blank', rel: 'noreferrer', style: styles.link, 'aria-label': `${t('pricing')}: ${engine.name}` }, `${t('pricing')} ↗`)
              : null
          )
          : null
      )
    }

    /**
     * Which engines the automatic engine uses and in what order. Checked
     * engines are listed first in their order; unchecked ones follow in the
     * default order. Every change is saved at once, fenced by the revision of
     * the last read so a change made elsewhere is not overwritten.
     */
    function AutoOrderSection({ settings, t }) {
      const [snapshot, setSnapshot] = React.useState(null)
      const [failed, setFailed] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [message, setMessage] = React.useState(null)
      const [focusId, setFocusId] = React.useState(null)
      const [reload, setReload] = React.useState(0)

      React.useEffect(() => {
        let alive = true
        let timer
        const started = Date.now()
        const attempt = async () => {
          if (!alive) return
          let next = null
          try {
            next = await readOrder(settings)
          } catch {}
          if (!alive) return
          if (next !== null) {
            setSnapshot(next)
            setFailed(false)
            return
          }
          if (Date.now() - started < READY_TIMEOUT_MS) timer = setTimeout(attempt, RETRY_DELAY_MS)
          else setFailed(true)
        }
        attempt()
        return () => {
          alive = false
          clearTimeout(timer)
        }
      }, [settings, reload])

      // Moving a row moves its DOM node, which drops focus; put it back on the same control.
      React.useEffect(() => {
        if (focusId === null || typeof document === 'undefined') return
        document.getElementById(focusId)?.focus?.()
        setFocusId(null)
      }, [focusId])

      const titleId = 'free-search-order-title'
      const header = h(
        'div',
        { style: { display: 'grid', gap: 4 } },
        h('h3', { id: titleId, style: styles.sectionTitle }, t('orderTitle')),
        h('p', { style: styles.hint }, t('orderHint'))
      )
      if (snapshot === null) {
        return h('section', { style: styles.section, 'aria-labelledby': titleId }, header,
          h('p', { role: 'status', style: styles.hint }, failed ? t('orderUnavailable') : t('orderLoading')))
      }

      const order = snapshot.order
      const rest = DEFAULT_ORDER.filter((id) => !order.includes(id))
      // Controls stay enabled while a save runs (a disabled control drops focus);
      // the handlers ignore clicks until it lands.
      const locked = !snapshot.writable
      const isDefault = order.length === DEFAULT_ORDER.length && order.every((id, index) => id === DEFAULT_ORDER[index])

      const save = async (next, announce) => {
        if (typeof settings?.update !== 'function') return setMessage({ tone: 'danger', text: t('orderReadOnly') })
        const previous = snapshot
        setSnapshot({ ...snapshot, order: next })
        setBusy(true)
        setMessage(null)
        try {
          const response = await settings.update(snapshot.ns, { autoOrder: next }, snapshot.revision)
          if (response && response.ok === false) throw new Error(response.error?.message ?? '')
          setMessage({ tone: 'success', text: announce ? `${announce} ${t('orderSaved')}` : t('orderSaved') })
        } catch (error) {
          setSnapshot(previous)
          const detail = typeof error?.message === 'string' ? error.message.trim() : ''
          setMessage({ tone: 'danger', text: detail ? `${t('orderFailed')} (${detail})` : t('orderFailed') })
        } finally {
          setBusy(false)
          // Read the new revision (or the value someone else saved) for the next change.
          setReload((value) => value + 1)
        }
      }

      const toggle = (id) => {
        if (busy) return
        // The row moves between the checked and unchecked parts; keep focus on its box.
        setFocusId(`free-search-order-${id}`)
        const next = order.includes(id) ? order.filter((other) => other !== id) : [...order, id]
        save(next)
      }
      const move = (id, step) => {
        if (busy) return
        const from = order.indexOf(id)
        const to = from + step
        if (from < 0 || to < 0 || to >= order.length) return
        const next = order.slice()
        next.splice(from, 1)
        next.splice(to, 0, id)
        // Keep focus on the arrow pressed, or on the other arrow once this one reaches the end.
        const edge = (step < 0 && to === 0) || (step > 0 && to === next.length - 1)
        setFocusId(`free-search-order-${id}-${(step < 0) !== edge ? 'up' : 'down'}`)
        save(next, fill(t('moved'), { name: ENGINE_BY_ID.get(id).name, n: to + 1 }))
      }

      const row = (id, rank) => {
        const engine = ENGINE_BY_ID.get(id)
        const checked = rank > 0
        const boxId = `free-search-order-${id}`
        const arrow = (step, label, glyph, disabled) => h('button', {
          type: 'button',
          id: `${boxId}-${step < 0 ? 'up' : 'down'}`,
          'aria-label': fill(t(label), { name: engine.name }),
          disabled,
          onClick: () => move(id, step),
          style: { ...styles.move, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1 }
        }, h('span', { 'aria-hidden': 'true' }, glyph))
        return h(
          'li',
          { key: id, style: styles.orderRow },
          h(
            'label',
            { htmlFor: boxId, style: { ...styles.orderLabel, color: checked ? color.primary : color.tertiary } },
            h('input', { id: boxId, type: 'checkbox', checked, disabled: locked, onChange: () => toggle(id), style: styles.orderBox }),
            h('span', { style: styles.orderRank, 'aria-hidden': 'true' }, checked ? `${rank}.` : ''),
            h('span', { 'aria-hidden': 'true' }, flagOf(engine.country)),
            h('span', { style: { whiteSpace: 'nowrap' } }, engine.name)
          ),
          checked ? arrow(-1, 'moveUp', '↑', locked || rank === 1) : h('span', { 'aria-hidden': 'true' }),
          checked ? arrow(1, 'moveDown', '↓', locked || rank === order.length) : h('span', { 'aria-hidden': 'true' })
        )
      }

      return h(
        'section',
        { style: styles.section, 'aria-labelledby': titleId },
        header,
        snapshot.writable ? null : h('p', { style: styles.hint }, t('orderReadOnly')),
        h('ol', { style: styles.orderList }, ...order.map((id, index) => row(id, index + 1)), ...rest.map((id) => row(id, 0))),
        order.length === 0 ? h('p', { style: messageStyle('danger') }, t('orderEmpty')) : null,
        h(
          'div',
          { style: { ...styles.buttons, gridTemplateColumns: 'minmax(0, 1fr)', maxWidth: 156 } },
          h('button', { type: 'button', onClick: () => { if (!busy) save(DEFAULT_ORDER.slice()) }, disabled: locked || isDefault, style: buttonStyle('secondary', locked || isDefault) }, t('orderReset'))
        ),
        h('div', { role: 'status', 'aria-live': 'polite' }, message === null ? null : h('p', { style: messageStyle(message.tone) }, message.text))
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
        h(AutoOrderSection, { settings: props.settings, t }),
        h('h3', { style: styles.sectionTitle }, t('keysTitle')),
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

    /** The host command this bundle registers; a bare `/search` opens the engine picker. */
    const COMMAND = 'search'
    const AUTO = 'auto'

    /**
     * Options of the bare `/search` picker: the automatic engine, then the
     * engines auto uses in the user's order, then the ones left out of auto.
     * Each shows its flag, country and short quota.
     */
    async function pickerOptions(credentials, settings, t) {
      const [info, saved] = await Promise.all([
        (async () => {
          try {
            const response = await credentials?.describe?.(ALL_REFS)
            return response?.ok ? response.value ?? {} : null
          } catch {
            return null
          }
        })(),
        readOrder(settings).catch(() => null)
      ])
      const option = (engine, group) => ({
        id: engine.id,
        label: engine.name,
        detail: `${originText(engine, t, false)} · ${briefText(engine, engineState(engine, info), t)}`,
        group
      })
      const auto = { id: AUTO, label: t('pick.auto'), detail: t('pick.autoDetail'), group: { name: 'auto', label: t('group.auto') }, active: true }
      if (saved === null) {
        const engines = { name: 'engines', label: t('group.engines') }
        return [auto, ...ENGINES.map((engine) => option(engine, engines))]
      }
      const used = { name: 'used', label: t('group.used') }
      const unused = { name: 'unused', label: t('group.unused') }
      return [
        auto,
        ...saved.order.map((id) => option(ENGINE_BY_ID.get(id), used)),
        ...ENGINES.filter((engine) => !saved.order.includes(engine.id)).map((engine) => option(engine, unused))
      ]
    }

    /**
     * Put `/search <engine> ` in the composer of the session that opened the
     * picker, so the user only types the question. The composer then submits it
     * as an ordinary `/search` line.
     */
    function fillDraft(ctx, sessionId, engineId) {
      if (typeof ctx.get !== 'function') return
      const actx = ctx.get('sessions')?.scope?.(sessionId)
      const input = actx === undefined ? undefined : ctx.get('conversation')?.input?.for?.(actx)
      if (input === undefined || typeof input.setDraft !== 'function') return
      input.setDraft(`/${COMMAND} ${engineId} `)
      input.focus?.()
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.credentials', 'remote.settings'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        // The Host keeps `/search <engine> <question>`; a bare `/search` from the
        // menu or the composer opens an engine picker instead, so the engine names
        // need not be remembered.
        // Older Hosts without the command UI service keep the typed form only.
        if (typeof ctx.inject === 'function') ctx.inject(['commandUi'], (scope) => {
          scope.effect(() => scope.commandUi.decorate({
            name: COMMAND,
            available: () => true,
            ui: {
              kind: 'popupSelect',
              searchLabels: () => ({ placeholder: t('pick.placeholder'), empty: t('pick.empty'), noResults: t('pick.noResults') }),
              options: () => pickerOptions(ctx.remote.credentials, ctx.remote.settings, t),
              onSelect: (option, session) => { fillDraft(ctx, session.sessionId, option.id) }
            }
          }), 'search-free: /search engine picker')
        })
        ctx.effect(() => ctx.locale.register(NS, { en, zh, ko }), 'free-search-settings: dictionaries')
        // The bundle's own detail page renders this keyed config section.
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config',
          key: '@lyngmn/dsh-search-free',
          locale: NS,
          inject: () => ({ credentials: ctx.remote.credentials, settings: ctx.remote.settings })
        }, FreeSearchSettingsCard))
      }
    }
  }
})
