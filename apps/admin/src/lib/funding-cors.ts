import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_ALLOWED_ORIGINS = ['https://scan.aeko.online']

function allowedOrigins() {
  const configured = (process.env.FUNDING_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  const origins = new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS)
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
