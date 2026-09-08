import { NextRequest, NextResponse } from 'next/server'

const EXPLORER_URL = process.env.AEKO_EXPLORER_URL ?? 'http://localhost:8088'

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const subpath = '/' + params.path.join('/')
  const search = req.nextUrl.search
  const url = `${EXPLORER_URL}${subpath}${search}`

  try {
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Explorer unreachable'
    return NextResponse.json({ error: { message: msg } }, { status: 503 })
  }
}
