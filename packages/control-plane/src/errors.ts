/** A request the operator can fix (bad input, conflict, missing record). */
export class ControlPlaneError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message)
    this.name = 'ControlPlaneError'
  }
}
