/**
 * run-artillery.js — Lấy token mới + chạy Artillery tự động
 * Chạy: node src/scripts/run-artillery.js
 * Không cần copy/paste token thủ công
 */
const { execSync, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ARTILLERY_YML = path.resolve(__dirname, 'artillery.yml');

function getToken() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email: 'operator@rov.local', password: 'Operator@123' });
    const req = http.request({
      hostname: 'localhost', port: 5000,
      path: '/api/v1/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const r = JSON.parse(data);
        r.data?.accessToken ? resolve(r.data.accessToken) : reject(new Error('Login failed: ' + data));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function run() {
  console.log('🔑 Logging in to get fresh token...');
  const token = await getToken();
  console.log('✅ Token received (expires in 15 min)\n');

  // Patch artillery.yml with fresh token
  let yml = fs.readFileSync(ARTILLERY_YML, 'utf8');
  yml = yml.replace(/token: ".*"/, `token: "${token}"`);
  fs.writeFileSync(ARTILLERY_YML, yml);

  console.log('🚀 Running Artillery...\n');
  const result = spawnSync('artillery', ['run', ARTILLERY_YML], {
    stdio: 'inherit',
    shell: true,
  });

  if (result.status !== 0) {
    console.error('Artillery exited with code', result.status);
    process.exit(result.status);
  }
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
