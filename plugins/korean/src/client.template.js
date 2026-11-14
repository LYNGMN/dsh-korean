// DeepSeek Harness 한국어 언어팩의 화면 쪽 번들.
// 이 파일(lib/client.js)은 scripts/build.mjs가 src/client.template.js와 ko/*.json으로 만든다. 직접 고치지 않는다.
window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-korean',
  factory(require) {
    const PACK = __PACK__
    const LANGUAGE = { id: 'ko', label: '한국어', fallback: 'en' }
    const DICTIONARIES = __DICTIONARIES__
    // 내장 플러그인 카드의 이름·설명. 영어 원문 → 한국어.
    const PACKAGE_TEXT = new Map(Object.entries(__PACKAGE_TEXT__))

    // 플러그인 카드의 이름·설명은 화면 사전이 아니라 패키지마다 딸린 언어 표({ en, zh, … })에서 온다.
    // 앱에 내장된 패키지에는 한국어 칸이 없어서, 화면 언어가 한국어이고 표에 ko가 없을 때만
    // 영어 원문으로 번역을 찾아 돌려준다. 그 밖의 경우는 앱의 원래 동작 그대로다.
    function translatePackageText(locale) {
      const original = locale.resolveText
      if (typeof original !== 'function' || PACKAGE_TEXT.size === 0) return () => {}
      // 앱은 서비스를 꺼낼 때마다 함수를 새 껍데기로 싸서 주므로, 함수끼리 비교하지 않고 표식으로 알아본다.
      const mark = {}
      const mine = () => {
        const current = locale.resolveText
        return typeof current === 'function' && current.dshKorean === mark
      }
      const previous = Object.getOwnPropertyDescriptor(locale, 'resolveText')
      const korean = () => {
        try {
          return /^ko(-|$)/i.test(String(locale.getLocale().active))
        } catch (error) {
          return false
        }
      }
      const resolveText = function (text) {
        if (text !== null && typeof text === 'object' && typeof text.en === 'string' && text.ko === undefined && korean()) {
          const translated = PACKAGE_TEXT.get(text.en)
          if (translated !== undefined) return translated
        }
        return original.call(this, text)
      }
      resolveText.dshKorean = mark
      locale.resolveText = resolveText
      if (!mine()) throw new Error('resolveText를 바꿀 수 없어요')
      return () => {
        // 그 사이 다른 플러그인이 덧씌웠으면 건드리지 않는다.
        if (!mine()) return
        if (previous) Object.defineProperty(locale, 'resolveText', previous)
        else delete locale.resolveText
      }
    }

    // 글꼴 고르기(src/font-picker.js). 빌드할 때 아래 자리에 함수가 통째로 들어온다.
    __FONT_PICKER__

    return {
      inject: ['locale'],
      apply(ctx) {
        const locale = ctx.locale
        if (!locale || typeof locale.addLanguage !== 'function' || typeof locale.register !== 'function') {
          console.warn('[dsh-korean] 이 DSH 버전에는 언어팩 기능이 없어 한국어를 추가하지 못했어요.')
          return
        }

        // 하나가 실패해도 나머지 화면은 계속 번역되도록 등록을 하나씩 감싼다.
        const failed = []
        const own = (label, register) => {
          try {
            ctx.effect(() => {
              try {
                return register()
              } catch (error) {
                failed.push(label)
                return () => {}
              }
            }, `dsh-korean: ${label}`)
          } catch (error) {
            failed.push(label)
          }
        }

        // 사전 등록보다 먼저 걸어 두면, 등록이 화면을 다시 그릴 때 카드 문구도 함께 바뀐다.
        own('plugin cards', () => translatePackageText(locale))
        own('language', () => locale.addLanguage(LANGUAGE))
        for (const [namespace, dictionary] of Object.entries(DICTIONARIES)) {
          own(namespace, () => locale.register(namespace, LANGUAGE.id, dictionary))
        }

        // 글꼴 고르기는 테마와 설정 화면 서비스가 준비됐을 때만 붙는 하위 플러그인이다.
        // 그 서비스가 없는 앱에서도 번역은 그대로 동작한다.
        if (typeof ctx.plugin === 'function') {
          try {
            const picker = fontPicker(require)
            ctx.plugin({ name: 'dsh-korean:font-picker', inject: picker.inject, apply: (inner) => picker.apply(inner) })
          } catch (error) {
            failed.push('font picker')
          }
        }

        if (failed.length > 0) {
          console.warn(
            `[dsh-korean ${PACK.version}] 등록하지 못한 항목: ${failed.join(', ')}. ` +
            `이 언어팩은 DSH ${PACK.appVersion} 기준이에요. 해당 화면은 영어로 보여요.`
          )
        }
      }
    }
  }
})
