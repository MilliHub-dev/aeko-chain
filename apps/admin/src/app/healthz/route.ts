import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const headers = {
  'Cache-Control': 'no-store, max-age=0',
}

export async function GET() {
  return NextResponse.json(
    { status: 'ok', service: 'aeko-operations-web' },
    { status: 200, headers },
  )
}

export async function HEAD() {
  return new NextResponse(null, { status: 200, headers })
}
