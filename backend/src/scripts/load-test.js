/**
 * load-test.js — Simple concurrent load test (no extra deps needed)
 *
 * Test các endpoint chính với nhiều request đồng thời
 * Chạy: node src/scripts/load-test.js
 *
 * Requires: backend đang chạy ở localhost:5000
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const http = require('http');
const https = require('https');

const BASE = 'http://localhost:5000/api/v1';
let TOKEN = null;

// ─── helpers ──────────────────────────────────────────────────────────────────

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const opts = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    };

    const start = Date.now();
    const req = lib.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const ms = Date.now() - start;
        try { resolve({ status: res.statusCode, ms, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, ms, body: data }); }
      });
    });
    req.on('error', e => reject({ error: e.message, ms: Date.now() - start }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function login() {
  const r = await request('POST', '/auth/login', { email: 'admin@rov.local', password: 'Admin@123' });
  if (r.status !== 200) throw new Error('Login failed: ' + JSON.stringify(r.body));
  TOKEN = r.body.data.accessToken;
  console.log('✅ Logged in');
}

// Run N concurrent requests, return stats
async function bench(label, fn, concurrency = 10, rounds = 3) {
  const times = [];
  let errors = 0;

  for (let r = 0; r < rounds; r++) {
    const batch = Array.from({ length: concurrency }, () =>
      fn().then(res => {
        if (res.status >= 400) errors++;
        times.push(res.ms);
      }).catch(err => {
        errors++;
        times.push(err.ms || 0);
      })
    );
    await Promise.all(batch);
  }

  const total = concurrency * rounds;
  const sorted = [...times].sort((a, b) => a - b);
  const avg  = Math.round(times.reduce((s, t) => s + t, 0) / times.length);
  const p50  = sorted[Math.floor(times.length * 0.50)];
  const p95  = sorted[Math.floor(times.length * 0.95)];
  const p99  = sorted[Math.floor(times.length * 0.99)];
  const max  = sorted[sorted.length - 1];

  const status = avg < 200 ? '🟢' : avg < 500 ? '🟡' : '🔴';
  console.log(`${status} ${label.padEnd(38)} avg=${avg}ms  p50=${p50}ms  p95=${p95}ms  p99=${p99}ms  max=${max}ms  errors=${errors}/${total}`);
  return { avg, p50, p95, p99, max, errors, total };
}

// ─── tests ────────────────────────────────────────────────────────────────────

async function run() {
  const CONCURRENCY = 20;
  const ROUNDS = 3;

  console.log(`\n🚀 Load Test — ${CONCURRENCY} concurrent × ${ROUNDS} rounds = ${CONCURRENCY * ROUNDS} requests per endpoint\n`);
  console.log(`${'Endpoint'.padEnd(38)} avg      p50      p95      p99      max      errors`);
  console.log('─'.repeat(95));

  // Login first
  await login();

  const headers = () => ({ token: TOKEN });

  const results = {};

  // Auth
  results.login    = await bench('POST /auth/login',        () => request('POST', '/auth/login', { email: 'admin@rov.local', password: 'Admin@123' }), CONCURRENCY, ROUNDS);
  results.me       = await bench('GET  /auth/me',           () => request('GET', '/auth/me', null, TOKEN), CONCURRENCY, ROUNDS);

  // Core data reads
  results.projects = await bench('GET  /projects',          () => request('GET', '/projects?page=1&limit=10', null, TOKEN), CONCURRENCY, ROUNDS);
  results.trips    = await bench('GET  /trips',             () => request('GET', '/trips?page=1&limit=10', null, TOKEN), CONCURRENCY, ROUNDS);
  results.rovs     = await bench('GET  /rovs',              () => request('GET', '/rovs', null, TOKEN), CONCURRENCY, ROUNDS);

  // Stats (heavy aggregation)
  results.stats    = await bench('GET  /stats/overview',    () => request('GET', '/stats/overview', null, TOKEN), CONCURRENCY, ROUNDS);

  // Sensor data (may be heavy with large dataset)
  const tripsRes = await request('GET', '/trips?limit=5', null, TOKEN);
  const tripList = tripsRes.body?.data?.data ?? [];
  if (tripList.length > 0) {
    const tid = tripList[0]._id;
    results.sensor = await bench('GET  /trips/:id/sensor-data',    () => request('GET', `/trips/${tid}/sensor-data`, null, TOKEN), CONCURRENCY, ROUNDS);
    results.dvl    = await bench('GET  /trips/:id/dvl',           () => request('GET', `/trips/${tid}/dvl`, null, TOKEN), CONCURRENCY, ROUNDS);
  }

  // Media
  results.media  = await bench('GET  /media/trip/:id (first)',   () => {
    const tid = tripList[0]?._id ?? 'notfound';
    return request('GET', `/media/trip/${tid}`, null, TOKEN);
  }, CONCURRENCY, ROUNDS);

  // Notifications
  results.notif  = await bench('GET  /notifications',       () => request('GET', '/notifications', null, TOKEN), CONCURRENCY, ROUNDS);

  // Summary
  const allAvg = Object.values(results).map(r => r.avg);
  const overall = Math.round(allAvg.reduce((s, v) => s + v, 0) / allAvg.length);
  const totalErrors = Object.values(results).reduce((s, r) => s + r.errors, 0);

  console.log('─'.repeat(95));
  console.log(`\n📊 Overall avg: ${overall}ms  |  Total errors: ${totalErrors}`);

  if (overall < 200 && totalErrors === 0) {
    console.log('✅ PASS — API responding well under load');
  } else if (overall < 500) {
    console.log('⚠️  WARN — Some endpoints are slow, check stats/sensor queries');
  } else {
    console.log('❌ FAIL — API too slow or many errors under load');
  }

  console.log('\n💡 Tips nếu chậm:');
  console.log('   - stats/overview chậm → xem lại MongoDB aggregation, thêm index');
  console.log('   - sensor-data chậm → query nhiều readings, cân nhắc pagination');
  console.log('   - p99 cao → có outlier request, check MongoDB Atlas slow query log');
}

run().catch(err => { console.error('Load test failed:', err); process.exit(1); });
