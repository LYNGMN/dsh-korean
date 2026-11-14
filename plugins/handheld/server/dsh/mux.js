// `/api/remote.mux`: one WebSocket carrying many logical Remote streams.
// Client frames: open | item | end | cancel. Host frames: item | error | end.
// The Host pings every 2 s; `ws` answers pongs for us, so no app heartbeat here.
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { DshError } from './errors.js'

export class MuxSocket {
  /** @param {{origin: string, cookie: string}} session */
  static connect(session, { timeoutMs = 15000 } = {}) {
    const url = session.origin.replace(/^http/, 'ws') + '/api/remote.mux'
    const socket = new WebSocket(url, { headers: { cookie: session.cookie }, perMessageDeflate: true })
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.terminate(); reject(new DshError('mux/timeout', 'mux handshake timed out')) }, timeoutMs)
      socket.once('open', () => { clearTimeout(timer); resolve(new MuxSocket(socket)) })
      socket.once('unexpected-response', (_req, res) => { clearTimeout(timer); reject(new DshError('mux/refused', `Host answered ${String(res.statusCode)}`)) })
      socket.once('error', (error) => { clearTimeout(timer); reject(new DshError('mux/error', error.message)) })
    })
  }

  constructor(socket) {
    this.socket = socket
    this.streams = new Map()
    this.closed = false
    this.closeListeners = new Set()
    socket.on('message', (data) => this.#receive(data))
    socket.on('close', (code, reason) => this.#shutdown(new DshError('mux/closed', `mux closed (${String(code)}) ${reason.toString()}`)))
    socket.on('error', (error) => this.#shutdown(new DshError('mux/error', error.message)))
  }

  onClose(listener) {
    this.closeListeners.add(listener)
    return () => this.closeListeners.delete(listener)
  }

  /**
   * Open a logical stream.
   * @param {string} endpoint
   * @param {Record<string, unknown>} args
   * @returns {MuxStream}
   */
  open(endpoint, args) {
    if (this.closed) throw new DshError('mux/closed', 'mux is closed')
    const stream = new MuxStream(this, randomUUID())
    this.streams.set(stream.id, stream)
    this.#send({ type: 'open', streamId: stream.id, endpoint, payload: { args } })
    return stream
  }

  close() {
    this.socket.close(1000, 'client closing')
    this.#shutdown(new DshError('mux/closed', 'closed by client'))
  }

  /** @internal */
  sendFrame(frame) { this.#send(frame) }

  /** @internal */
  forget(id) { this.streams.delete(id) }

  #send(frame) {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify(frame))
  }

  #receive(data) {
    let frame
    try { frame = JSON.parse(data.toString()) } catch { return }
    const stream = this.streams.get(frame?.streamId)
    if (!stream) return
    if (frame.type === 'item') stream.push(frame.value)
    else if (frame.type === 'end') stream.finish()
    else if (frame.type === 'error') stream.fail(new DshError(frame.error?.code ?? 'stream/error', frame.error?.message ?? 'stream failed', frame.error?.details))
  }

  #shutdown(error) {
    if (this.closed) return
    this.closed = true
    for (const stream of this.streams.values()) stream.fail(error)
    this.streams.clear()
    for (const listener of this.closeListeners) listener(error)
  }
}

/** One logical stream: async-iterable over Host items. */
export class MuxStream {
  constructor(mux, id) {
    this.mux = mux
    this.id = id
    this.queue = []
    this.waiters = []
    this.done = false
    this.error = undefined
  }

  /** @internal */
  push(value) {
    if (this.done) return
    const waiter = this.waiters.shift()
    if (waiter) waiter.resolve({ value, done: false })
    else this.queue.push(value)
  }

  /** @internal */
  finish() { this.#settle(undefined) }

  /** @internal */
  fail(error) { this.#settle(error) }

  /** Send an uplink item. */
  send(value) { this.mux.sendFrame(value === undefined ? { type: 'item', streamId: this.id } : { type: 'item', streamId: this.id, value }) }

  /** Stop reading; tells the Host to cancel unless already finished. */
  cancel() {
    if (this.done) return
    this.mux.sendFrame({ type: 'cancel', streamId: this.id })
    this.#settle(undefined)
  }

  #settle(error) {
    if (this.done) return
    this.done = true
    this.error = error
    this.mux.forget(this.id)
    for (const waiter of this.waiters.splice(0)) {
      if (error) waiter.reject(error)
      else waiter.resolve({ value: undefined, done: true })
    }
  }

  next() {
    if (this.queue.length > 0) return Promise.resolve({ value: this.queue.shift(), done: false })
    if (this.done) return this.error ? Promise.reject(this.error) : Promise.resolve({ value: undefined, done: true })
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }))
  }

  return() {
    this.cancel()
    return Promise.resolve({ value: undefined, done: true })
  }

  [Symbol.asyncIterator]() { return this }
}
