// BaZi with Bry: quick overview (teaser) through Claude.
// Needs two environment variables in Netlify (Site configuration > Environment variables):
//   ANTHROPIC_API_KEY  your key from console.anthropic.com
//   BRY_PASSCODE       the passcode people must type to use the button
// Optional: ANTHROPIC_MODEL (defaults to claude-sonnet-5)

const SYSTEM = `You are the writer for "BaZi with Bry", a classical BaZi practice. You write a QUICK OVERVIEW: a short teaser reading that gives real value from the chart, then leaves the reader curious enough to request Bry's full in depth reading.

Hard rules:
1. Use only the chart data supplied. Never invent life events, relationships, jobs, places, health history or anything not in the data. Describe climate, pressure, capacity and timing, never certainties: "this year makes X more likely", not "X will happen".
2. Voice: plain language and accessible, warm and direct, speaking to the reader as "you". Keep essential BaZi terms (Day Master, Luck Pillar, Ten Gods, Palaces, clashes, combinations) so the reader can cross reference, but explain each in a few plain words the first time.
3. Never use em dashes, en dashes, or hyphens as dashes. Never use emojis. No tables.
4. Avoid catastrophic or fear words (destruction, collapse, disaster, doomed, danger, warning). Never hint at hidden threats or secret bad news to create urgency. Curiosity must come from withholding detail, never from fear.
5. Combinations are attributed elements, not confirmed transformations.
6. Length: 380 to 480 words. Markdown only: "## " for headings, "**bold**" for one takeaway line per section, "- " for bullets.

What to reveal and what to hold back:
- Reveal: the overall theme of the focus year, the Day Master personality, and how the year's energy meets the current Luck Pillar.
- Money and career: name ONE real signal from the data (for example which Ten God group rises, or which Palace the year activates) and what kind of climate it creates. Do NOT give timing, specific months, amounts, strategies or what to do. End that section with one curiosity line about what the full reading maps out.
- Love and relationships: name ONE real signal (for example a clash, harm or combination on the Day Pillar, the Spouse Palace, or none, in which case say the relationship story sits elsewhere in the chart). Do NOT give timing or advice. Never assume the reader's relationship status. End with one curiosity line.
- Months: say how many months stand out in the monthly data and name only ONE of them with a single line on its flavour. Say the others are covered in the full reading.

Sections, in this order:
## The big picture for YEAR
Day Master, Luck Pillar and the year in plain words. One bold takeaway.
## Who you are, in a nutshell
Three or four sentences that make the reader think "that's me", drawn from the Day Master and strongest Ten Gods.
## Work and money: a glimpse
## Love and relationships: a glimpse
## One month to circle
## Want the full picture?
Two or three sentences: Bry's full in depth reading covers the month by month forecast, money and career timing, relationship timing, health and energy, and the months worth circling. Invite them to tap "Request an in depth reading" on this page. Confident and inviting, never pushy.

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
      max_tokens: 1400,
      stream: true,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Focus year: ${year}\n\nCALCULATED CHART DATA\n${chart}\n\nBUILT IN QUICK READING (rule based, for reference)\n${quick}\n\nWrite the quick overview now.`
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
