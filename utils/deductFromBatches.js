// utils/deductFromBatches.js
// FEFO (First-Expired-First-Out) stock deduction shared by sales and
// disposals — neither a customer nor a disposal cares which physical lot
// stock comes from, so both always draw from whichever batch expires
// soonest first, automatically. If satisfying the requested quantity
// requires draining more than one batch, each batch touched gets its own
// stock_transactions row (with its own batch_id) so the ledger always
// shows exactly which lot(s) a sale/disposal came from.
//
// Must be called with an open transaction's `connection` — the caller
// owns begin/commit/rollback, since this is one step inside a larger
// sale/disposal transaction (this file also creates the stock_transactions
// rows, but the caller still commits).
async function deductFromBatches(connection, { medicineId, quantity, userId, transactionType, disposalReason = null }) {
  const [batches] = await connection.query(
    `SELECT batch_id, quantity_on_hand
     FROM medicine_batches
     WHERE medicine_id = ? AND quantity_on_hand > 0
     ORDER BY expiration_date ASC, batch_id ASC
     FOR UPDATE`,
    [medicineId]
  );

  const available = batches.reduce((sum, b) => sum + b.quantity_on_hand, 0);
  if (quantity > available) {
    return { ok: false, available };
  }

  let remaining = quantity;
  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.quantity_on_hand);

    await connection.query(
      `UPDATE medicine_batches SET quantity_on_hand = quantity_on_hand - ? WHERE batch_id = ?`,
      [take, batch.batch_id]
    );
    await connection.query(
      `INSERT INTO stock_transactions (transaction_type, transaction_quantity, disposal_reason, medicine_id, batch_id, user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [transactionType, take, disposalReason, medicineId, batch.batch_id, userId]
    );

    remaining -= take;
  }

  return { ok: true, available };
}

module.exports = { deductFromBatches };
