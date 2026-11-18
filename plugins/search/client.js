/**
 * Browser half of the Search bundle (@lyngmn/dsh-search).
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
  id: '@lyngmn/dsh-search',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'searchSettings'
    /** How long the card waits for the Host before it shows "still checking". */
    const READY_TIMEOUT_MS = 8000
    /** Retry delay while the Host reports no credential service yet. */
    const RETRY_DELAY_MS = 1500

    /**
     * Engines in the default order of the automatic engine, which is also the
     * order the key list uses. `mode`: 'optional' works without
     * a key, 'required' is skipped without one, 'none' takes no key. `country`
     * is where the company is based (ISO 3166 code); `keyLink` is where a key is
     * issued and `priceLink` the official pricing or quota page; `results` is
     * how many results one request returns (same numbers as RESULT_LIMITS in
     * search-core.js); `note` adds
     * one engine-specific line. Quotas and links checked 2026-11-17 against the
     * official pages.
     */
    /** Let a long `A·B·C` list wrap after a dot instead of moving as one word. */
    const breakAfterDots = (text) => text.replaceAll('·', '·\u200b')
    /** Text with `command` spans in a fixed-width face, like inline code in chat. */
    function rich(text) {
      return String(text).split('`').map((part, index) => (index % 2 === 1 ? h('code', { key: index, style: styles.code }, part) : part))
    }
    /**
     * Commands the card shows as examples, each with what it does. The command
     * stays the same in every language; the question is a sample.
     */
    const COMMAND_EXAMPLES = [
      ['example.ko', '/search ko 서울 날씨'],
      ['example.koGroup', '/search ko-group 서울 날씨'],
      ['example.koSeq', '/search ko-seq 서울 날씨'],
      ['example.count', '/search naver 30 서울 날씨'],
      ['example.max', '/search exa max 서울 날씨']
    ]
    /** Dictionary keys of the card's engine list, one line each. */
    const ENGINE_LIST_KEYS = ['engineKeyless', 'engineKeyed', 'engineCombined']
    const ENGINES = [
      { id: 'exa', costNote: true, country: 'US', name: 'Exa', note: true, mode: 'required', results: { max: 100, param: true }, refs: ['EXA_API_KEY'], keyLink: 'https://dashboard.exa.ai/api-keys', priceLink: 'https://exa.ai/pricing' },
      { id: 'brave', country: 'US', name: 'Brave', note: true, mode: 'required', results: { max: 20, param: true }, refs: ['BRAVE_API_KEY'], keyLink: 'https://api-dashboard.search.brave.com/register', priceLink: 'https://brave.com/search/api/' },
      { id: 'you', country: 'US', name: 'You.com', mode: 'optional', results: { max: 100, keylessMax: 50, param: true }, refs: ['YDC_API_KEY'], keyLink: 'https://you.com/platform', priceLink: 'https://you.com/plans' },
      { id: 'parallel', costNote: true, country: 'US', name: 'Parallel', mode: 'optional', results: { max: 20, keylessMax: 10, param: true, keylessParam: false }, refs: ['PARALLEL_API_KEY'], keyLink: 'https://platform.parallel.ai/', priceLink: 'https://parallel.ai/pricing' },
      { id: 'keenable', country: 'US', name: 'Keenable', mode: 'optional', results: { max: 50, param: true }, refs: ['KEENABLE_API_KEY'], keyLink: 'https://app.keenable.ai/console', priceLink: 'https://keenable.ai/pricing' },
      { id: 'tavily', country: 'IL', owner: true, name: 'Tavily', mode: 'optional', results: { max: 20, param: true }, refs: ['TAVILY_API_KEY'], keyLink: 'https://app.tavily.com', priceLink: 'https://www.tavily.com/pricing' },
      { id: 'tinyfish', country: 'US', name: 'TinyFish', mode: 'required', results: { max: 10, param: false }, refs: ['TINYFISH_API_KEY'], keyLink: 'https://agent.tinyfish.ai/api-keys', priceLink: 'https://www.tinyfish.ai/pricing' },
      { id: 'jina', costNote: true, country: 'DE', owner: true, name: 'Jina', mode: 'required', results: { max: 20, param: true }, refs: ['JINA_API_KEY'], keyLink: 'https://jina.ai/api-dashboard', priceLink: 'https://jina.ai/api-dashboard/pricing' },
      { id: 'firecrawl', costNote: true, country: 'US', name: 'Firecrawl', note: true, mode: 'optional', results: { max: 100, param: true }, refs: ['FIRECRAWL_API_KEY'], keyLink: 'https://www.firecrawl.dev/app/api-keys', priceLink: 'https://www.firecrawl.dev/pricing' },
      { id: 'naver', country: 'KR', name: 'Naver', note: true, mode: 'required', results: { max: 100, param: true }, refs: ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET'], keyLink: 'https://www.ncloud.com/product/applicationService/naverApiHub', priceLink: 'https://api.ncloud-docs.com/docs/naver-api-hub-search-webkr' },
      { id: 'kakao', country: 'KR', name: 'Kakao (Daum)', note: true, mode: 'required', results: { max: 50, param: true }, refs: ['KAKAO_REST_API_KEY'], keyLink: 'https://developers.kakao.com/console/app', priceLink: 'https://developers.kakao.com/docs/latest/ko/getting-started/quota' },
      { id: 'bing', country: 'US', name: 'Bing', mode: 'none', results: { max: 10, param: false }, refs: [], keyLink: '', priceLink: '' }
    ]
    const ALL_REFS = ENGINES.flatMap((engine) => engine.refs)
    const DEFAULT_ORDER = ENGINES.map((engine) => engine.id)
    /** Results per engine when the plugin page sets none; the server uses the same number. */
    const DEFAULT_COUNT = 10
    const ENGINE_BY_ID = new Map(ENGINES.map((engine) => [engine.id, engine]))
    /** This bundle's settings namespace: its entry id in cordis.patch.yml. */
    const SETTINGS_NS = 'search'

    const en = {
      title: 'Search',
      summary: 'Engine order and keys. A key raises the limit, and some engines need one.',
      engineKeyless: 'Engines without a key: You.com, Parallel, Keenable, Tavily, Firecrawl, Bing',
      engineKeyed: 'Engines that need a key: Exa, Brave, Naver, Kakao (Daum), TinyFish, Jina',
      engineCombined: 'Combined: Korea (Naver + Kakao), in three ways below',
      commandsTitle: 'Engine and count for one search',
      commandsHint: 'Type these in the chat. A count is 1 to 100; above an engine\'s maximum it takes the maximum.',
      'example.ko': 'Naver and Kakao together, pages both found first',
      'example.koGroup': 'Naver and Kakao together, listed engine by engine',
      'example.koSeq': 'Naver first, Kakao only when Naver fails or finds nothing',
      'example.count': '30 results, this search only',
      'example.max': 'as many as the engine gives, this search only',
      webTitle: 'Engine for web search',
      webHint: 'The engine the agent\'s `web_search` uses. It is the same setting as “Web search and fetch” in DSH settings, so a change on either page shows on the other.',
      webLabel: 'Web search engine',
      webDefault: 'DSH default',
      webMissing: '{id} (not registered now)',
      webSaving: 'Saving.',
      webSaved: 'Saved. Web search engine: {name}',
      webFailed: 'Could not save the web search engine. Try again.',
      webReadOnly: 'The profile fixes this setting, so it cannot be changed here.',
      webLoading: 'Reading the web search setting.',
      webUnavailable: 'This DSH version cannot change the web search engine here. Use “Web search and fetch” in DSH settings.',
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
      restApiKey: 'REST API key',
      storedKey: 'Saved key:',
      storedLabel: 'starts with {head} and ends with {tail}',
      storedHidden: 'hidden in full because it is short',
      storedElsewhere: 'set outside this page (environment or .env)',
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
      'free.exa': 'Not available',
      'keyed.exa': '$10 in credits a month (about 1,400 searches)',
      'free.brave': 'Not available',
      'keyed.brave': '$5 in credits a month (about 1,000 searches)',
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
      'briefKeyed.exa': '~1,400/month',
      'briefKeyed.brave': '~1,000/month',
      'briefKeyed.kakao': '30,000/day',
      'briefKeyed.you': '~20,000 in 60 days',
      'briefKeyed.parallel': '~5,000/month',
      'briefKeyed.keenable': '100,000/month',
      'briefKeyed.tavily': '1,000/month',
      'briefKeyed.tinyfish': '12,000/day',
      'briefKeyed.jina': '~1,000 on sign-up',
      'briefKeyed.firecrawl': '500/month',
      'note.naver': 'New keys come from NAVER API HUB (NAVER Cloud) since 2026-07-31.',
      'note.exa': 'A key saved in `~/.dsh/exa-api-key` also works.',
      'note.brave': 'A key saved in `~/.dsh/brave-api-key` also works.',
      'note.firecrawl': 'Without a key it may be refused behind a VPN or proxy.',
      'note.kakao': 'In Kakao Developers, open your app → Platform keys and copy the "REST API key". The admin, JavaScript and native app keys do not work here.',
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
      'pick.korea': 'Korea (Naver + Kakao)',
      'pick.koreaDetail': 'Searches Naver and Kakao together',
      'pick.koreaReady': 'Naver and Kakao together · uses the keys set',
      'pick.koreaNeedsKey': 'Needs a Naver or Kakao key',
      'pick.koreaGroup': 'Korea by engine',
      'pick.koreaGroupDetail': 'Naver and Kakao together, listed engine by engine',
      'pick.koreaSeq': 'Korea in turn',
      'pick.koreaSeqDetail': 'Naver first, then Kakao when Naver finds nothing',
      'pick.placeholder': 'Find an engine',
      'pick.empty': 'No engines',
      'pick.noResults': 'No matching engine',
      'group.auto': 'Automatic',
      'group.used': 'Used by auto, in order',
      'group.unused': 'Not used by auto',
      'group.engines': 'Engines',
      orderTitle: 'Automatic engine order',
      orderHint: 'The automatic engine (`/search auto`) tries the checked engines from the top. An unchecked engine is left out of auto but can still be picked by name.',
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
      keysTitle: 'Keys and limits',
      countLabel: 'Results per search',
      countRangeHint: '1 to {max} · default {def}',
      countCutHint: '1 to {max} · default {def} (the API takes no count; extra results are cut)',
      countKeyless: 'up to {n} without a key',
      countKeylessFixed: 'fixed at {n} without a key',
      'countCost.parallel': 'With a key, more than 10 results add $1 per 1,000 searches.',
      'countCost.exa': 'Up to 10 results are in the base price; each further result costs $1 per 1,000.',
      'countCost.jina': 'Each search uses tokens (from 10,000).',
      'countCost.firecrawl': 'Every 10 results use 2 credits.',
      countRange: 'Enter a whole number from 1 to {max}.',
      countSaved: 'Saved: {n} results from the next search.',
      countFailed: 'The number could not be saved.'
    }

    // The Web client ships English and Chinese dictionaries. Keep Chinese as an
    // English fallback rather than showing missing-key markers.
    const zh = en

    const ko = {
      title: '검색',
      summary: '엔진 순서와 키예요. 키를 넣으면 한도가 늘고, 일부 엔진은 키가 있어야 써요.',
      engineKeyless: '키 없이 쓰는 엔진: You.com·Parallel·Keenable·Tavily·Firecrawl·Bing',
      engineKeyed: '키가 있어야 쓰는 엔진: Exa·Brave·네이버·카카오(다음)·TinyFish·Jina',
      engineCombined: '묶음 엔진: 한국(네이버+카카오), 아래 세 가지 방식',
      commandsTitle: '이번 검색만 엔진·개수 정하기',
      commandsHint: '대화창에 이렇게 적어요. 개수는 1~100이고, 엔진 최대보다 크면 최대만큼 가져와요.',
      'example.ko': '네이버·카카오를 함께 찾고, 둘 다 찾은 결과를 먼저 보여 줘요',
      'example.koGroup': '네이버·카카오를 함께 찾고, 엔진별로 묶어 보여 줘요',
      'example.koSeq': '네이버로 먼저 찾고, 실패하거나 결과가 없을 때만 카카오를 써요',
      'example.count': '이번 검색만 30개',
      'example.max': '이번 검색만 엔진이 주는 최대만큼',
      webTitle: '웹 검색에 쓰는 엔진',
      webHint: '에이전트의 `web_search`가 쓰는 엔진이에요. DSH 설정의 ‘웹 검색과 가져오기’와 같은 값이라, 어느 쪽에서 바꿔도 다른 쪽에 바로 보여요.',
      webLabel: '웹 검색 엔진',
      webDefault: 'DSH 기본값',
      webMissing: '{id}(지금 등록되지 않음)',
      webSaving: '저장하고 있어요.',
      webSaved: '저장했어요. 웹 검색 엔진: {name}',
      webFailed: '웹 검색 엔진을 저장하지 못했어요. 다시 해 주세요.',
      webReadOnly: '프로필이 이 값을 고정해서 여기서는 바꿀 수 없어요.',
      webLoading: '웹 검색 설정을 읽고 있어요.',
      webUnavailable: '이 DSH 버전에서는 여기서 바꿀 수 없어요. DSH 설정의 ‘웹 검색과 가져오기’에서 바꿔 주세요.',
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
      restApiKey: 'REST API 키',
      storedKey: '저장된 키:',
      storedLabel: '{head}로 시작하고 {tail}로 끝나요',
      storedHidden: '짧아서 모두 가렸어요',
      storedElsewhere: '이 페이지 밖(환경 변수나 .env)에서 설정됐어요',
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
      'free.exa': '쓸 수 없어요',
      'keyed.exa': '매달 10달러 크레딧(검색 약 1,400회)',
      'free.brave': '쓸 수 없어요',
      'keyed.brave': '매달 5달러 크레딧(검색 약 1,000회)',
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
      'briefKeyed.exa': '월 약 1,400회',
      'briefKeyed.brave': '월 약 1천 회',
      'briefKeyed.kakao': '하루 3만 회',
      'briefKeyed.you': '60일 약 2만 회',
      'briefKeyed.parallel': '월 약 5천 회',
      'briefKeyed.keenable': '월 10만 회',
      'briefKeyed.tavily': '월 1천 회',
      'briefKeyed.tinyfish': '하루 1.2만 회',
      'briefKeyed.jina': '가입 때 약 1천 회',
      'briefKeyed.firecrawl': '월 500회',
      'note.naver': '2026-07-31부터 새 키는 NAVER API HUB(네이버 클라우드)에서 받아요.',
      'note.exa': '`~/.dsh/exa-api-key` 파일에 넣은 키도 읽어요.',
      'note.brave': '`~/.dsh/brave-api-key` 파일에 넣은 키도 읽어요.',
      'note.firecrawl': '키 없이 쓰면 VPN·프록시에서 막힐 수 있어요.',
      'note.kakao': '카카오 디벨로퍼스에서 앱 → 플랫폼 키 페이지의 "REST API 키"를 복사해 넣어요. 어드민 키·JavaScript 키·네이티브 앱 키는 쓰지 않아요.',
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
      'pick.korea': '한국(네이버+카카오)',
      'pick.koreaDetail': '네이버와 카카오를 함께 검색해요',
      'pick.koreaReady': '네이버·카카오 함께 · 넣은 키로 검색',
      'pick.koreaNeedsKey': '네이버나 카카오 키가 필요해요',
      'pick.koreaGroup': '한국 엔진별',
      'pick.koreaGroupDetail': '네이버·카카오 함께 · 엔진별로 묶어 보여 줘요',
      'pick.koreaSeq': '한국 차례로',
      'pick.koreaSeqDetail': '네이버 먼저 · 없으면 카카오',
      'pick.placeholder': '엔진 찾기',
      'pick.empty': '엔진이 없어요',
      'pick.noResults': '맞는 엔진이 없어요',
      'group.auto': '자동',
      'group.used': '자동에 쓰는 순서',
      'group.unused': '자동에서 뺀 엔진',
      'group.engines': '엔진',
      orderTitle: '자동 엔진 순서',
      orderHint: '자동 엔진(`/search auto`)은 체크한 엔진을 위에서부터 차례로 써요. 체크를 끈 엔진은 자동에서 빠지지만, 이름으로 고르면 쓸 수 있어요.',
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
      keysTitle: '엔진별 키와 한도',
      countLabel: '가져올 결과 수',
      countRangeHint: '1~{max}개 · 기본 {def}개',
      countCutHint: '1~{max}개 · 기본 {def}개(API에 개수 설정이 없어 받은 뒤 잘라요)',
      countKeyless: '키 없이는 최대 {n}개',
      countKeylessFixed: '키 없이는 {n}개로 정해져 있어요',
      'countCost.parallel': '키를 넣고 10개를 넘기면 1,000번 검색마다 $1이 더 붙어요.',
      'countCost.exa': '10개까지는 기본 요금이고, 넘는 결과는 1천 개당 1달러가 더 붙어요.',
      'countCost.jina': '검색마다 토큰을 써요(1만 토큰부터).',
      'countCost.firecrawl': '결과 10개마다 2크레딧을 써요.',
      countRange: '1부터 {max}까지 정수로 넣어 주세요.',
      countSaved: '저장했어요. 다음 검색부터 {n}개를 가져와요.',
      countFailed: '개수를 저장하지 못했어요.'
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
      danger: 'var(--dsw-alias-label-danger, #b91c1c)',
      // A tint of the text colour, so the chip shows on any DSH background in both themes.
      codeBg: 'color-mix(in srgb, currentColor 10%, transparent)'
    }

    const styles = {
      card: { display: 'grid', gap: 12, maxWidth: 640, wordBreak: 'keep-all', overflowWrap: 'anywhere' },
      intro: { margin: 0, fontSize: 13, lineHeight: 1.6, color: color.secondary },
      engineList: { margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 2 },
      exampleList: { margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 },
      code: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '0.92em',
        padding: '1px 4px',
        borderRadius: 4,
        background: color.codeBg,
        color: color.primary,
        whiteSpace: 'nowrap'
      },
      listLine: { margin: 0, fontSize: 13, lineHeight: 1.6, color: color.secondary, textWrap: 'pretty', wordBreak: 'keep-all', overflowWrap: 'anywhere' },
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
      links: { display: 'flex', flexWrap: 'wrap', columnGap: 20, rowGap: 4 },
      section: { display: 'grid', gap: 8 },
      srOnly: { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 },
      masked: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: color.secondary, overflowWrap: 'anywhere', wordBreak: 'break-all' },
      countRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4 },
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

    /** The site a link opens, without a leading "www.", so similar pages are told apart. */
    function hostOf(link) {
      try {
        return new URL(link).hostname.replace(/^www\./, '')
      } catch {
        return ''
      }
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

    /**
     * The engines of 1.1, before Exa and Brave joined; the same list as
     * LEGACY_KNOWN_ENGINES in search-core.js.
     */
    const LEGACY_KNOWN = ['you', 'parallel', 'keenable', 'tavily', 'tinyfish', 'jina', 'firecrawl', 'naver', 'kakao', 'bing']

    /**
     * Known engine ids, each once, in the given order. Engines that did not
     * exist when the order was saved (`known`) join it at their default place,
     * the same way the server reads it (normalizeOrder in search-core.js).
     */
    function cleanOrder(raw, known) {
      if (!Array.isArray(raw)) return DEFAULT_ORDER.slice()
      const order = [...new Set(raw.map((id) => String(id).trim()))].filter((id) => ENGINE_BY_ID.has(id))
      if (raw.length === 0) return order
      const seen = new Set(Array.isArray(known) && known.length > 0 ? known.map((id) => String(id).trim()) : LEGACY_KNOWN)
      for (const [index, id] of DEFAULT_ORDER.entries()) {
        if (seen.has(id) || order.includes(id)) continue
        const next = DEFAULT_ORDER.slice(index + 1).find((other) => order.includes(other))
        order.splice(next === undefined ? order.length : order.indexOf(next), 0, id)
      }
      return order
    }

    /** Per-engine result counts as saved: whole numbers of 1 or more, known engines only. */
    function cleanCounts(raw) {
      const counts = {}
      if (raw === null || typeof raw !== 'object') return counts
      for (const [id, value] of Object.entries(raw)) {
        if (ENGINE_BY_ID.has(id) && Number.isInteger(value) && value >= 1) counts[id] = value
      }
      return counts
    }

    /** The count an engine uses: the saved one within its bounds, else the default. */
    function countOf(engine, counts) {
      const saved = counts?.[engine.id]
      return Number.isInteger(saved) && saved >= 1 ? Math.min(saved, engine.results.max) : Math.min(DEFAULT_COUNT, engine.results.max)
    }

    /**
     * Read this entry's settings: the automatic engine's order and the
     * per-engine result counts. Returns null when the Host has no settings
     * service or no such namespace.
     */
    async function readSettings(settings) {
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
        order: cleanOrder(own.value.autoOrder, own.value.autoKnown),
        counts: cleanCounts(own.value.counts)
      }
    }

    /**
     * The card's view of this entry's settings, shared by the order list and
     * the count fields. Writes run one at a time; each reads the latest
     * revision first and builds its patch from that read, so two sections
     * saving close together do not undo each other.
     */
    function useBundleSettings(settings) {
      const [snapshot, setSnapshot] = React.useState(null)
      const [failed, setFailed] = React.useState(false)
      const [queue] = React.useState(() => ({ tail: Promise.resolve() }))

      React.useEffect(() => {
        let alive = true
        let timer
        const started = Date.now()
        const attempt = async () => {
          if (!alive) return
          let next = null
          try {
            next = await readSettings(settings)
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
      }, [settings])

      /** Save `patchFor(latest)`; resolves once saved and re-read, rejects with the Host's message. */
      const write = (patchFor) => {
        const run = queue.tail.then(async () => {
          if (typeof settings?.update !== 'function') throw new Error('')
          const latest = await readSettings(settings)
          if (latest === null) throw new Error('')
          try {
            const response = await settings.update(latest.ns, patchFor(latest), latest.revision)
            if (response && response.ok === false) throw new Error(response.error?.message ?? '')
          } finally {
            // Show what was saved, or what someone else saved meanwhile.
            const after = await readSettings(settings).catch(() => null)
            if (after !== null) setSnapshot(after)
          }
        })
        queue.tail = run.catch(() => {})
        return run
      }

      return { snapshot, failed, write }
    }

    /**
     * What the card says about a stored key. The Host's file store sends a
     * masked preview (first five and last four characters, the rest as •; all
     * • when the key is too short to show any); the key itself never reaches
     * the card.
     */
    function storedKeyView(view, t) {
      if (view?.configured !== true) return null
      const masked = typeof view.masked === 'string' && view.masked !== '' ? view.masked : null
      if (masked === null) return { text: t('storedElsewhere'), label: t('storedElsewhere') }
      const head = masked.match(/^[^•]*/)[0]
      const tail = masked.match(/[^•]*$/)[0]
      const label = head === '' && tail === '' ? t('storedHidden') : fill(t('storedLabel'), { head, tail })
      return { text: masked, label, mono: true }
    }

    function fieldLabel(engine, index, t) {
      if (engine.id === 'naver') return index === 0 ? t('clientId') : t('clientSecret')
      if (engine.id === 'kakao') return t('restApiKey')
      return engine.mode === 'optional' ? t('apiKeyOptional') : t('apiKey')
    }

    /** "1~100 · default 10", with the keyless bound and a note when the API takes no count. */
    function countHint(engine, t) {
      const { max, keylessMax, param, keylessParam } = engine.results
      const parts = [fill(t(param ? 'countRangeHint' : 'countCutHint'), { max, def: Math.min(DEFAULT_COUNT, max) })]
      if (keylessMax !== undefined) parts.push(fill(t(keylessParam === false ? 'countKeylessFixed' : 'countKeyless'), { n: keylessMax }))
      return parts.join(' · ')
    }

    /**
     * How many results this engine fetches. Saved when the field is left or
     * Enter is pressed; the engine's own maximum is shown next to it.
     */
    function CountField({ engine, store, t }) {
      const saved = store.snapshot === null ? null : countOf(engine, store.snapshot.counts)
      const [draft, setDraft] = React.useState(null)
      const [message, setMessage] = React.useState(null)
      const inputId = `dsh-search-${engine.id}-count`
      const hintId = `${inputId}-hint`
      const { max } = engine.results
      const shown = draft ?? (saved === null ? '' : String(saved))
      const locked = store.snapshot === null || !store.snapshot.writable

      const commit = async () => {
        if (draft === null) return
        const value = Number(draft.trim())
        if (!Number.isInteger(value) || value < 1 || value > max) {
          setMessage({ tone: 'danger', text: fill(t('countRange'), { max }) })
          return
        }
        if (value === saved) {
          setDraft(null)
          return
        }
        setMessage(null)
        try {
          await store.write((latest) => ({ counts: { ...latest.counts, [engine.id]: value } }))
          setDraft(null)
          setMessage({ tone: 'success', text: fill(t('countSaved'), { n: value }) })
        } catch (error) {
          const detail = typeof error?.message === 'string' ? error.message.trim() : ''
          setMessage({ tone: 'danger', text: detail ? `${t('countFailed')} (${detail})` : t('countFailed') })
        }
      }

      return h(
        'div',
        { style: { display: 'grid', gap: 4 } },
        h('label', { htmlFor: inputId, style: styles.label }, t('countLabel')),
        h(
          'div',
          { style: styles.countRow },
          h('input', {
            id: inputId,
            type: 'number',
            inputMode: 'numeric',
            min: 1,
            max,
            step: 1,
            value: shown,
            disabled: locked,
            'aria-describedby': hintId,
            onChange: (event) => setDraft(event.target.value),
            onBlur: commit,
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commit()
              }
            },
            style: { ...styles.input, width: 112 }
          }),
          h('span', { id: hintId, style: styles.hint }, countHint(engine, t))
        ),
        engine.costNote ? h('p', { style: styles.hint }, t(`countCost.${engine.id}`)) : null,
        h('div', { role: 'status', 'aria-live': 'polite' }, message === null ? null : h('p', { style: messageStyle(message.tone) }, message.text))
      )
    }

    function EngineRow({ engine, info, writable, credentials, store, t, onChanged }) {
      const [drafts, setDrafts] = React.useState(() => engine.refs.map(() => ''))
      const [busy, setBusy] = React.useState(null)
      const [message, setMessage] = React.useState(null)
      const state = engineState(engine, info)
      const headingId = `dsh-search-${engine.id}-name`
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
        engine.note ? h('p', { style: styles.hint }, rich(t(`note.${engine.id}`))) : null,
        h(CountField, { engine, store, t }),
        ...engine.refs.map((ref, index) => {
          const inputId = `dsh-search-${ref.toLowerCase()}`
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
            }),
            (() => {
              const stored = storedKeyView(info?.[ref], t)
              if (stored === null) return null
              return h(
                'p',
                { style: styles.hint },
                `${t('storedKey')} `,
                // Screen readers hear "starts with … ends with …" instead of a run of bullets.
                stored.mono ? h('span', { style: styles.masked, 'aria-hidden': 'true' }, stored.text) : stored.text,
                stored.mono ? h('span', { style: styles.srOnly }, stored.label) : null
              )
            })()
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
              ? h('a', { href: engine.keyLink, target: '_blank', rel: 'noreferrer', style: styles.link, 'aria-label': `${t('getKey')}: ${engine.name}, ${hostOf(engine.keyLink)}` }, `${t('getKey')} · ${hostOf(engine.keyLink)} ↗`)
              : null,
            engine.priceLink
              ? h('a', { href: engine.priceLink, target: '_blank', rel: 'noreferrer', style: styles.link, 'aria-label': `${t('pricing')}: ${engine.name}, ${hostOf(engine.priceLink)}` }, `${t('pricing')} · ${hostOf(engine.priceLink)} ↗`)
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
    function AutoOrderSection({ store, t }) {
      const [pending, setPending] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [message, setMessage] = React.useState(null)
      const [focusId, setFocusId] = React.useState(null)
      const snapshot = store.snapshot

      // Moving a row moves its DOM node, which drops focus; put it back on the same control.
      React.useEffect(() => {
        if (focusId === null || typeof document === 'undefined') return
        document.getElementById(focusId)?.focus?.()
        setFocusId(null)
      }, [focusId])

      const titleId = 'dsh-search-order-title'
      const header = h(
        'div',
        { style: { display: 'grid', gap: 4 } },
        h('h3', { id: titleId, style: styles.sectionTitle }, t('orderTitle')),
        h('p', { style: styles.hint }, rich(t('orderHint')))
      )
      if (snapshot === null) {
        return h('section', { style: styles.section, 'aria-labelledby': titleId }, header,
          h('p', { role: 'status', style: styles.hint }, store.failed ? t('orderUnavailable') : t('orderLoading')))
      }

      // While a save runs the list shows the new order at once.
      const order = pending ?? snapshot.order
      const rest = DEFAULT_ORDER.filter((id) => !order.includes(id))
      // Controls stay enabled while a save runs (a disabled control drops focus);
      // the handlers ignore clicks until it lands.
      const locked = !snapshot.writable
      const isDefault = order.length === DEFAULT_ORDER.length && order.every((id, index) => id === DEFAULT_ORDER[index])

      const save = async (next, announce) => {
        setPending(next)
        setBusy(true)
        setMessage(null)
        try {
          // `autoKnown` records which engines existed, so a later one is not read as unchecked.
          await store.write(() => ({ autoOrder: next, autoKnown: DEFAULT_ORDER.slice() }))
          setMessage({ tone: 'success', text: announce ? `${announce} ${t('orderSaved')}` : t('orderSaved') })
        } catch (error) {
          const detail = typeof error?.message === 'string' ? error.message.trim() : ''
          setMessage({ tone: 'danger', text: detail ? `${t('orderFailed')} (${detail})` : t('orderFailed') })
        } finally {
          setPending(null)
          setBusy(false)
        }
      }

      const toggle = (id) => {
        if (busy) return
        // The row moves between the checked and unchecked parts; keep focus on its box.
        setFocusId(`dsh-search-order-${id}`)
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
        setFocusId(`dsh-search-order-${id}-${(step < 0) !== edge ? 'up' : 'down'}`)
        save(next, fill(t('moved'), { name: ENGINE_BY_ID.get(id).name, n: to + 1 }))
      }

      const row = (id, rank) => {
        const engine = ENGINE_BY_ID.get(id)
        const checked = rank > 0
        const boxId = `dsh-search-order-${id}`
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

    /** The settings section DSH's Web search and fetch page also edits; its `searchProvider` picks web_search's engine. */
    const WEB_NS = 'web'
    const WEB_FIELD = 'searchProvider'
    /**
     * DSH's own search providers, which carry no title: DSH names them from its
     * page dictionary and lists them first, in this order. The card does the same.
     */
    const OFFICIAL_SEARCH = [['deepseek-search-api', 'providerDeepSeek'], ['deepseek-official', 'providerLegacy']]
    const WEB_PAGE_NS = 'settings.webSearch'

    /**
     * A small store for the Host services the web search section needs, which
     * an older Host may not have: the shared settings form of `web` (the same
     * mirror and write queue DSH's own page uses, so each page sees the other's
     * change at once) and the web provider list.
     */
    function createWebBridge() {
      let current = null
      const listeners = new Set()
      return {
        get: () => current,
        set(next) {
          current = next
          for (const listener of listeners) listener()
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        }
      }
    }

    function useStore(subscribe, read) {
      const [value, setValue] = React.useState(read)
      React.useEffect(() => {
        setValue(read)
        return subscribe(() => setValue(read))
      }, [subscribe, read])
      return value
    }

    /**
     * Which engine web_search uses, read from and written to the `web` section.
     * Picking the value the profile composes (or "DSH default") clears this
     * page's override, as DSH's own page does.
     */
    function WebSearchSection({ bridge, t }) {
      const services = useStore(bridge.subscribe, bridge.get)
      const form = services?.form
      const read = React.useCallback(() => (form ? form.getSnapshot() : null), [form])
      const subscribe = React.useCallback((listener) => (form ? form.subscribe(listener) : () => {}), [form])
      const snapshot = useStore(subscribe, read)
      const [providers, setProviders] = React.useState(null)
      const [message, setMessage] = React.useState(null)
      const [busy, setBusy] = React.useState(false)

      React.useEffect(() => {
        if (!services) return undefined
        let alive = true
        const load = async () => {
          try {
            const response = await services.listProviders()
            if (alive) setProviders(response?.ok && Array.isArray(response.value?.search) ? response.value.search : [])
          } catch {
            if (alive) setProviders([])
          }
        }
        load()
        const off = services.onProvidersChanged?.(load)
        return () => {
          alive = false
          if (typeof off === 'function') off()
        }
      }, [services])

      const titleId = 'dsh-search-web-title'
      const selectId = 'dsh-search-web-select'
      const header = h(
        'div',
        { style: { display: 'grid', gap: 4 } },
        h('h3', { id: titleId, style: styles.sectionTitle }, t('webTitle')),
        h('p', { style: styles.hint }, rich(t('webHint')))
      )
      if (!services) return h('section', { style: styles.section, 'aria-labelledby': titleId }, header, h('p', { style: styles.hint }, t('webUnavailable')))
      if (snapshot === null || snapshot.status === 'loading' || providers === null) {
        return h('section', { style: styles.section, 'aria-labelledby': titleId }, header, h('p', { role: 'status', style: styles.hint }, t('webLoading')))
      }
      if (snapshot.status === 'unavailable') return h('section', { style: styles.section, 'aria-labelledby': titleId }, header, h('p', { style: styles.hint }, t('webUnavailable')))

      const base = snapshot.base && typeof snapshot.base === 'object' ? snapshot.base[WEB_FIELD] : undefined
      const current = typeof snapshot.value?.[WEB_FIELD] === 'string' ? snapshot.value[WEB_FIELD] : ''
      const official = new Map(OFFICIAL_SEARCH)
      const titleOf = (id) => {
        const key = official.get(id)
        const named = key === undefined ? undefined : services.pageText?.(key)
        if (typeof named === 'string' && named !== '' && named !== key) return named
        return providers.find((provider) => provider.id === id)?.title ?? id
      }
      const ordered = [
        ...OFFICIAL_SEARCH.flatMap(([id]) => providers.filter((provider) => provider.id === id)),
        ...providers.filter((provider) => !official.has(provider.id))
      ]
      const options = []
      // "DSH default" exists only when the profile composes no engine; then DSH picks one itself.
      if (base === undefined) options.push({ value: '', label: t('webDefault') })
      for (const provider of ordered) options.push({ value: provider.id, label: titleOf(provider.id) })
      if (current !== '' && !providers.some((provider) => provider.id === current)) options.push({ value: current, label: fill(t('webMissing'), { id: current }) })
      const locked = !snapshot.writable

      const choose = async (id) => {
        if (busy || id === current) return
        setBusy(true)
        setMessage({ tone: 'muted', text: t('webSaving') })
        try {
          const ok = id === '' || id === base ? await form.unset(WEB_FIELD) : await form.set(WEB_FIELD, id)
          setMessage(ok ? { tone: 'success', text: fill(t('webSaved'), { name: id === '' ? t('webDefault') : titleOf(id) }) } : { tone: 'danger', text: t('webFailed') })
        } catch {
          setMessage({ tone: 'danger', text: t('webFailed') })
        } finally {
          setBusy(false)
        }
      }

      return h(
        'section',
        { style: styles.section, 'aria-labelledby': titleId },
        header,
        h('label', { htmlFor: selectId, style: styles.srOnly }, t('webLabel')),
        h(
          'select',
          {
            id: selectId,
            value: current,
            disabled: locked,
            'aria-describedby': locked ? `${selectId}-locked` : undefined,
            onChange: (event) => { choose(event.target.value) },
            style: { ...styles.input, maxWidth: 420, appearance: 'auto', cursor: locked ? 'default' : 'pointer' }
          },
          ...options.map((option) => h('option', { key: option.value, value: option.value }, option.label))
        ),
        locked ? h('p', { id: `${selectId}-locked`, style: styles.hint }, t('webReadOnly')) : null,
        h('div', { role: 'status', 'aria-live': 'polite' }, message === null ? null : h('p', { style: messageStyle(message.tone) }, message.text))
      )
    }

    function SearchSettingsCard(props) {
      const { t, view } = props
      if (view === 'summary') return t('summary')

      const credentials = props.credentials
      const [info, setInfo] = React.useState(null)
      const [writable, setWritable] = React.useState(true)
      const [notice, setNotice] = React.useState(null)
      const [revision, setRevision] = React.useState(0)
      const store = useBundleSettings(props.settings)

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
        h('ul', { style: styles.engineList }, ENGINE_LIST_KEYS.map((key) => h('li', { key, style: styles.listLine }, breakAfterDots(t(key))))),
        h(
          'section',
          { style: styles.section, 'aria-labelledby': 'dsh-search-commands-title' },
          h('div', { style: { display: 'grid', gap: 4 } },
            h('h3', { id: 'dsh-search-commands-title', style: styles.sectionTitle }, t('commandsTitle')),
            h('p', { style: styles.hint }, t('commandsHint'))),
          h('ul', { style: styles.exampleList }, COMMAND_EXAMPLES.map(([key, command]) => h(
            'li',
            { key, style: styles.listLine },
            h('code', { style: styles.code }, command),
            ' ',
            t(key)
          )))
        ),
        props.web ? h(WebSearchSection, { bridge: props.web, t }) : null,
        h(AutoOrderSection, { store, t }),
        h('h3', { style: styles.sectionTitle }, t('keysTitle')),
        info === null ? h('p', { role: 'status', style: styles.hint }, notice ?? t('checking')) : null,
        writable ? null : h('p', { style: styles.hint }, t('readOnly')),
        ...ENGINES.map((engine) => h(EngineRow, {
          key: engine.id,
          engine,
          info,
          writable,
          credentials,
          store,
          t,
          onChanged: () => setRevision((value) => value + 1)
        }))
      )
    }

    /** The host command this bundle registers; a bare `/search` opens the engine picker. */
    const COMMAND = 'search'
    const AUTO = 'auto'
    /** The short names `/search` takes for the Korean modes (ko is korea). */
    const KOREA_MODES = [
      { id: 'ko', label: 'pick.korea' },
      { id: 'ko-group', label: 'pick.koreaGroup', detail: 'pick.koreaGroupDetail' },
      { id: 'ko-seq', label: 'pick.koreaSeq', detail: 'pick.koreaSeqDetail' }
    ]

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
        readSettings(settings).catch(() => null)
      ])
      const option = (engine, group) => ({
        id: engine.id,
        label: engine.name,
        detail: `${originText(engine, t, false)} · ${briefText(engine, engineState(engine, info), t)}`,
        group
      })
      const autoGroup = { name: 'auto', label: t('group.auto') }
      const auto = { id: AUTO, label: t('pick.auto'), detail: t('pick.autoDetail'), group: autoGroup, active: true }
      // The combined Korean engine sits with auto: it is not one engine of the order.
      const koreaReady = ['naver', 'kakao'].some((id) => engineState(ENGINE_BY_ID.get(id), info)?.key === 'stateKeyed')
      const koreaState = info === null || koreaReady ? null : t('pick.koreaNeedsKey')
      const korea = KOREA_MODES.map((mode) => ({
        id: mode.id,
        label: t(mode.label),
        detail: `${flagOf('KR')} ${koreaState ?? (mode.detail ? t(mode.detail) : info === null ? t('pick.koreaDetail') : t('pick.koreaReady'))}`,
        group: autoGroup
      }))
      if (saved === null) {
        const engines = { name: 'engines', label: t('group.engines') }
        return [auto, ...korea, ...ENGINES.map((engine) => option(engine, engines))]
      }
      const used = { name: 'used', label: t('group.used') }
      const unused = { name: 'unused', label: t('group.unused') }
      return [
        auto,
        ...korea,
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
        // The web search section joins only when the Host has the shared settings
        // forms and the web provider list; older Hosts show the rest of the card.
        const web = createWebBridge()
        if (typeof ctx.inject === 'function') ctx.inject(['configForms', 'remote.web'], (scope) => {
          scope.effect(() => {
            web.set({
              form: scope.configForms.get(WEB_NS),
              // DSH's Web search page dictionary, for the names it gives its own providers.
              pageText: ctx.locale.bind(WEB_PAGE_NS),
              listProviders: () => scope.remote.web.listProviders(),
              onProvidersChanged: (listener) => {
                const offs = [ctx.remote.$on?.('web/providers-changed', listener), ctx.on?.('connection/reset', listener)]
                return () => { for (const off of offs) if (typeof off === 'function') off() }
              }
            })
            return () => web.set(null)
          }, 'search: web search setting')
        })
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
          }), 'search: /search engine picker')
        })
        ctx.effect(() => ctx.locale.register(NS, { en, zh, ko }), 'dsh-search-settings: dictionaries')
        // The bundle's own detail page renders this keyed config section.
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config',
          key: '@lyngmn/dsh-search',
          locale: NS,
          inject: () => ({ credentials: ctx.remote.credentials, settings: ctx.remote.settings, web })
        }, SearchSettingsCard))
      }
    }
  }
})
