import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = ['http2.mlstatic.com', 'mla-s1-p.mlstatic.com', 'mla-s2-p.mlstatic.com'];

export async function GET(req: NextRequest) {
  const imageUrl = new URL(req.url).searchParams.get('url');
  if (!imageUrl) return new NextResponse('Missing URL', { status: 400 });

  try {
    const parsed = new URL(imageUrl);
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return new NextResponse('Hostname not allowed', { status: 403 });
    }
    const response = await fetch(imageUrl, { next: { revalidate: 2592000 } });
    if (!response.ok) throw new Error('Fetch failed');
    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': response.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=2592000, immutable',
      },
    });
  } catch {
    return new NextResponse('Error proxying image', { status: 500 });
  }
}
