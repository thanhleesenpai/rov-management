const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3 = require('../config/s3');

async function freshenAvatar(avatar) {
  if (!avatar || !avatar.startsWith('avatars/')) return avatar ?? null;
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: avatar }),
    { expiresIn: 3600 }
  );
}

module.exports = { freshenAvatar };
