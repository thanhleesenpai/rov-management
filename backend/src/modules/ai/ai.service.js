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

// Formats a MongoDB $group range (min/max/avg) as "min – max (avg avg)", or null if the metric was never recorded
const fmtRange = (min, max, avg, unit) => {
  if (min == null || max == null || avg == null) return null;
  return `${min.toFixed(1)}–${max.toFixed(1)} ${unit} (avg ${avg.toFixed(1)} ${unit})`;
};

const generateProjectSummary = async (project, trips = [], mediaCount = 0, sensorStats = null, anomalyCount = 0) => {
  const model = getModel();

  const tripLines = trips.map(d => {
    const loc = d.locationName ? ` @ ${d.locationName.split(',')[0].trim()}` : ''
    return `  - ${d.title} [${d.status}]${loc}${d.description ? ': ' + d.description : ''}`
  }).join('\n');

  const rov = project.rov?.name
    ? `${project.rov.name}${project.rov.model ? ` (${project.rov.model})` : ''}`
    : 'Not specified';

  const sensorLines = sensorStats ? [
    fmtRange(sensorStats.depthMin, sensorStats.depthMax, sensorStats.depthAvg, 'm')       && `  - Depth: ${fmtRange(sensorStats.depthMin, sensorStats.depthMax, sensorStats.depthAvg, 'm')}`,
    fmtRange(sensorStats.tempMin, sensorStats.tempMax, sensorStats.tempAvg, '°C')          && `  - Temperature: ${fmtRange(sensorStats.tempMin, sensorStats.tempMax, sensorStats.tempAvg, '°C')}`,
    fmtRange(sensorStats.pressureMin, sensorStats.pressureMax, sensorStats.pressureAvg, 'bar') && `  - Pressure: ${fmtRange(sensorStats.pressureMin, sensorStats.pressureMax, sensorStats.pressureAvg, 'bar')}`,
  ].filter(Boolean).join('\n') : '';

  const sensorSection = sensorStats ? `
Sensor readings (${sensorStats.count} readings across all trips):
${sensorLines || '  No numeric readings recorded'}
${anomalyCount > 0
    ? `  - ${anomalyCount} statistically anomalous reading(s) detected (possible sensor spikes or equipment issues worth reviewing)`
    : '  - No statistical anomalies detected in sensor data'}
` : '';

  const prompt = `You are summarizing an underwater ROV (Remotely Operated Vehicle) trip project for an operations report.

Project details:
- Name: ${project.name}
- ROV: ${rov}
- Location: ${project.locationName || project.location || 'Not specified'}
- Start: ${project.startTime ? new Date(project.startTime).toLocaleString() : 'Not specified'}
- End: ${project.endTime ? new Date(project.endTime).toLocaleString() : 'Not specified'}
- Status: ${project.status}
${project.description ? `- Description: ${project.description}` : ''}

Trips completed (${trips.length} total):
${tripLines || '  No trips recorded'}

Media recorded: ${mediaCount} file(s)
${sensorSection}
Write a detailed 4-6 paragraph operational summary in both languages. Cover: the ROV and equipment used, the trips performed, sensor readings and any anomalies found (explain what an anomaly might indicate operationally), and media/evidence collected. Be professional and factual. No markdown, no bullet points, plain text only.

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

module.exports = { generateProjectSummary };
