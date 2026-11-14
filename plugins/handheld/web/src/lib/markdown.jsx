// A small Markdown subset rendered straight to elements (never innerHTML):
// fenced code, headings, lists, quotes, paragraphs, `code`, **bold**, *em*, links.

import { toast } from '../store.js'
import { Icon } from '../components/Icon.jsx'

const SAFE_LINK = /^https?:\/\//i

// For browsers that refuse the clipboard API (older WebViews, some in-app browsers).
function copyBySelection(text) {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px'
  // Inside an open sheet only the sheet can take focus.
  const host = document.querySelector('dialog[open]') ?? document.body
  host.append(area)
  area.select()
  const done = document.execCommand('copy')
  area.remove()
  return done
}

async function copyText(text, opener) {
  let done = false
  try {
    await navigator.clipboard.writeText(text)
    done = true
  } catch {
    done = copyBySelection(text)
    opener?.focus({ preventScroll: true })
  }
  if (done) toast('복사했습니다')
  else toast('복사하지 못했습니다. 글자를 길게 눌러 복사해 주세요', { tone: 'error' })
}

function CodeBlock({ lang, code }) {
  const name = lang ? `${lang} 코드` : '코드'
  return (
    <div class="md-codeblock">
      <div class="md-code-head">
        <span class="md-code-lang muted small one-line">{lang || '코드'}</span>
        <button type="button" class="link-btn" aria-label={`${name} 복사`} onClick={(e) => copyText(code, e.currentTarget)}><Icon name="copy" size={16} />복사</button>
      </div>
      <pre class="md-code" tabIndex={0} role="group" aria-label={name}><code>{code}</code></pre>
    </div>
  )
}

function inline(text, keyBase) {
  const out = []
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\s]+\))/g
  let last = 0
  let match
  let n = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyBase}-${String(n++)}`
    if (match[1]) out.push(<code key={key}>{token.slice(1, -1)}</code>)
    else if (match[2]) out.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (match[3]) out.push(<em key={key}>{token.slice(1, -1)}</em>)
    else {
      const label = token.slice(1, token.indexOf(']'))
      const href = token.slice(token.indexOf('(') + 1, -1)
      out.push(SAFE_LINK.test(href) ? <a key={key} href={href} target="_blank" rel="noopener noreferrer">{label}</a> : `${label} (${href})`)
    }
    last = match.index + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function withBreaks(lines, keyBase) {
  return lines.flatMap((line, i) => (i === 0 ? inline(line, `${keyBase}-${String(i)}`) : [<br key={`${keyBase}-br-${String(i)}`} />, ...inline(line, `${keyBase}-${String(i)}`)]))
}

export function Markdown({ text }) {
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const key = `b${String(i)}`
    const fence = /^\s*```\s*([\w+-]*)/.exec(line)
    if (fence) {
      const body = []
      i += 1
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++])
      i += 1
      blocks.push(<CodeBlock key={key} lang={fence[1]} code={body.join('\n')} />)
      continue
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push(<p key={key} class={`md-h md-h${String(heading[1].length)}`} role="heading" aria-level={Math.min(6, heading[1].length + 2)}>{inline(heading[2], key)}</p>)
      i += 1
      continue
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line)
      const entries = []
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        entries.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ''))
        i += 1
      }
      const items = entries.map((entry, n) => <li key={`${key}-${String(n)}`}>{inline(entry, `${key}-${String(n)}`)}</li>)
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>)
      continue
    }
    if (/^>\s?/.test(line)) {
      const quoted = []
      while (i < lines.length && /^>\s?/.test(lines[i])) quoted.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push(<blockquote key={key}>{withBreaks(quoted, key)}</blockquote>)
      continue
    }
    if (line.trim() === '') {
      i += 1
      continue
    }
    const para = []
    while (i < lines.length && lines[i].trim() !== '' && !/^\s*```/.test(lines[i]) && !/^(#{1,4})\s/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) && !/^>/.test(lines[i])) {
      para.push(lines[i++])
    }
    blocks.push(<p key={key}>{withBreaks(para, key)}</p>)
  }
  return <div class="md">{blocks}</div>
}
