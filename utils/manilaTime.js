// utils/manilaTime.js
// The Philippines has used a fixed UTC+8 offset year-round since 1978
// (no DST), so a simple fixed shift reliably gives "now in Manila"
// regardless of what timezone the Node process itself is running in.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

// A Date whose UTC getters/ISO output represent Manila's current wall
// clock. Do not use its local getters (getDate(), getMonth(), etc.) —
// those would re-apply the server's own timezone on top of this shift.
// Use getUTCDate()/getUTCMonth()/toISOString() instead.
function manilaNow() {
  return new Date(Date.now() + MANILA_OFFSET_MS);
}

// Today's calendar date in Manila, as 'YYYY-MM-DD'.
function manilaTodayISO() {
  return manilaNow().toISOString().slice(0, 10);
}

// Normalizes a MySQL DATE/DATETIME value into a plain 'YYYY-MM-DD'.
// mysql2 returns DATE columns as JS Date objects built from *local*
// getters (year/month/day matching the stored value exactly, regardless
// of the Node process's timezone) — so this reads it back the same way,
// rather than via UTC getters, which could land on the wrong day.
function dateOnlyISO(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

// Whole-day difference (to - from) between two date values — each may be
// a 'YYYY-MM-DD' string, a MySQL DATE Date object, or anything dateOnlyISO
// accepts. Computed via UTC-anchored midnights so the result is never
// affected by the server's own local timezone.
function daysBetween(fromValue, toValue) {
  const fromMs = Date.parse(dateOnlyISO(fromValue) + 'T00:00:00Z');
  const toMs = Date.parse(dateOnlyISO(toValue) + 'T00:00:00Z');
  return Math.round((toMs - fromMs) / 86400000);
}

module.exports = { manilaNow, manilaTodayISO, dateOnlyISO, daysBetween };
