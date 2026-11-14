// Changed files as unified diffs: one collapsible section per file, long lines wrap.
import { useMemo } from 'preact/hooks'
import { diffLines } from '../lib/diff.js'
import { baseName } from '../lib/util.js'
import { Sheet } from './Sheet.jsx'

const SIGN_LABEL = { '+': '추가', '-': '삭제', ' ': '' }

function FileDiff({ file, open }) {
  const result = useMemo(() => diffLines(file.oldText, file.newText), [file])
  return (
    <details class="diff-file" open={open}>
      <summary>
        <span class="diff-name one-line">{baseName(file.path)}</span>
        <span class="diff-count">
          {file.oldText === null ? <span class="tag">새 파일</span> : null}
          <span class="add">+{result.added}</span>
          <span class="del">−{result.removed}</span>
        </span>
        <span class="diff-path muted small">{file.path}</span>
      </summary>
      {result.hunks.length === 0 ? <p class="muted small diff-empty">달라진 줄이 없습니다.</p> : null}
      {result.hunks.map((hunk, h) => (
        <div class="hunk" key={h} data-qa-multiline role="table" aria-label={`${baseName(file.path)} 변경 ${String(h + 1)}`}>
          {hunk.lines.map((line, n) => (
            <div class={`dl dl-${line.type === '+' ? 'add' : line.type === '-' ? 'del' : 'ctx'}`} role="row" key={n}>
              <span class="dl-no" role="cell" aria-hidden="true">{line.type === '+' ? '' : line.oldNo}</span>
              <span class="dl-no" role="cell" aria-hidden="true">{line.type === '-' ? '' : line.newNo}</span>
              <span class="dl-sign" role="cell" aria-label={SIGN_LABEL[line.type]}>{line.type === ' ' ? '' : line.type === '-' ? '−' : '+'}</span>
              <span class="dl-text" role="cell">{line.text || ' '}</span>
            </div>
          ))}
        </div>
      ))}
    </details>
  )
}

export function DiffSheet({ title, files, onClose }) {
  return (
    <Sheet title={title} onClose={onClose} full>
      <p class="muted small">파일 {files.length}개</p>
      {files.map((file, i) => <FileDiff key={`${file.path}-${String(i)}`} file={file} open={files.length <= 3} />)}
    </Sheet>
  )
}
