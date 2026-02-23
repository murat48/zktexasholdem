import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { system, prompt } = await req.json();
    
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.8,
        max_tokens: 120,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('OpenAI API error:', { status: res.status, body: errText });
      return NextResponse.json(
        { error: `OpenAI API ${res.status}`, details: errText },
        { status: res.status }
      );
    }

    const data = await res.json();
    
    if (!data.choices || !data.choices[0]) {
      return NextResponse.json(
        { error: 'Invalid OpenAI response format' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      text: data.choices[0].message.content,
      tokens: data.usage,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('OpenAI handler error:', msg);
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
