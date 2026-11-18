import { spawn } from 'node:child_process'

const MAX_LINE = 512 * 1024
const IDLE_MS = 5 * 60_000

// This transport is private to the host. Calls come from the fixed code-map
// tool set, never from a model-selected MCP server or a client-defined method.
export function openGraph(executable, options, onClose) {
  const child = spawn(executable, [], { ...options, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
  const pending = new Map()
  let nextId = 0
  let buffer = ''
  let closed = false
  let idle

  function close(error = new Error('analysis-failed')) {
    if (closed) return
    closed = true
    clearTimeout(idle)
    child.kill('SIGKILL')
    for (const call of pending.values()) call.reject(error)
    onClose()
  }

  function send(value) {
    if (!closed) child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\n')
  }

  function touch() {
    clearTimeout(idle)
    if (!pending.size) {
      idle = setTimeout(close, IDLE_MS)
      idle.unref()
    }
  }

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    buffer += chunk
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      if (newline > MAX_LINE) return close()
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      try {
        const reply = JSON.parse(line)
        const call = pending.get(reply.id)
        if (call && !reply.method) {
          if (reply.error) call.reject(new Error('analysis-failed'))
          else call.resolve(reply.result)
        } else if (reply.method === 'ping' && reply.id !== undefined) {
          send({ id: reply.id, result: {} })
        } else if (reply.method && reply.id !== undefined) {
          send({ id: reply.id, error: { code: -32601, message: 'Method not found' } })
        }
      } catch { return close() }
      newline = buffer.indexOf('\n')
    }
    if (buffer.length > MAX_LINE) close()
  })
  child.on('error', close)
  child.on('exit', () => close())
  child.stdin.on('error', close)

  function request(method, params, signal, timeout) {
    return new Promise((resolve, reject) => {
      if (closed || signal?.aborted) return reject(new Error('analysis-failed'))
      const id = ++nextId
      const control = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
      const finish = (callback, value) => {
        pending.delete(id)
        control.removeEventListener('abort', stop)
        if (!closed) touch()
        callback(value)
      }
      const stop = () => {
        send({ method: 'notifications/cancelled', params: { requestId: id } })
        finish(reject, new Error('analysis-failed'))
      }
      control.addEventListener('abort', stop, { once: true })
      pending.set(id, { resolve: value => finish(resolve, value), reject: error => finish(reject, error) })
      touch()
      send({ id, method, params })
    })
  }

  const ready = request('initialize', {
    protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'dsh-code-map', version: '1.0.0' },
  }, undefined, 5000).then(() => send({ method: 'notifications/initialized' }))
  ready.catch(close)

  return {
    close,
    async call(tool, args, { signal, timeout }) {
      await ready
      const response = await request('tools/call', { name: tool, arguments: args }, signal, timeout)
      if (response?.isError) throw new Error('analysis-failed')
      const content = response?.content?.find(item => item.type === 'text')
      return JSON.parse(content?.text ?? '')
    },
  }
}
