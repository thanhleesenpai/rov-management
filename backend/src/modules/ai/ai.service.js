const { GoogleGenerativeAI } = require('@google/generative-ai');

let _model = null;
const getModel = () => {
  if (!_model) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
    _model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: 'gemini-2.5-flash' });
  }
  return _model;
};

const generateTripSummary = async (trip, dives = [], mediaCount = 0) => {
  const model = getModel();

  const diveLines = dives.map(d => {
    const loc = d.locationName ? ` @ ${d.locationName.split(',')[0].trim()}` : ''
    return `  - ${d.title} [${d.status}]${loc}${d.description ? ': ' + d.description : ''}`
  }).join('\n');

  const prompt = `You are summarizing an underwater ROV (Remotely Operated Vehicle) dive trip for an operations report.

Trip details:
- Name: ${trip.name}
- Location: ${trip.locationName || trip.location || 'Not specified'}
- Start: ${trip.startTime ? new Date(trip.startTime).toLocaleString() : 'Not specified'}
- End: ${trip.endTime ? new Date(trip.endTime).toLocaleString() : 'Not specified'}
- Status: ${trip.status}
${trip.description ? `- Description: ${trip.description}` : ''}

Dives completed (${dives.length} total):
${diveLines || '  No dives recorded'}

Media recorded: ${mediaCount} file(s)

Write a concise 2-3 paragraph operational summary in both languages. Be professional and factual. No markdown, no bullet points, plain text only.

Use EXACTLY this format (keep the separator lines as-is):
===VI===
<Vietnamese summary here>
===EN===
<English summary here>`;

  try {
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Gemini request timed out after 45s')), 45000)
      ),
    ]);
    const raw = result?.response?.text?.();
    if (!raw) throw new Error('Gemini returned empty response');

    const viMatch = raw.match(/===VI===\s*([\s\S]*?)(?:===EN===|$)/);
    const enMatch = raw.match(/===EN===\s*([\s\S]*?)$/);
    const vi = viMatch?.[1]?.trim();
    const en = enMatch?.[1]?.trim();

    if (!vi || !en) throw new Error('Gemini response missing VI or EN section: ' + raw.slice(0, 200));
    return { vi, en };

  } catch (err) {
    const status = err.status ?? err.statusCode ?? err.response?.status;
    if (status === 429) throw new Error('429: Gemini rate limit exceeded');
    if (status === 403) throw new Error('API key invalid or quota exhausted');
    if (status >= 500) throw new Error(`Gemini server error (${status})`);
    throw err;
  }
};

module.exports = { generateTripSummary };
