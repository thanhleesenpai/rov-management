/**
 * get-token.js — Lấy JWT token để dùng với Artillery
 * Chạy: node src/scripts/get-token.js
 * Copy token in ra và paste vào artillery.yml phần token: "..."
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const http = require('http');

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
    if (r.data?.accessToken) {
      console.log('\n✅ Token lấy thành công. Chạy lệnh sau:\n');
      console.log(`artillery run backend/src/scripts/artillery.yml --overrides '{"config":{"environments":{"default":{"variables":{"token":"${r.data.accessToken}"}}}}}'`);
      console.log('\nHoặc paste token này vào artillery.yml dòng token: "...":\n');
      console.log(r.data.accessToken);
    } else {
      console.error('❌ Login failed:', r);
    }
  });
});
req.write(body);
req.end();
