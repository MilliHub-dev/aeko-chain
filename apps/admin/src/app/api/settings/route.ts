import { NextRequest, NextResponse } from 'next/server'

const EXPLORER_URL = process.env.AEKO_EXPLORER_URL ?? 'http://localhost:8088'
const SETTINGS_TOKEN = process.env.AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN ?? ''

async function explorerSettings(init?: RequestInit) {
  try {
    const response = await fetch(`${EXPLORER_URL}/settings`, {
      cache: 'no-store',
      ...init,
    })
    const text = await response.text()
    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      return NextResponse.json(
        { error: { message: 'Explorer settings service returned an invalid response' } },
        { status: 502 },
      )
    }
    return NextResponse.json(payload, { status: response.status })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Explorer settings service unavailable'
    return NextResponse.json({ error: { message } }, { status: 503 })
  }
}

export async function GET() {
  return explorerSettings()
}

export async function PATCH(req: NextRequest) {
  if (SETTINGS_TOKEN.length < 32) {
    return NextResponse.json(
      { error: { message: 'Explorer settings control plane is not configured' } },
      { status: 503 },
    )
  }

  const body = await req.text()
  return explorerSettings({
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-aeko-settings-token': SETTINGS_TOKEN,
    },
    body,
  })
}
