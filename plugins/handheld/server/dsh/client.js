// One live API-caller connection to the DSH Host, kept up with capped,
// jittered backoff. A connection generation starts when `$events` sends its
// `ready` item; every pending approval is re-sent by the Host for the new
// generation, so listeners rebuild their pending list on 'generation'.
import { EventEmitter } from 'node:events'
import { connectApi, rpcCall } from './connection.js'
import { MuxSocket } from './mux.js'
import { DshError } from './errors.js'

const BACKOFF_CAPS_MS = [500, 1000, 2000, 4000, 8000, 10000]

export class DshClient extends EventEmitter {
  /**
   * @param {object} options
   * @param {() => string | Promise<string>} options.upstreamUrl - Host URL with launch token, read on every attempt
   * @param {{info: Function, warn: Function}} [options.logger]
   * @param {(attempt: number) => number} [options.backoff]
   */
  constructor({ upstreamUrl, logger = console, backoff }) {
    super()
    this.upstreamUrl = upstreamUrl
    this.logger = logger
    this.backoff = backoff ?? ((attempt) => {
      const cap = BACKOFF_CAPS_MS[Math.min(attempt, BACKOFF_CAPS_MS.length - 1)]
      return cap / 2 + Math.random() * (cap / 2)
    })
    this.state = 'down'
    this.session = null
    this.mux = null
    this.clientId = null
    this.home = null
    this.generation = 0
    this.stopped = true
    this.timer = null
  }

  start() {
    if (!this.stopped) return
    this.stopped = false
    void this.#run(0)
  }

  stop() {
    this.stopped = true
    clearTimeout(this.timer)
    this.mux?.close()
    this.mux = null
    this.#setState('down')
  }

  /** Unary call on the current connection. */
  rpc(endpoint, args, options) {
    if (!this.session) return Promise.reject(new DshError('client/offline', 'not connected to DSH'))
    return rpcCall(this.session, endpoint, args, options)
  }

  /** Open a logical stream on the current connection. */
  open(endpoint, args) {
    if (!this.mux || this.state !== 'connected') throw new DshError('client/offline', 'not connected to DSH')
    return this.mux.open(endpoint, args)
  }

  /** Answer one forwarded waterfall of the current generation. */
  answer(eventId, value) {
    if (!this.clientId) return Promise.reject(new DshError('client/offline', 'not connected to DSH'))
    return this.rpc('$events/result', { clientId: this.clientId, eventId, outcome: { kind: 'result', value } })
  }

  #setState(state, detail) {
    if (this.state === state) return
    this.state = state
    this.emit('state', state, detail)
  }

  async #run(attempt) {
    if (this.stopped) return
    this.#setState('connecting')
    try {
      const url = await this.upstreamUrl()
      this.session = await connectApi(url)
      const mux = await MuxSocket.connect(this.session)
      if (this.stopped) { mux.close(); return }
      this.mux = mux
      const events = mux.open('$events', {})
      const first = await events.next()
      if (first.done || first.value?.type !== 'ready') throw new DshError('client/not-ready', '$events did not open with ready')
      this.clientId = first.value.clientId
      this.home = first.value.host?.home ?? null
      this.generation += 1
      this.#setState('connected')
      this.emit('generation', this.generation)
      await this.#pumpEvents(events)
      throw new DshError('client/events-ended', '$events ended')
    } catch (error) {
      this.clientId = null
      this.mux?.close()
      this.mux = null
      if (this.stopped) return
      // A connection that reached `ready` starts the backoff ladder over.
      const nextAttempt = this.reachedReady ? 0 : attempt + 1
      this.reachedReady = false
      const delay = this.backoff(nextAttempt)
      this.logger.warn?.(`[dsh-handheld] DSH connection lost (${error.code ?? error.message}); retrying in ${Math.round(delay)} ms`)
      this.#setState('connecting', error.code ?? 'error')
      this.timer = setTimeout(() => void this.#run(nextAttempt), delay)
    }
  }

  async #pumpEvents(events) {
    this.reachedReady = true
    for await (const frame of events) {
      if (frame?.type === 'waterfall') this.emit('waterfall', frame)
      else if (frame?.type === 'cancel') this.emit('cancel', frame.eventId)
      else if (frame?.type === 'emit') this.emit('emit', frame.event, frame.args ?? [])
    }
  }
}
