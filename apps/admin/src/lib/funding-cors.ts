import { NextRequest, NextResponse } from 'next/server'

function allowedOrigins() {
  const origins = new Set(
    (process.env.FUNDING_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:4000')
    origins.add('http://localhost:5173')
  }
  return origins
}

export function fundingCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin')
  if (!origin || !allowedOrigins().has(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function fundingPreflight(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: fundingCorsHeaders(req) })
}
