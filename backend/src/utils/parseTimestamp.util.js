function parseTimestampFromFilename(filename) {
  const m = filename.match(/_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  // Filename timestamps are recorded in UTC+7 (Vietnam local time), not UTC
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+07:00`);
}

module.exports = { parseTimestampFromFilename };
