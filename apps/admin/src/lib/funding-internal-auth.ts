import { timingSafeEqual } from 'node:crypto'
import { NextRequest } from 'next/server'

const HEADER = 'x-aeko-funding-admin-key'

function configuredKey(): string {
  return (process.env.FUNDING_ADMIN_API_KEY ?? '').trim()
}

export function isAuthorizedFundingAdminRequest(req: NextRequest): boolean {
  const expected = configuredKey()
  const supplied = (req.headers.get(HEADER) ?? '').trim()
  if (!expected || !supplied) return false

  const expectedBytes = Buffer.from(expected)
  const suppliedBytes = Buffer.from(supplied)
  return expectedBytes.length === suppliedBytes.length
    && timingSafeEqual(expectedBytes, suppliedBytes)
}

export const FUNDING_ADMIN_HEADER = HEADER
