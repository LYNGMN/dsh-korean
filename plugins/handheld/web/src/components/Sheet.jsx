// Modal sheet on the native <dialog>: focus stays inside, Escape and the
// backdrop close it, focus returns to whatever opened it.
import { useEffect, useRef } from 'preact/hooks'
import { Icon } from './Icon.jsx'

export function Sheet({ title, onClose, children, full = false, labelId = 'sheet-title' }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement
    if (dialog && !dialog.open) dialog.showModal()
    return () => {
      if (dialog?.open) dialog.close()
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true })
    }
  }, [])
  return (
    <dialog
      ref={ref}
      class={`sheet${full ? ' sheet-full' : ''}`}
      aria-labelledby={labelId}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
    >
      <div class="sheet-body">
        <div class="sheet-head">
          <h2 id={labelId} class="sheet-title">{title}</h2>
          <button type="button" class="icon-btn" aria-label="닫기" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div class="sheet-content">{children}</div>
      </div>
    </dialog>
  )
}
