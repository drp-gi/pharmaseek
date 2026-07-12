// utils/autoRestock.js
// Auto-generates a Pending restock request when a medicine's stock drops
// below its threshold, using the same suggested-quantity formula as the
// Pharmacist's manual "New Request" form:
//   suggested_quantity = (stock_threshold * 2) - stock_quantity
//
// Skips silently if the medicine already has an open (Pending/Approved)
// request, so repeated sales on an already-flagged medicine don't pile up
// duplicate requests.
//
// `queryable` is anything with a mysql2-compatible .query() — either the
// pool (db) or an in-progress transaction `connection`, so this can run
// either standalone (backfill script) or as part of a larger transaction
// (Sale/Disposal handlers).
async function maybeCreateRestockRequest(queryable, { medicineId, userId = null, reason }) {
  const [[medicine]] = await queryable.query(
    `SELECT stock_quantity, stock_threshold FROM medicines WHERE medicine_id = ?`,
    [medicineId]
  );
  if (!medicine || medicine.stock_quantity >= medicine.stock_threshold) return false;

  const [[existing]] = await queryable.query(
    `SELECT request_id FROM restock_requests
     WHERE medicine_id = ? AND status IN ('Pending', 'Approved')
     LIMIT 1`,
    [medicineId]
  );
  if (existing) return false;

  const suggestedQty = Math.max(1, (medicine.stock_threshold * 2) - medicine.stock_quantity);

  await queryable.query(
    `INSERT INTO restock_requests (status, quantity_requested, notes, medicine_id, user_id)
     VALUES ('Pending', ?, ?, ?, ?)`,
    [suggestedQty, reason || 'Auto-generated: stock fell below threshold.', medicineId, userId]
  );
  return true;
}

module.exports = { maybeCreateRestockRequest };
