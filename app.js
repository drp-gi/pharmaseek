const express = require('express');
const session = require('express-session');
const path    = require('path');
require('dotenv').config();

const app = express();

// ── View engine ───────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Middleware ────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Session ───────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'pharmaseek2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // change to true if using HTTPS
}));

// ── Routes ────────────────────────────────────────────────────
const authRoutes  = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const pharmRoutes = require('./routes/pharmacist');
const staffRoutes = require('./routes/staff');

app.use('/',            authRoutes);
app.use('/admin',       adminRoutes);
app.use('/pharmacist',  pharmRoutes);
app.use('/staff',       staffRoutes);

// ── 404 fallback ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).send(`
    <div style="font-family:sans-serif;text-align:center;padding:80px">
      <h2>404 — Page not found</h2>
      <a href="/login">Back to login</a>
    </div>
  `);
});

// ── Start server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PharmaSeek running at http://localhost:${PORT}`);
});

// ── Test DB connection on startup ─────────────────────────────
const db = require('./db/connection');
db.query('SELECT 1')
  .then(() => console.log('✅ MySQL Connected Successfully'))
  .catch((err) => console.error('❌ MySQL connection failed:', err.message));