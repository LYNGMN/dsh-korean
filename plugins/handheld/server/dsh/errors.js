/** Failure reported by the DSH Host or by the path to it. */
export class DshError extends Error {
  constructor(code, message, details) {
    super(message)
    this.name = 'DshError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}
