const mongoose = require('mongoose');
const Queue = require('bull');
require('dotenv').config({path: './.env'});

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const res = await mongoose.connection.db.collection('media').updateMany(
      {analysisStatus: 'pending'}, 
      {$set: {analysisStatus: 'failed'}}
    );
    console.log('MongoDB Media Update:', res);
    
    const queue = new Queue('media-analysis', process.env.REDIS_URL || 'redis://127.0.0.1:6379');
    await queue.empty();
    console.log('Queue emptied');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
