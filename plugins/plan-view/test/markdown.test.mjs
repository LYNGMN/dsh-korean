import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMarkdown, parseInline, plainText } from '../src/markdown.js'

const plain = value => JSON.parse(JSON.stringify(value))

test('제목·문단·구분선·인용을 나눈다', () => {
  const blocks = plain(parseMarkdown('# 계획\n\n첫 줄\n둘째 줄\n\n---\n\n> 메모\n> 이어짐\n## 단계'))
  assert.deepEqual(blocks.map(b => b.type), ['heading', 'paragraph', 'rule', 'quote', 'heading'])
  assert.equal(blocks[0].level, 1)
  assert.equal(plainText(blocks[1].children), '첫 줄\n둘째 줄')
  assert.equal(blocks[3].children[0].type, 'paragraph')
  assert.equal(blocks[4].level, 2)
})

test('목록: 순서·시작 번호·체크·중첩·이어지는 줄', () => {
  const [list] = plain(parseMarkdown('3. [x] 구조 읽기\n   설명 이어짐\n4. [ ] 탭 만들기\n   - 아래 단계\n   - 또 하나\n5. 마무리'))
  assert.equal(list.type, 'list')
  assert.equal(list.ordered, true)
  assert.equal(list.start, 3)
  assert.deepEqual(list.items.map(item => item.checked), [true, false, null])
  assert.equal(plainText(list.items[0].children[0].children), '구조 읽기\n설명 이어짐')
  const nested = list.items[1].children[1]
  assert.equal(nested.type, 'list')
  assert.equal(nested.ordered, false)
  assert.equal(nested.items.length, 2)
})

test('문단 바로 뒤의 목록도 목록으로 읽고, 빈 줄로 띄운 항목은 한 목록으로 잇는다', () => {
  const blocks = plain(parseMarkdown('바꿀 것:\n- 가\n\n- 나\n\n끝'))
  assert.deepEqual(blocks.map(b => b.type), ['paragraph', 'list', 'paragraph'])
  assert.equal(blocks[1].items.length, 2)
})

test('코드 울타리 안은 해석하지 않는다', () => {
  const [code, after] = plain(parseMarkdown('```js\n# 제목 아님\n- 목록 아님\n```\n뒤 문단'))
  assert.deepEqual(code, { type: 'code', lang: 'js', text: '# 제목 아님\n- 목록 아님' })
  assert.equal(after.type, 'paragraph')
})

test('표: 머리·정렬·칸 안 코드의 | 는 나누지 않는다', () => {
  const [table] = plain(parseMarkdown('| 파일 | 할 일 |\n|:---|---:|\n| `a|b` | **고침** |\n| c |'))
  assert.equal(table.type, 'table')
  assert.deepEqual(table.align, ['left', 'right'])
  assert.equal(plainText(table.head[1]), '할 일')
  assert.equal(table.rows[0][0][0].type, 'code')
  assert.equal(table.rows[0][0][0].value, 'a|b')
  assert.equal(table.rows[0][1][0].type, 'strong')
  assert.equal(table.rows[1].length, 2, '모자란 칸은 빈칸으로 채운다')
})

test('인라인: 굵게·기울임·취소선·코드·링크, snake_case는 그대로', () => {
  const nodes = plain(parseInline('**굵게** *기울임* ~~취소~~ `x*y*` [문서](https://example.com) some_snake_case'))
  assert.deepEqual(nodes.filter(n => n.type !== 'text').map(n => n.type), ['strong', 'em', 'del', 'code', 'link'])
  assert.equal(nodes.find(n => n.type === 'code').value, 'x*y*')
  assert.equal(nodes.find(n => n.type === 'link').href, 'https://example.com')
  assert.match(plainText(nodes), /some_snake_case$/)
})

test('위험한 주소·HTML·그림은 열지 않는다', () => {
  const nodes = plain(parseInline('[누르기](javascript:alert(1)) <b>굵게</b> ![그림](https://x/y.png)'))
  assert.ok(nodes.every(n => n.type === 'text'), '링크·그림 노드가 없다')
  assert.equal(plainText(nodes), '누르기 <b>굵게</b> 그림')
})

test('짝이 없는 표시는 글자로 남고, 줄 끝 공백 둘은 줄바꿈이 된다', () => {
  assert.equal(plainText(parseInline('2 * 3 = 6, **열림')), '2 * 3 = 6, **열림')
  const [p] = plain(parseMarkdown('가  \n나'))
  assert.deepEqual(p.children.map(n => n.type), ['text', 'break', 'text'])
})
