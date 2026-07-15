// utils/confirmDelivery.js
// Shared by both the Staff Transactions page (Delivery Check-in tab) and
// the Pharmacist's Restock Requests page (Approved tab) — both trigger
// the same verification step and the same stock movement, just from
// different roles/routes.
//
// Moves an Approved restock request to Completed and creates a new
// medicine_batches row for the *actually received* quantity/expiry (not
// necessarily what was originally requested) — a delivery is always a new
// lot, since it can carry an expiration date different from what's
// already on the shelf. Logs a matching stock_transactions row, all
// inside one DB transaction.
const { maybeCreateRestockRequest } = require('./autoRestock');

async function confirmDelivery(db, { requestId, quantityReceived, expirationDate, lotNumber, notes, userId }) {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [[request]] = await connection.query(
      `SELECT medicine_id, status FROM restock_requests WHERE request_id = ? FOR UPDATE`,
      [requestId]
    );

    if (!request || request.status !== 'Approved') {
      await connection.rollback();
      return { ok: false, reason: 'not-approved' };
    }

    await connection.query(
      `UPDATE restock_requests SET status = 'Completed' WHERE request_id = ?`,
      [requestId]
    );

    const [batchResult] = await connection.query(
      `INSERT INTO medicine_batches
         (medicine_id, lot_number, quantity_received, quantity_on_hand, expiration_date, request_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [request.medicine_id, lotNumber || null, quantityReceived, quantityReceived, expirationDate || null, requestId, userId]
    );

    await connection.query(
      `INSERT INTO stock_transactions (transaction_type, transaction_quantity, notes, request_id, medicine_id, batch_id, user_id)
       VALUES ('restock', ?, ?, ?, ?, ?, ?)`,
      [quantityReceived, notes || null, requestId, request.medicine_id, batchResult.insertId, userId]
    );

    // A partial delivery can still leave stock below threshold — re-run the
    // check so a fresh Pending request pops back up immediately instead of
    // waiting on the next unrelated sale/disposal to notice.
    await maybeCreateRestockRequest(connection, {
      medicineId: request.medicine_id,
      userId,
      reason: 'Auto-generated: still below threshold after this delivery.'
    });

    await connection.commit();
    return { ok: true };
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch (rollbackErr) { console.error(rollbackErr); }
    }
    throw err;
  } finally {
    if (connection) connection.release();
  }
}

module.exports = { confirmDelivery };
