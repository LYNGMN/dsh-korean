// Recent normalized items of one session, bounded by encoded size.
// Normalized items are sparse (Host events we do not show produce none), so the
// cache tracks the seq range it has seen completely, [coveredFrom, coveredThrough],
// separately from the items it holds. A phone can be served from the cache only
// when its cursor falls inside that range.

export class SessionCache {
  constructor({ maxBytes = 512 * 1024 } = {}) {
    this.maxBytes = maxBytes
    this.items = []
    this.sizes = []
    this.bytes = 0
    this.coveredFrom = null
    this.coveredThrough = null
  }

  get oldestSeq() { return this.items.length > 0 ? this.items[0].seq : null }
  get latestSeq() { return this.items.length > 0 ? this.items[this.items.length - 1].seq : null }

  /**
   * Record items produced from Host events `from..through`, a range the source
   * delivered completely (snapshot, history page, or the live follow stream).
   * @param {Array<{seq: number}>} items
   * @param {{from: number, through: number}} range
   */
  append(items, { from, through }) {
    for (const entry of items) this.#put(entry)
    if (this.coveredFrom === null || from > this.coveredThrough + 1 || through < this.coveredFrom - 1) {
      // Disjoint from what we knew: the newer range wins.
      if (this.coveredThrough === null || through >= this.coveredThrough) {
        this.coveredFrom = from
        this.coveredThrough = through
        this.#dropBefore(from)
      }
    } else {
      this.coveredFrom = Math.min(this.coveredFrom, from)
      this.coveredThrough = Math.max(this.coveredThrough, through)
    }
    this.#trim()
  }

  /**
   * Items newer than `cursor`, or null when the cache cannot prove it has all of them.
   * @param {number | null} cursor - last seq the phone holds; null when it holds nothing.
   */
  since(cursor) {
    if (cursor === null || this.coveredFrom === null) return null
    if (cursor + 1 < this.coveredFrom || cursor > this.coveredThrough) return null
    return this.items.filter((i) => i.seq > cursor)
  }

  #put(entry) {
    const size = Buffer.byteLength(JSON.stringify(entry))
    let lo = 0
    let hi = this.items.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.items[mid].seq < entry.seq) lo = mid + 1
      else hi = mid
    }
    if (this.items[lo]?.seq === entry.seq) {
      this.bytes += size - this.sizes[lo]
      this.items[lo] = entry
      this.sizes[lo] = size
      return
    }
    this.items.splice(lo, 0, entry)
    this.sizes.splice(lo, 0, size)
    this.bytes += size
  }

  #dropBefore(seq) {
    while (this.items.length > 0 && this.items[0].seq < seq) {
      this.items.shift()
      this.bytes -= this.sizes.shift()
    }
  }

  #trim() {
    while (this.bytes > this.maxBytes && this.items.length > 1) {
      const dropped = this.items.shift()
      this.bytes -= this.sizes.shift()
      this.coveredFrom = Math.max(this.coveredFrom, dropped.seq + 1)
    }
  }
}
