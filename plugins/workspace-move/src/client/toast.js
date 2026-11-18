// 옮기기 결과를 잠깐 보여 주는 알림. 대화상자 없이 드래그로 옮길 때 쓴다.
function createToastStore() {
  let toast = null
  const listeners = new Set()
  return {
    get: () => toast,
    set(next) {
      toast = next
      for (const listener of [...listeners]) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

const toastStore = createToastStore()
let toastSeq = 0

function showToast(text, tone = 'info', ms = 5000) {
  const toast = { id: (toastSeq += 1), text, tone }
  toastStore.set(toast)
  if (ms > 0) {
    setTimeout(() => {
      if (toastStore.get()?.id === toast.id) toastStore.set(null)
    }, ms)
  }
  return toast.id
}

function MoveToast() {
  const toast = React.useSyncExternalStore(toastStore.subscribe, toastStore.get, toastStore.get)
  if (toast === null) return null
  return h('div', {
    className: `dwm-toast dwm-toast-${toast.tone}`,
    role: toast.tone === 'error' ? 'alert' : 'status',
  }, toast.text)
}
