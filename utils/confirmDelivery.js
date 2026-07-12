// utils/confirmDelivery.js
// Shared by both the Staff Transactions page (Delivery Check-in tab) and
// the Pharmacist's Restock Requests page (Approved tab) — both trigger
// the same verification step and the same stock movement, just from
// different roles/routes.
//
// Moves an Approved restock request to Completed, adds the *actually
// received* quantity (not necessarily what was originally requested) to
// the medicine's stock, and logs a matching stock_transactions row —
// all inside one DB transaction.
async function confirmDelivery(db, { requestId, quantityReceived, notes, userId }) {
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

    await connection.query(
      `UPDATE medicines SET stock_quantity = stock_quantity + ? WHERE medicine_id = ?`,
      [quantityReceived, request.medicine_id]
    );

    await connection.query(
      `INSERT INTO stock_transactions (transaction_type, transaction_quantity, notes, request_id, medicine_id, user_id)
       VALUES ('restock', ?, ?, ?, ?, ?)`,
      [quantityReceived, notes || null, requestId, request.medicine_id, userId]
    );

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
