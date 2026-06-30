/**
 * seed-full.js — Tạo fake data hoàn chỉnh cho demo/test
 *
 * Tạo được:  Users, ROVs, Projects, Trips, SensorData, DVLData, AuditLogs, Notifications
 * CẦN LÀM THỦ CÔNG: Media (video/ảnh), Sonar files (binary), Google OAuth
 *
 * Chạy: node src/scripts/seed-full.js
 * Reset: node src/scripts/seed-full.js --reset   (xóa sạch rồi seed lại)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

const User       = require('../modules/users/user.model');
const ROV        = require('../modules/rovs/rov.model');
const Project    = require('../modules/projects/project.model');
const Trip       = require('../modules/trips/trip.model');
const SensorData = require('../modules/sensor/sensor.model');
const DVLData    = require('../modules/dvl/dvl.model');
const Notification = require('../modules/notifications/notification.model');

const RESET = process.argv.includes('--reset');

// ─── helpers ──────────────────────────────────────────────────────────────────

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const rnd = (lo, hi, dec = 2) => +(lo + Math.random() * (hi - lo)).toFixed(dec);
const daysAgo = n => new Date(Date.now() - n * 86_400_000);
const addMs = (d, ms) => new Date(d.getTime() + ms);

// GPS vùng biển Đà Nẵng / Hội An — spread nhỏ để look realistic
const DA_NANG = { lat: 16.0544, lng: 108.2022 };
function gpsNear(anchor, radiusDeg = 0.05) {
  return {
    lat: +(anchor.lat + (Math.random() - 0.5) * radiusDeg * 2).toFixed(6),
    lng: +(anchor.lng + (Math.random() - 0.5) * radiusDeg * 2).toFixed(6),
  };
}

// Sinh sensor readings — sine wave depth + noise
function genSensorReadings(tripId, count = 60, startTime, sourceFile = 'log_sim.csv') {
  const docs = [];
  const interval = 5_000; // 5s between readings
  for (let i = 0; i < count; i++) {
    const t = addMs(startTime, i * interval);
    const phase = (i / count) * Math.PI * 2;
    const depth = +(-(2 + Math.abs(Math.sin(phase)) * 8 + rnd(-0.3, 0.3))).toFixed(2);
    const temp  = +(26 + Math.sin(phase * 0.7) * 3 + rnd(-0.5, 0.5)).toFixed(1);
    // Inject 2 anomaly spikes
    const anomalyDepth = (i === Math.floor(count * 0.35) || i === Math.floor(count * 0.72));
    docs.push({
      trip:            tripId,
      sourceFile,
      timestamp:       t,
      depth:           anomalyDepth ? depth * 3.5 : depth,
      temp:            anomalyDepth ? temp + 15   : temp,
      pressure:        +(Math.abs(depth) * 0.1 + rnd(-0.02, 0.02)).toFixed(3),
      yaw:             +(Math.sin(phase * 1.3) * 180).toFixed(1),
      pitch:           +(Math.sin(phase * 2.1) * 8).toFixed(1),
      roll:            +(Math.cos(phase * 1.8) * 6).toFixed(1),
      voltage:         +(14.8 - (i / count) * 1.2 + rnd(-0.05, 0.05)).toFixed(2),
      battery_percent: +(100 - (i / count) * 25).toFixed(0),
      humidity:        +(50 + rnd(-5, 5)).toFixed(1),
      temperature:     +(40 + rnd(-3, 3)).toFixed(1),
      powerLevel:      +(60 + rnd(-10, 10)).toFixed(0),
      lightLevel:      +(30 + Math.sin(phase) * 20).toFixed(0),
      cameraTilt:      +(rnd(-15, 15)).toFixed(1),
    });
  }
  return docs;
}

// Sinh DVL points — elliptical trajectory
function genDVLPoints(tripId, pointCount = 400, sourceFile = 'dvl_sim.json') {
  const docs = [];
  for (let i = 0; i < pointCount; i++) {
    const phase = (i / pointCount) * Math.PI * 2;
    docs.push({
      trip:       tripId,
      sourceFile,
      ts:         i * 0.25,           // 0.25s per point (4 Hz)
      x:          +(Math.cos(phase) * 5 + rnd(-0.1, 0.1)).toFixed(3),
      y:          +(Math.sin(phase) * 3 + rnd(-0.1, 0.1)).toFixed(3),
      z:          +(-2 - Math.abs(Math.sin(phase)) * 4 + rnd(-0.05, 0.05)).toFixed(3),
      roll:       +(Math.sin(phase * 2) * 3).toFixed(2),
      pitch:      +(Math.cos(phase * 3) * 2).toFixed(2),
      yaw:        +((phase * 180 / Math.PI) % 360).toFixed(1),
      std:        +(rnd(0.01, 0.05)).toFixed(3),
      status:     0,
    });
  }
  return docs;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  if (RESET) {
    console.log('\n⚠  --reset: dropping all collections...');
    await Promise.all([
      User.deleteMany({}),
      ROV.deleteMany({}),
      Project.deleteMany({}),
      Trip.deleteMany({}),
      SensorData.deleteMany({}),
      DVLData.deleteMany({}),
      Notification.deleteMany({}),
    ]);
    console.log('Collections cleared\n');
  }

  // ── 1. Users ──────────────────────────────────────────────────────────────
  console.log('── Users ──');
  const userData = [
    { fullName: 'Admin User',     email: 'admin@rov.local',    password: 'Admin@123',    role: 'admin' },
    { fullName: 'Operator Minh',  email: 'operator@rov.local', password: 'Operator@123', role: 'operator' },
    { fullName: 'Viewer Lan',     email: 'viewer@rov.local',   password: 'Viewer@123',   role: 'viewer' },
    { fullName: 'Operator Hùng',  email: 'hung@rov.local',     password: 'Hung@1234',    role: 'operator' },
  ];
  const users = {};
  for (const u of userData) {
    let user = await User.findOne({ email: u.email });
    if (!user) user = await User.create(u);
    users[u.role === 'admin' ? 'admin' : u.email.split('@')[0]] = user;
    console.log(`  OK ${u.email} [${u.role}]`);
  }

  // ── 2. ROVs ───────────────────────────────────────────────────────────────
  console.log('── ROVs ──');
  const rovData = [
    { name: 'Trident Alpha',  model: 'BlueROV2 Heavy',    serialNumber: 'ROV-2024-001', status: 'active',      specs: { maxDepth: 100, thrusterCount: 6, weight: 14 } },
    { name: 'Neptune Beta',   model: 'VideoRay M5',        serialNumber: 'ROV-2024-002', status: 'active',      specs: { maxDepth: 300, thrusterCount: 4, weight: 7  } },
    { name: 'Poseidon Gamma', model: 'Saab Seaeye Falcon', serialNumber: 'ROV-2023-003', status: 'maintenance', specs: { maxDepth: 300, thrusterCount: 5, weight: 11 } },
  ];
  const rovs = [];
  for (const r of rovData) {
    let rov = await ROV.findOne({ serialNumber: r.serialNumber });
    if (!rov) rov = await ROV.create({ ...r, createdBy: users.admin._id });
    rovs.push(rov);
    console.log(`  OK ${r.name} [${r.status}]`);
  }

  // ── 3. Projects + Trips + Data ────────────────────────────────────────────
  console.log('── Projects & Trips ──');

  const projectDefs = [
    {
      name: 'Khảo sát Rạn San Hô Đà Nẵng 2026',
      description: 'Khảo sát đánh giá tình trạng hệ sinh thái rạn san hô khu vực bán đảo Sơn Trà',
      status: 'completed',
      rov: rovs[0],
      daysBack: 30,
      locationName: 'Bán đảo Sơn Trà, Đà Nẵng',
      trips: [
        { title: 'Lặn khu vực A — độ sâu 5-15m', status: 'done',   durationMin: 35, hasSensor: true, hasDvl: true  },
        { title: 'Lặn khu vực B — san hô nông',  status: 'done',   durationMin: 28, hasSensor: true, hasDvl: true  },
        { title: 'Lặn khu vực C — kiểm tra đêm', status: 'failed', durationMin: 12, hasSensor: true, hasDvl: false },
        { title: 'Lặn bổ sung — tài liệu hoá',   status: 'done',   durationMin: 45, hasSensor: true, hasDvl: true  },
      ],
    },
    {
      name: 'Kiểm tra Cơ sở Hạ tầng Cảng Tiên Sa',
      description: 'Kiểm tra định kỳ tình trạng cọc cảng, neo và đường ống dẫn dưới nước',
      status: 'ongoing',
      rov: rovs[1],
      daysBack: 7,
      locationName: 'Cảng Tiên Sa, Đà Nẵng',
      trips: [
        { title: 'Kiểm tra cọc khu vực cầu tàu 1', status: 'done',    durationMin: 40, hasSensor: true,  hasDvl: true  },
        { title: 'Kiểm tra đường ống ngầm phía Đông', status: 'done',  durationMin: 55, hasSensor: true,  hasDvl: true  },
        { title: 'Đánh giá hệ thống neo đỗ',          status: 'running', durationMin: 20, hasSensor: false, hasDvl: false },
      ],
    },
    {
      name: 'Nghiên cứu Sinh vật Biển Cù Lao Chàm',
      description: 'Thu thập dữ liệu đa dạng sinh học cho luận án tiến sĩ — ĐH Đà Nẵng',
      status: 'planned',
      rov: rovs[0],
      daysBack: -3,
      locationName: 'Cù Lao Chàm, Quảng Nam',
      trips: [
        { title: 'Khảo sát transect T1', status: 'pending', durationMin: 0, hasSensor: false, hasDvl: false },
        { title: 'Khảo sát transect T2', status: 'pending', durationMin: 0, hasSensor: false, hasDvl: false },
      ],
    },
    {
      name: 'Khảo sát Xác Tàu Đắm — Thử nghiệm',
      description: 'Test thử nghiệm hệ thống với dữ liệu giả lập từ ca khảo sát tàu đắm lịch sử',
      status: 'completed',
      rov: rovs[2],
      daysBack: 60,
      locationName: 'Vịnh Đà Nẵng',
      trips: [
        { title: 'Tiếp cận và quan sát ban đầu', status: 'done', durationMin: 30, hasSensor: true, hasDvl: true },
        { title: 'Tài liệu hoá chi tiết vỏ tàu', status: 'done', durationMin: 50, hasSensor: true, hasDvl: true },
        { title: 'Thu hồi mẫu vật',               status: 'done', durationMin: 25, hasSensor: true, hasDvl: false },
      ],
    },
  ];

  let totalSensor = 0, totalDvl = 0;

  for (const pd of projectDefs) {
    const projectStart = daysAgo(pd.daysBack);
    const gps = gpsNear(DA_NANG);

    let project = await Project.findOne({ name: pd.name });
    if (!project) {
      project = await Project.create({
        name:         pd.name,
        description:  pd.description,
        rov:          pd.rov._id,
        status:       pd.status,
        startTime:    projectStart,
        endTime:      pd.status === 'completed' ? addMs(projectStart, 3 * 86_400_000) : null,
        gpsLocation:  gps,
        locationName: pd.locationName,
        createdBy:    users.operator._id,
        aiSummary: pd.status === 'completed' ? {
          vi: `Dự án "${pd.name}" đã hoàn thành thành công. ROV ${pd.rov.name} thực hiện tổng cộng ${pd.trips.filter(t => t.status === 'done').length} chuyến lặn. Dữ liệu sensor cho thấy điều kiện nước ổn định với nhiệt độ trung bình 26-29°C và độ sâu tối đa 15m. Phát hiện 2 điểm bất thường sensor trong quá trình khảo sát.`,
          en: `Project "${pd.name}" completed successfully. ${pd.rov.name} performed ${pd.trips.filter(t => t.status === 'done').length} dives. Sensor data shows stable water conditions (avg 26-29°C, max 15m depth). 2 sensor anomalies detected during survey.`,
          generatedAt: new Date(),
          status: 'done',
        } : { status: 'idle' },
      });
      console.log(`  PROJECT "${pd.name}" [${pd.status}]`);
    } else {
      console.log(`  SKIP project "${pd.name}"`);
    }

    for (let ti = 0; ti < pd.trips.length; ti++) {
      const td = pd.trips[ti];
      const tripStart = addMs(projectStart, ti * 2 * 3600_000 + Math.random() * 3600_000);
      const tripGps = gpsNear(gps, 0.01);

      let trip = await Trip.findOne({ title: td.title, project: project._id });
      if (trip) {
        console.log(`    SKIP trip "${td.title}"`);
        continue;
      }

      trip = await Trip.create({
        title:        td.title,
        project:      project._id,
        status:       td.status,
        gpsLocation:  td.hasSensor ? tripGps : { lat: null, lng: null },
        locationName: td.hasSensor ? pd.locationName : '',
        sensorCount:  td.hasSensor ? 60 : 0,
        dvlCount:     td.hasDvl   ? 400 : 0,
        createdBy:    users.operator._id,
      });

      // Sensor data
      if (td.hasSensor) {
        const srcFile = `log_${trip._id.toString().slice(-6)}.csv`;
        const readings = genSensorReadings(trip._id, 60, tripStart, srcFile);
        await SensorData.insertMany(readings, { ordered: false });
        totalSensor += readings.length;
      }

      // DVL data
      if (td.hasDvl) {
        const srcFile = `dvl_${trip._id.toString().slice(-6)}.json`;
        const points = genDVLPoints(trip._id, 400, srcFile);
        await DVLData.insertMany(points, { ordered: false });
        totalDvl += points.length;
      }

      console.log(`    TRIP "${td.title}" [${td.status}] sensor=${td.hasSensor} dvl=${td.hasDvl}`);
    }
  }

  // ── 4. Sample Notifications ───────────────────────────────────────────────
  console.log('── Notifications ──');
  const notifData = [
    { type: 'trip_done',    title: 'Trip hoàn thành',   body: 'Lặn khu vực A — độ sâu 5-15m đã hoàn thành.',      isRead: false },
    { type: 'trip_failed',  title: 'Trip thất bại',     body: 'Lặn khu vực C — kiểm tra đêm bị ngắt kết nối.',    isRead: true  },
    { type: 'ai_done',      title: 'AI Summary sẵn sàng', body: 'Tóm tắt AI cho dự án Rạn San Hô đã được tạo.',  isRead: false },
  ];
  for (const n of notifData) {
    await Notification.create({ ...n, userId: users.operator._id, link: '/projects' });
  }
  console.log(`  Created ${notifData.length} notifications`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n✅ Seed hoàn tất:');
  console.log(`   ${userData.length} users  |  ${rovData.length} ROVs`);
  console.log(`   ${projectDefs.length} projects  |  ${projectDefs.reduce((s, p) => s + p.trips.length, 0)} trips`);
  console.log(`   ${totalSensor} sensor readings  |  ${totalDvl} DVL points`);
  console.log('\n📋 CẦN LÀM THỦ CÔNG:');
  console.log('   1. Upload video/ảnh vào ít nhất 1-2 trip (qua web UI → Upload)');
  console.log('   2. Upload file sonar (.sonar binary) nếu có');
  console.log('   3. Kích hoạt Google OAuth nếu cần test (thêm GOOGLE_* vào .env)');
  console.log('   4. Chạy YOLO service nếu muốn test object detection');

  await mongoose.disconnect();
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
