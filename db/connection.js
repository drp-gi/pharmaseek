const mysql = require('mysql2/promise');
require('dotenv').config();

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'pharmaseek_db'
});

// The Philippines has used a fixed UTC+8 offset year-round since 1978 (no
// DST), so every pooled connection is pinned to it here. This makes
// CURDATE()/NOW()/CURRENT_TIMESTAMP — used throughout the app for "today"
// comparisons (expiration/low-stock alerts, report date ranges, etc.) —
// consistently reflect Philippine time regardless of what timezone the
// MySQL server itself happens to be configured for.
db.on('connection', (connection) => {
  connection.query("SET time_zone = '+08:00'");
});

module.exports = db;