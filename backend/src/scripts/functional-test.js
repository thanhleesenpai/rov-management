/**
 * functional-test.js — Kiểm tra chức năng API tự động
 *
 * Test các luồng quan trọng: auth, RBAC, validation, CRUD
 * Chạy: node src/scripts/functional-test.js
 * Yêu cầu: backend đang chạy ở localhost:5000, đã seed data
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const http = require('http');

const BASE = 'http://localhost:5000/api/v1';
let passed = 0, failed = 0;

// ─── helpers ──────────────────────────────────────────────────────────────────

function req(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const opts = {
      hostname: url.hostname,
      port:     url.port || 80,
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const r = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function login(email, password) {
  const r = await req('POST', '/auth/login', { email, password });
  return r.status === 200 ? r.body.data?.accessToken : null;
}

// ─── test suites ──────────────────────────────────────────────────────────────

async function testAuth() {
  console.log('\n📋 AUTH');

  // Đăng nhập đúng
  const r1 = await req('POST', '/auth/login', { email: 'admin@rov.local', password: 'Admin@123' });
  assert('Login với đúng credentials → 200', r1.status === 200);
  assert('Response có accessToken', !!r1.body?.data?.accessToken);
  const token = r1.body?.data?.accessToken;

  // Đăng nhập sai mật khẩu
  const r2 = await req('POST', '/auth/login', { email: 'admin@rov.local', password: 'SaiMatKhau' });
  assert('Login sai password → 401', r2.status === 401);

  // Đăng nhập email không tồn tại
  const r3 = await req('POST', '/auth/login', { email: 'khongtontai@rov.local', password: 'Admin@123' });
  assert('Login email không tồn tại → 401', r3.status === 401);

  // Thiếu field
  const r4 = await req('POST', '/auth/login', { email: 'admin@rov.local' });
  assert('Login thiếu password → 400/401', r4.status >= 400);

  // GET /auth/me với token hợp lệ
  const r5 = await req('GET', '/auth/me', null, token);
  assert('GET /auth/me với token hợp lệ → 200', r5.status === 200);
  assert('/auth/me trả về đúng email', r5.body?.data?.email === 'admin@rov.local');

  // GET /auth/me không có token
  const r6 = await req('GET', '/auth/me');
  assert('GET /auth/me không có token → 401', r6.status === 401);

  // GET /auth/me token sai
  const r7 = await req('GET', '/auth/me', null, 'token_sai_hoan_toan');
  assert('GET /auth/me token không hợp lệ → 401', r7.status === 401);

  return token;
}

async function testRBAC(adminToken) {
  console.log('\n📋 RBAC — Phân quyền');

  const viewerToken = await login('viewer@rov.local', 'Viewer@123');
  assert('Viewer login OK', !!viewerToken);

  // Viewer không được tạo project
  const r1 = await req('POST', '/projects', { name: 'Test', rov: '000000000000000000000000' }, viewerToken);
  assert('Viewer POST /projects → 403', r1.status === 403);

  // Viewer không được xóa trip
  const r2 = await req('DELETE', '/trips/000000000000000000000000', null, viewerToken);
  assert('Viewer DELETE /trips/:id → 403', r2.status === 403);

  // Viewer được đọc projects
  const r3 = await req('GET', '/projects', null, viewerToken);
  assert('Viewer GET /projects → 200', r3.status === 200);

  // Viewer không được upload sensor data
  const r4 = await req('POST', '/trips/000000000000000000000000/data/upload-batch', {}, viewerToken);
  assert('Viewer batch upload → 403', r4.status === 403);

  // Không auth không được gì
  const r5 = await req('GET', '/projects');
  assert('Không có token GET /projects → 401', r5.status === 401);
}

async function testValidation(token) {
  console.log('\n📋 VALIDATION — Kiểm tra đầu vào');

  // Tạo project thiếu tên
  const r1 = await req('POST', '/projects', { description: 'không có tên' }, token);
  assert('POST /projects thiếu name → 400/422', r1.status >= 400);

  // Tạo project với rovId không hợp lệ
  const r2 = await req('POST', '/projects', { name: 'Test', rov: 'không_phải_objectid' }, token);
  assert('POST /projects với rovId sai format → 400/422/500', r2.status >= 400);

  // Tạo trip với projectId không tồn tại
  const r3 = await req('POST', '/projects/000000000000000000000000/trips', { title: 'Test trip' }, token);
  assert('POST /projects/:id/trips với id không tồn tại → 404', r3.status === 404);

  // Upload sensor data sai format
  const r4 = await req('POST', '/trips/000000000000000000000000/sensor-data/upload',
    { readings: 'bukan array' }, token);
  assert('Upload sensor-data readings không phải array → 400', r4.status === 400);

  // Upload sensor data mảng rỗng
  const r5 = await req('POST', '/trips/000000000000000000000000/sensor-data/upload',
    { readings: [] }, token);
  assert('Upload sensor-data array rỗng → 400', r5.status === 400);
}

async function testCRUD(token) {
  console.log('\n📋 CRUD — Projects & Trips');

  // Lấy danh sách ROVs để có rovId
  const rovRes = await req('GET', '/rovs', null, token);
  assert('GET /rovs → 200', rovRes.status === 200);
  const rovId = rovRes.body?.data?.data?.[0]?._id;
  if (!rovId) { console.log('  ⚠️  Không có ROV để test CRUD, skip'); return null; }

  // Tạo project
  const createRes = await req('POST', '/projects', {
    name: `[TEST] Project ${Date.now()}`,
    description: 'Tạo bởi functional test',
    rov: rovId,
    status: 'planned',
  }, token);
  assert('POST /projects → 201', createRes.status === 201);
  const projectId = createRes.body?.data?._id;
  if (!projectId) { console.log('  ⚠️  Không tạo được project, skip CRUD'); return null; }

  // Đọc project vừa tạo
  const getRes = await req('GET', `/projects/${projectId}`, null, token);
  assert('GET /projects/:id → 200', getRes.status === 200);
  assert('GET /projects/:id trả đúng name', getRes.body?.data?.name?.startsWith('[TEST]'));

  // Cập nhật project
  const updateRes = await req('PATCH', `/projects/${projectId}`, { status: 'ongoing' }, token);
  assert('PATCH /projects/:id → 200', updateRes.status === 200);
  assert('PATCH cập nhật status đúng', updateRes.body?.data?.status === 'ongoing');

  // Tạo trip trong project
  const tripRes = await req('POST', `/projects/${projectId}/trips`, {
    title: '[TEST] Trip 1',
    description: 'Test trip',
  }, token);
  assert('POST /projects/:id/trips → 201', tripRes.status === 201);
  const tripId = tripRes.body?.data?._id;

  if (tripId) {
    // Đọc trip
    const getTripRes = await req('GET', `/trips/${tripId}`, null, token);
    assert('GET /trips/:id → 200', getTripRes.status === 200);

    // Xóa trip
    const delTripRes = await req('DELETE', `/trips/${tripId}`, null, token);
    assert('DELETE /trips/:id → 200', delTripRes.status === 200);
  }

  // Xóa project vừa tạo (cleanup)
  const deleteRes = await req('DELETE', `/projects/${projectId}`, null, token);
  assert('DELETE /projects/:id → 200', deleteRes.status === 200);

  // Verify đã xóa
  const verifyRes = await req('GET', `/projects/${projectId}`, null, token);
  assert('GET project đã xóa → 404', verifyRes.status === 404);

  return projectId;
}

async function testPagination(token) {
  console.log('\n📋 PAGINATION & FILTER');

  const r1 = await req('GET', '/projects?page=1&limit=2', null, token);
  assert('GET /projects?limit=2 → 200', r1.status === 200);
  assert('Trả về đúng cấu trúc page', r1.body?.data?.data !== undefined && r1.body?.data?.total !== undefined);
  if (r1.body?.data?.data) {
    assert('Số item ≤ limit=2', r1.body.data.data.length <= 2);
  }

  // Filter theo status
  const r2 = await req('GET', '/projects?status=completed', null, token);
  assert('GET /projects?status=completed → 200', r2.status === 200);
  if (r2.body?.data?.data?.length > 0) {
    assert('Tất cả kết quả có status=completed', r2.body.data.data.every(p => p.status === 'completed'));
  }

  // Trang không tồn tại
  const r3 = await req('GET', '/projects?page=999&limit=10', null, token);
  assert('GET /projects?page=999 → 200 với data rỗng', r3.status === 200 && r3.body?.data?.data?.length === 0);
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('🧪 Functional Test — ROV Management API');
  console.log('='.repeat(50));

  const adminToken = await testAuth();
  if (!adminToken) {
    console.log('\n❌ Không login được, dừng test. Đảm bảo backend đang chạy và đã seed data.');
    process.exit(1);
  }

  await testRBAC(adminToken);
  await testValidation(adminToken);
  await testCRUD(adminToken);
  await testPagination(adminToken);

  console.log('\n' + '='.repeat(50));
  const total = passed + failed;
  const pct = Math.round((passed / total) * 100);
  console.log(`\n📊 Kết quả: ${passed}/${total} passed (${pct}%)`);

  if (failed === 0) {
    console.log('✅ TẤT CẢ PASS — API hoạt động đúng');
  } else {
    console.log(`⚠️  ${failed} test thất bại — cần kiểm tra`);
    process.exit(1);
  }
}

run().catch(err => { console.error('Test runner error:', err.message); process.exit(1); });
