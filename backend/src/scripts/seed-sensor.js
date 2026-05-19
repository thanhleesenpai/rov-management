/**
 * Generates a sample sensor-data.csv for manual upload testing.
 * Run: node src/scripts/seed-sensor.js
 * Output: sensor-data.csv (in project root)
 */
const fs = require('fs');
const path = require('path');

const START = new Date('2026-05-07T08:00:00Z');
const ROWS = 120; // 2 hours, 1 reading/minute

const rows = ['timestamp,depth,temp,pressure,lat,lng'];

for (let i = 0; i < ROWS; i++) {
  const ts = new Date(START.getTime() + i * 60 * 1000).toISOString();
  // Simulate dive: descend to 50m, hold, ascend
  let depth;
  if (i < 30)       depth = (i * 50 / 30).toFixed(2);
  else if (i < 90)  depth = (50 + (Math.random() - 0.5) * 2).toFixed(2);
  else              depth = (50 - ((i - 90) * 50 / 30)).toFixed(2);

  const temp     = (24.5 - (depth / 50) * 3 + (Math.random() - 0.5) * 0.4).toFixed(2);
  const pressure = (1.013 + (depth / 10) * 0.1 + (Math.random() - 0.5) * 0.005).toFixed(4);

  // GPS only on row 0 — static position (Da Nang, Vietnam)
  const lat = i === 0 ? '16.0544' : '';
  const lng = i === 0 ? '108.2022' : '';

  // Inject 3 anomalies for demo
  const isAnomaly = [20, 55, 100].includes(i);
  const finalDepth = isAnomaly ? (Number(depth) + 15).toFixed(2) : depth;
  const finalTemp  = isAnomaly ? (Number(temp)  + 6).toFixed(2)  : temp;

  rows.push(`${ts},${finalDepth},${finalTemp},${pressure},${lat},${lng}`);
}

const outPath = path.resolve(__dirname, '../../../../sensor-data.csv');
fs.writeFileSync(outPath, rows.join('\n'), 'utf8');
console.log(`✓ Generated ${ROWS} rows → ${outPath}`);
