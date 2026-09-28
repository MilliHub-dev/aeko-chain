export const dynamic = 'force-dynamic'

export async function GET() {
  return new Response('ok\n', {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
    },
  })
}
