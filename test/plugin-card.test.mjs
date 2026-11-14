// 키트에 든 모든 플러그인이 같은 이름 규칙·카드 규칙을 지키는지 본다.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = new URL('..', import.meta.url).pathname
const PLUGINS = readdirSync(join(ROOT, 'plugins'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, 'plugins', entry.name, 'package.json')))
  .map((entry) => entry.name)
const read = (folder, path) => readFileSync(join(ROOT, 'plugins', folder, path), 'utf8')
const pkg = (folder) => JSON.parse(read(folder, 'package.json'))

test('키트에 플러그인이 들어 있다', () => {
  assert.ok(PLUGINS.length >= 8, PLUGINS.join(', '))
})

for (const folder of PLUGINS) {
  test(`${folder}: 이름 앞에 @lyngmn/dsh- 핸들을 붙이고 만든이와 저장소 위치를 밝힌다`, () => {
    const manifest = pkg(folder)
    assert.equal(manifest.name, `@lyngmn/dsh-${folder}`)
    assert.equal(manifest.author, 'LYNGMN')
    assert.equal(manifest.repository?.directory, `plugins/${folder}`)
    assert.equal(manifest.license, 'MIT')
    assert.ok(manifest.scripts?.test, '루트 npm test가 이 플러그인 시험도 돌리게 test 명령을 둔다')
  })

  test(`${folder}: DSH 묶음 설정과 화면 번들 id가 패키지 이름과 같다`, () => {
    const name = pkg(folder).name
    assert.match(read(folder, 'cordis.patch.yml'), new RegExp(`name: '${name}'`))
    // 화면 번들은 DSH 모듈 로더에 패키지 이름을 id로 알린다.
    for (const client of ['client.js', 'lib/client.js']) {
      if (!existsSync(join(ROOT, 'plugins', folder, client))) continue
      const ids = [...read(folder, client).matchAll(/^\s{0,2}id: '([^']+)'/gm)].map((match) => match[1])
      assert.deepEqual(ids, [name], client)
    }
  })

  test(`${folder}: 카드 아이콘은 출처를 밝힌 SVG이고 제목·설명은 한국어가 기본이다`, () => {
    const manifest = pkg(folder)
    assert.equal(manifest.exports['./icon'], './icon.svg')
    assert.equal(manifest.exports['./locale/*.json'], './locale/*.json')
    const svg = read(folder, 'icon.svg')
    assert.match(svg, /<svg[\s>]/)
    assert.match(svg, /<!--[^]*?(Lucide "[a-z0-9-]+" \(ISC License|https:\/\/)/, '아이콘 출처를 주석으로 남긴다')
    const ko = JSON.parse(read(folder, 'locale/ko.json')).meta
    // 서비스 이름(Brave Search 등)은 제목에 그대로 두므로, 한국어는 설명으로 확인한다.
    assert.ok(ko.title)
    assert.match(ko.description, /[가-힣]/)
    const en = JSON.parse(read(folder, 'locale/en.json')).meta
    assert.ok(en.title && en.description)
  })

  test(`${folder}: 카드 설명은 같은 문장으로 DeepSeek 공식 플러그인이 아님을 밝히고, 패키지 설명은 영어 카드 설명과 같다`, () => {
    const ko = JSON.parse(read(folder, 'locale/ko.json')).meta.description
    const en = JSON.parse(read(folder, 'locale/en.json')).meta.description
    assert.ok(ko.endsWith(' DeepSeek 공식 플러그인이 아니에요.'), ko)
    assert.ok(en.endsWith(' Not an official DeepSeek plugin.'), en)
    assert.equal(ko.match(/공식/g).length, 1, '공식 아님 문장은 한 번만 쓴다')
    assert.equal(pkg(folder).description, en)
  })
}
