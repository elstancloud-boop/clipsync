const path = require('path');
module.exports = {
  port: +process.env.PORT || 3000,
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  prod: process.env.NODE_ENV === 'production',
  maxFileBytes: +process.env.MAX_FILE_MB * 1048576 || 100 * 1048576,
  quotaBytes: +process.env.QUOTA_MB * 1048576 || 1024 * 1048576, // per user
  retentionDays: +process.env.RETENTION_DAYS || 30,
  signupsOpen: process.env.SIGNUPS_OPEN !== 'false',
};
