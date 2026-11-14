// 글꼴 고르기: 설정 → 일반에 본문·코드·터미널 글꼴을 목록에서 고르는 줄을 넣는다.
//
// DSH에는 글꼴 이름을 직접 써 넣는 칸만 있다. 아래 후보 가운데 이 기기에 설치된 글꼴만
// 목록으로 보여 주고, 고른 값을 DSH의 글꼴 설정에 그대로 쓴다(ctx.theme.setFontFamily).
// 저장과 적용은 DSH가 하므로 언어팩을 꺼도 고른 글꼴은 남는다.
//
// 이 파일은 scripts/build.mjs가 lib/client.js 안에 그대로 넣는다. 함수 하나만 둔다.
function fontPicker(require) {
  const NS = 'fontPicker'
  const ROLES = ['text', 'code', 'terminal']

  // 목록에 올릴 글꼴 후보. 새 글꼴을 목록에 넣으려면 여기에 한 줄을 더한다.
  // label: 목록에 보일 이름. families: 앞에서부터 이 기기에 설치된 첫 글꼴이 쓰인다.
  // fallback: 그 글꼴에 없는 글자(한글)에 쓸 글꼴. 목록에 보일지는 families만 보고 정한다.
  // 한글이 없는 코딩 글꼴 뒤에 붙여, 코드 속 한글도 고정폭으로 보이게 한다.
  const KOREAN_MONO = ['D2Coding', 'NanumGothicCoding']
  const latin = (label, ...families) => ({ label, families, fallback: KOREAN_MONO })
  const CODE_FONTS = [
    // 한글까지 고정폭인 글꼴
    { label: 'D2Coding', families: ['D2Coding'] },
    { label: 'D2Coding 합자', families: ['D2Coding ligature'] },
    { label: '나눔고딕코딩', families: ['NanumGothicCoding', '나눔고딕코딩', 'Nanum Gothic Coding'] },
    { label: 'Sarasa Mono K', families: ['Sarasa Mono K'] },
    { label: 'Monoplex KR', families: ['Monoplex KR'] },
    // 영문 코딩 글꼴
    latin('JetBrains Mono', 'JetBrains Mono'),
    latin('Fira Code', 'Fira Code'),
    latin('Cascadia Code', 'Cascadia Code'),
    latin('Monaspace Neon', 'Monaspace Neon'),
    latin('Monaspace Argon', 'Monaspace Argon'),
    latin('Monaspace Xenon', 'Monaspace Xenon'),
    latin('Monaspace Radon', 'Monaspace Radon'),
    latin('Monaspace Krypton', 'Monaspace Krypton'),
    latin('Geist Mono', 'Geist Mono'),
    latin('Commit Mono', 'CommitMono', 'Commit Mono'),
    latin('Hack', 'Hack'),
    latin('IBM Plex Mono', 'IBM Plex Mono'),
    latin('Source Code Pro', 'Source Code Pro'),
    latin('Maple Mono', 'Maple Mono'),
    latin('Iosevka', 'Iosevka'),
    latin('Victor Mono', 'Victor Mono'),
    latin('Intel One Mono', 'Intel One Mono'),
    latin('Roboto Mono', 'Roboto Mono'),
    latin('Inconsolata', 'Inconsolata'),
    latin('Ubuntu Mono', 'Ubuntu Mono'),
    latin('SF Mono', 'SF Mono'),
    latin('Menlo', 'Menlo'),
    latin('Monaco', 'Monaco'),
    latin('Consolas', 'Consolas')
  ]
  const CANDIDATES = {
    text: [
      { label: 'Apple SD 산돌고딕 Neo', families: ['Apple SD Gothic Neo'] },
      { label: 'Pretendard', families: ['Pretendard Variable', 'Pretendard'] },
      { label: 'Noto Sans KR', families: ['Noto Sans KR', 'Noto Sans CJK KR'] },
      { label: 'SUIT', families: ['SUIT Variable', 'SUIT'] },
      { label: 'Wanted Sans', families: ['Wanted Sans Variable', 'Wanted Sans'] },
      { label: '스포카 한 산스 Neo', families: ['Spoqa Han Sans Neo'] },
      { label: 'IBM Plex Sans KR', families: ['IBM Plex Sans KR'] },
      { label: '나눔스퀘어 Neo', families: ['NanumSquare Neo', 'NanumSquareNeo'] },
      { label: '나눔고딕', families: ['NanumGothic', 'Nanum Gothic'] },
      { label: '나눔명조', families: ['NanumMyeongjo', 'Nanum Myeongjo'] },
      { label: '맑은 고딕', families: ['Malgun Gothic'] }
    ],
    code: CODE_FONTS,
    terminal: CODE_FONTS
  }

  // 추천 글꼴. 처음 켤 때 아직 DSH 기본 글꼴을 쓰고 있고 이 글꼴이 설치돼 있으면 한 번만 바꿔 준다.
  // 한 번 바꾼(또는 이미 다른 글꼴을 고른) 역할은 기억해 두고, 그 뒤 "기본"을 고르면 다시 바꾸지 않는다.
  const RECOMMENDED = { text: 'Pretendard', code: 'D2Coding', terminal: 'IBM Plex Mono' }
  const MEMORY_KEY = 'dsh-korean:font-picker:recommended'

  function candidateValue(candidate) {
    return normalize([...candidate.families, ...(candidate.fallback ?? [])].join(', '))
  }

  function recommendedFor(role) {
    return (CANDIDATES[role] ?? []).find((candidate) => candidate.label === RECOMMENDED[role])
  }

  // families: 지금 글꼴 설정. done: 이미 처리한 역할 모음(Set). 돌려주는 값: 새로 처리한 역할 목록.
  function applyRecommended({ families, installed, setFontFamily, done }) {
    const handled = []
    for (const role of ROLES) {
      if (done.has(role)) continue
      const candidate = recommendedFor(role)
      if (!candidate) continue
      if (normalize(families[role]) !== '') {
        handled.push(role)
        continue
      }
      // 아직 설치하지 않았으면 기억하지 않고, 다음에 켤 때 다시 본다.
      if (!candidate.families.some((family) => installed(family))) continue
      setFontFamily(role, candidateValue(candidate))
      handled.push(role)
    }
    return handled
  }

  function createMemory(storage) {
    const read = () => {
      try {
        const value = JSON.parse(storage?.getItem(MEMORY_KEY) ?? '[]')
        return new Set(Array.isArray(value) ? value : [])
      } catch (error) {
        return new Set()
      }
    }
    return {
      read,
      add(roles) {
        if (roles.length === 0) return
        try {
          storage?.setItem(MEMORY_KEY, JSON.stringify([...new Set([...read(), ...roles])]))
        } catch (error) {
          // 저장하지 못하면 다음에 켤 때 다시 확인할 뿐이다.
        }
      }
    }
  }

  const en = {
    'text.title': 'Choose text font',
    'text.description': 'Interface and conversation text. Only fonts installed on this device are listed',
    'code.title': 'Choose code font',
    'code.description': 'Code blocks, inline code, and tool output',
    'terminal.title': 'Choose terminal font',
    'terminal.description': 'The sidebar terminal',
    // 기본 항목에는 DSH 기본 글꼴 목록(--dsh-font-family-*-default)이 이 기기에서 실제로 그리는 글꼴 이름을 보인다.
    'default.text.mac': 'SF Pro + Apple SD Gothic Neo (default)',
    'default.text.win': 'Segoe UI + Malgun Gothic (default)',
    'default.text.other': 'System font (default)',
    'default.code.mac': 'SF Mono (default)',
    'default.code.win': 'Consolas (default)',
    'default.code.other': 'System monospace (default)',
    custom: 'Typed-in fonts',
    recommended: '(recommended)'
  }
  // 앱은 영어와 중국어 사전을 함께 요구한다. 중국어는 영어로 대신한다.
  const zh = en
  const ko = {
    'text.title': '본문 글꼴 고르기',
    'text.description': '인터페이스와 대화 글에 쓰여요. 이 기기에 설치된 글꼴만 목록에 보여요',
    'code.title': '코드 글꼴 고르기',
    'code.description': '코드 블록, 인라인 코드, 도구 출력에 쓰여요',
    'terminal.title': '터미널 글꼴 고르기',
    'terminal.description': '사이드바 터미널에 쓰여요',
    'default.text.mac': 'SF Pro + 산돌고딕 (기본)',
    'default.text.win': 'Segoe UI + 맑은 고딕 (기본)',
    'default.text.other': '시스템 글꼴 (기본)',
    'default.code.mac': 'SF Mono (기본)',
    'default.code.win': 'Consolas (기본)',
    'default.code.other': '시스템 고정폭 글꼴 (기본)',
    custom: '직접 입력한 글꼴',
    recommended: '(추천)'
  }

  function platformOf(navigatorLike) {
    const name = String(navigatorLike?.userAgentData?.platform ?? navigatorLike?.platform ?? '')
    if (/mac/i.test(name)) return 'mac'
    if (/win/i.test(name)) return 'win'
    return 'other'
  }

  // 터미널은 코드와 같은 기본 글꼴을 쓴다.
  function defaultLabelKey(role, platform) {
    return `default.${role === 'text' ? 'text' : 'code'}.${platform}`
  }

  const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong'])

  // DSH가 글꼴 목록을 저장할 때 쓰는 모양과 같게 만든다(이름마다 큰따옴표, 쉼표로 구분).
  function normalize(value) {
    return String(value ?? '').split(',')
      .map((name) => name.replace(/["'\\<>\u0000-\u001f\u007f]/gu, '').replace(/\s+/gu, ' ').trim())
      .filter((name) => name !== '')
      .map((name) => (GENERIC.has(name.toLowerCase()) ? name : `"${name}"`))
      .join(', ')
  }

  // 목록에 보일 항목을 정한다. installed(이름)은 그 글꼴이 이 기기에 있는지 알려 준다.
  // 돌려주는 값: [{ value, label, kind: 'default' | 'font' | 'custom' }]
  function optionsFor(role, current, installed) {
    const now = normalize(current)
    const options = [{ value: '', label: null, kind: 'default' }]
    let matched = now === ''
    for (const candidate of CANDIDATES[role] ?? []) {
      const value = candidateValue(candidate)
      const selected = value === now
      // 지금 쓰는 값은 글꼴이 지워졌더라도 목록에 남겨, 무엇이 설정돼 있는지 보이게 한다.
      if (!selected && !candidate.families.some((family) => installed(family))) continue
      matched ||= selected
      options.push({ value, label: candidate.label, kind: 'font' })
    }
    // 글꼴 칸에 직접 써 넣은 값은 목록에 없어도 잃지 않게 그대로 보여 준다.
    if (!matched) options.push({ value: now, label: now.replace(/"/g, ''), kind: 'custom' })
    return options
  }

  // 글꼴이 설치돼 있는지 글자 폭으로 알아본다. 없는 글꼴을 지정하면 뒤의 기본 글꼴로 그려지므로,
  // 기본 글꼴 세 가지 모두와 폭이 같으면 설치되지 않은 것이다.
  function createDetector(createCanvas) {
    const SAMPLE = 'mmmmmmmmmmlli10OQ 한글가나다라'
    const BASES = ['monospace', 'sans-serif', 'serif']
    const cache = new Map()
    let context
    const width = (font) => {
      context.font = `72px ${font}`
      return context.measureText(SAMPLE).width
    }
    return (family) => {
      if (cache.has(family)) return cache.get(family)
      let found = false
      try {
        context ??= createCanvas().getContext('2d')
        found = BASES.some((base) => width(`"${family}", ${base}`) !== width(base))
      } catch (error) {
        found = false
      }
      cache.set(family, found)
      return found
    }
  }

  const STYLE = `
.fontpick-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.fontpick:last-child>.fontpick-row:last-child{border-bottom:0}
.fontpick-text{flex:1 1 220px;min-width:0;display:flex;flex-direction:column;gap:4px}
.fontpick-title{font-size:14px;font-weight:400;line-height:22px;color:var(--dsw-alias-label-primary)}
.fontpick-desc{font-size:12px;font-weight:400;line-height:18px;color:var(--dsw-alias-label-secondary);word-break:keep-all;overflow-wrap:break-word}
.fontpick-control{position:relative;flex:0 1 auto;min-width:0;max-width:100%}
.fontpick-select{-webkit-appearance:none;appearance:none;display:block;box-sizing:border-box;min-width:160px;max-width:100%;height:36px;margin:0;padding:0 38px 0 14px;border:1px solid var(--dsw-alias-label-tertiary);border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-module-platform);font:inherit;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);cursor:pointer}
.fontpick-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.fontpick-chevron{position:absolute;top:50%;right:12px;width:16px;height:16px;margin-top:-8px;pointer-events:none;color:var(--dsw-alias-label-secondary)}
@media (hover:hover){.fontpick-select:hover{background:var(--dsw-alias-interactive-bg-hover)}}
@media (pointer:coarse){.fontpick-select{height:44px;font-size:16px}}
`

  function component(React) {
    const h = React.createElement

    function Row({ role, current, installed, platform, setFontFamily, t }) {
      const titleId = React.useId()
      const options = optionsFor(role, current, installed)
      const selected = normalize(current)
      // 직접 써 넣은 값은 길 수 있어 목록에는 짧은 이름만 두고, 실제 값은 마우스를 올리면 보이게 한다.
      const typed = options.find((option) => option.kind === 'custom')
      return h(
        'div',
        { className: 'fontpick-row' },
        h(
          'div',
          { className: 'fontpick-text' },
          h('div', { className: 'fontpick-title', id: titleId }, t(`${role}.title`)),
          h('div', { className: 'fontpick-desc' }, t(`${role}.description`))
        ),
        h(
          'div',
          { className: 'fontpick-control' },
          h(
            'select',
            {
              className: 'fontpick-select',
              'aria-labelledby': titleId,
              title: typed ? typed.label : undefined,
              value: selected,
              onChange: (event) => setFontFamily(role, event.target.value)
            },
            options.map((option) => h(
              'option',
              { key: option.value, value: option.value },
              option.kind === 'default' ? t(defaultLabelKey(role, platform))
                : option.kind === 'custom' ? t('custom')
                  : option.label === RECOMMENDED[role] ? `${option.label} ${t('recommended')}`
                    : option.label
            ))
          ),
          h(
            'svg',
            { className: 'fontpick-chevron', viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
            h('path', { d: 'M4 6l4 4 4-4', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' })
          )
        )
      )
    }

    return function FontPicker({ t, getFamilies, subscribe, setFontFamily, platform }) {
      const [families, setFamilies] = React.useState(getFamilies)
      React.useEffect(() => {
        setFamilies(getFamilies())
        return subscribe(() => setFamilies(getFamilies()))
      }, [getFamilies, subscribe])
      // 설정을 열 때마다 새로 알아봐서, 그 사이 설치한 글꼴이 목록에 나타나게 한다.
      const installed = React.useMemo(() => createDetector(() => document.createElement('canvas')), [])
      return h(
        'div',
        { className: 'fontpick' },
        ROLES.map((role) => h(Row, { key: role, role, current: families[role] ?? '', installed, platform, setFontFamily, t }))
      )
    }
  }

  return {
    inject: ['slots', 'locale', 'theme'],
    // 시험에서 화면 없이 확인할 수 있게 내놓는다.
    internals: { CANDIDATES, DICTIONARIES: { en, ko }, RECOMMENDED, STYLE, applyRecommended, component, createDetector, createMemory, defaultLabelKey, normalize, optionsFor, platformOf },
    apply(ctx) {
      const FontPicker = component(require('react'))
      const theme = ctx.theme
      const listeners = new Set()
      ctx.on('theme/change', () => {
        for (const listener of listeners) listener()
      })
      ctx.effect(() => ctx.locale.register(NS, { en, zh, ko }), 'font-picker: dictionaries')
      ctx.effect(() => {
        const style = document.createElement('style')
        style.textContent = STYLE
        document.head.append(style)
        return () => style.remove()
      }, 'font-picker: styles')
      // 화면이 다시 그려질 때마다 구독을 새로 걸지 않도록 같은 함수를 계속 넘긴다.
      const face = {
        getFamilies: () => theme.getTheme().fontFamilies,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        setFontFamily: (role, value) => { theme.setFontFamily(role, value) },
        platform: platformOf(globalThis.navigator)
      }
      ctx.effect(() => {
        const memory = createMemory(globalThis.localStorage)
        const handled = applyRecommended({
          families: theme.getTheme().fontFamilies ?? {},
          installed: createDetector(() => document.createElement('canvas')),
          setFontFamily: face.setFontFamily,
          done: memory.read()
        })
        memory.add(handled)
        // 바꾼 글꼴은 DSH 설정에 남으므로 언어팩을 꺼도 되돌리지 않는다.
        return () => {}
      }, 'font-picker: recommended fonts')
      // 글꼴 크기 줄(11) 바로 아래에 둔다.
      ctx.slots.inject('settings.general.item', () => ctx.slots.register({
        name: 'settings.general.item',
        id: 'font-picker',
        order: 12,
        locale: NS,
        inject: () => face
      }, FontPicker))
    }
  }
}
