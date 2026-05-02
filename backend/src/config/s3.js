const { S3Client } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  // Tắt checksum tự động — SDK v3 mới thêm mặc định, gây lỗi khi dùng presigned URL
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

module.exports = s3;
