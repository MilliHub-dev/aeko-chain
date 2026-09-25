import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminExplorerUrl } from '../../../../lib/network'

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const EXPLORER_URL = resolveAdminExplorerUrl()
  const subpath = '/' + params.path.join('/')
  const search = req.nextUrl.search
  const url = `${EXPLORER_URL}${subpath}${search}`

  try {
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Explorer unreachable'
    return NextResponse.json({ error: { message: msg } }, { status: 503 })
  }
}
