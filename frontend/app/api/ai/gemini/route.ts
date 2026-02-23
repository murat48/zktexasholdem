import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { system, prompt } = await req.json();
    
    const key = process.env.GOOGLE_GEMINI_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: 'Gemini API key not configured' },
        { status: 500 }
      );
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 120,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error('Gemini API error:', { status: res.status, body: errText });
      return NextResponse.json(
        { error: `Gemini API ${res.status}`, details: errText },
        { status: res.status }
      );
    }

    const data = await res.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      return NextResponse.json(
        { error: 'Invalid Gemini response format' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      text: data.candidates[0].content.parts[0].text,
      tokens: data.usageMetadata,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Gemini handler error:', msg);
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
