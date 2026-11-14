// BaZi with Bry: full written reading through Claude.
// Needs two environment variables in Netlify (Site configuration > Environment variables):
//   ANTHROPIC_API_KEY  your key from console.anthropic.com
//   BRY_PASSCODE       the passcode people must type to use the button
// Optional: ANTHROPIC_MODEL (defaults to claude-sonnet-5)

const SYSTEM = `You are the writer for "BaZi with Bry", a classical BaZi practice. You turn a calculated BaZi chart into a short, client ready written reading.

Hard rules:
1. Use only the chart data supplied. Never invent life events, relationships, jobs, places, health history or anything not in the data. Describe climate and probabilities, never certainties: write "this year makes X more likely", not "X will happen".
2. Voice: plain, warm, direct and casual, speaking to the reader as "you". Short paragraphs. No sugarcoating and no reassurance padding, but never fatalistic: frame hard cycles with duality (the pressure also builds something).
3. Never use em dashes, en dashes, or hyphens as dashes. Never use emojis. Do not use tables.
4. Avoid catastrophic words (destruction, collapse, disaster, doomed). Use grounded words: pressure, restructuring, higher energetic cost, adaptation.
5. Combinations are attributed elements, not confirmed transformations. Do not claim a transformation happened.
6. Keep technical terms out of the main text. Put them only in the final "For practitioners" section.
7. Length: 700 to 950 words. Markdown only: "## " for section headings, "**bold**" for lead phrases, "- " for bullet points.

Sections, in this order:
## Who you are
The Day Master and the strongest Ten Gods as a recognisable personality. End with two short lines starting "**The good side:**" and "**The not so good side:**".
## Your sign in YEAR
Chinese and Vietnamese animal against the year's animal, using the relationship given in the data.
## The decade you are in
The current Luck Pillar in plain language: what this stretch of life is about and what it asks of the person.
## YEAR at a glance
What the year's stem and branch bring, which Ten God groups rise or fall, and where the year hits the chart (career, partner and home, social circle, projects). Name the most active months from the monthly data.
## What to do
4 to 6 practical bullet points tied directly to the data.
## For practitioners
3 to 5 compact bullets with the technical basis (pillars, Ten Gods, interactions, strength).

Replace YEAR with the focus year given in the data.`;

export default async (req) => {
  if (req.method === 'GET') {
    return Response.json({ ok: true, configured: Boolean(Netlify.env.get('ANTHROPIC_API_KEY') && Netlify.env.get('BRY_PASSCODE')) });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body;
  try { body = await req.json(); } catch { return new Response('Bad request', { status: 400 }); }

  const key = Netlify.env.get('ANTHROPIC_API_KEY');
  const pass = Netlify.env.get('BRY_PASSCODE');
  if (!key || !pass) return new Response('The reading service is not set up yet.', { status: 503 });
  if (!body || body.passcode !== pass) return new Response('Wrong passcode.', { status: 401 });

  const chart = String(body.chart || '').slice(0, 20000);
  const quick = String(body.quick || '').slice(0, 6000);
  const year = String(body.year || '').slice(0, 8);
  if (!chart) return new Response('No chart data was sent.', { status: 400 });

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: Netlify.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5',
      max_tokens: 2200,
      stream: true,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Focus year: ${year}\n\nCALCULATED CHART DATA\n${chart}\n\nBUILT IN QUICK READING (rule based, for reference)\n${quick}\n\nWrite the reading now.`
      }]
    })
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    console.error('Anthropic error', upstream.status, detail.slice(0, 500));
    return new Response('The reading service returned an error (' + upstream.status + '). Try again in a minute.', { status: 502 });
  }

  // Turn Anthropic's event stream into plain text chunks for the page.
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const event = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const line = event.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'content_block_delta' && data.delta && data.delta.type === 'text_delta') {
                controller.enqueue(encoder.encode(data.delta.text));
              }
            } catch { /* ignore keep-alive lines */ }
          }
        }
      } catch (err) {
        console.error('Stream error', err);
      }
      controller.close();
    }
  });

  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
};

export const config = {
  path: '/api/reading',
  rateLimit: { windowLimit: 20, windowSize: 600, aggregateBy: ['ip', 'domain'] }
};
