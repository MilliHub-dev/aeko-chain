export class EditorRequestError extends Error {
  readonly code?: string
  readonly status: number

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'EditorRequestError'
    this.status = status
    if (code !== undefined) this.code = code
  }
}

export function errorMessage(value: unknown, fallback = 'Contract Studio operation failed.'): string {
  if (value instanceof Error && value.message) return value.message
  if (typeof value === 'string' && value) return value
  return fallback
}

export function errorStatus(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || !('status' in value)) return undefined
  const status = Number(value.status)
  return Number.isInteger(status) ? status : undefined
}

export function errorCode(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('code' in value)) return undefined
  return typeof value.code === 'string' ? value.code : undefined
}
