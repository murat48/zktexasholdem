import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { system, prompt } = await req.json();
    
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: 'Claude API key not configured' },
        { status: 500 }
      );
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        temperature: 0.8,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Claude API error:', { status: res.status, body: errText });
      return NextResponse.json(
        { error: `Claude API ${res.status}`, details: errText },
        { status: res.status }
      );
    }

    const data = await res.json();
    
    if (!data.content || !data.content[0]) {
      return NextResponse.json(
        { error: 'Invalid Claude response format' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      text: data.content[0].text,
      tokens: data.usage,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Claude handler error:', msg);
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
