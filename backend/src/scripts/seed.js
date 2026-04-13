require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../modules/users/user.model');

const users = [
  { fullName: 'Admin User',    email: 'admin@rov.local',    password: 'Admin@123',    role: 'admin' },
  { fullName: 'Operator User', email: 'operator@rov.local', password: 'Operator@123', role: 'operator' },
  { fullName: 'Viewer User',   email: 'viewer@rov.local',   password: 'Viewer@123',   role: 'viewer' }
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  for (const u of users) {
    const exists = await User.findOne({ email: u.email });
    if (exists) {
      console.log(`SKIP  ${u.email} (already exists)`);
      continue;
    }
    await User.create(u);
    console.log(`OK    ${u.email} [${u.role}]`);
  }

  await mongoose.disconnect();
  console.log('Done');
}

seed().catch(err => { console.error(err); process.exit(1); });
