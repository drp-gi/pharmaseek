// scripts/migrateToMedicineBatches.js
//
// One-time migration: introduces medicine_batches for real batch/lot
// tracking, replacing the single medicines.stock_quantity/expiration_date
// columns. A delivery can now bring in stock with a different expiry than
// what's already on the shelf — something one scalar column per medicine
// could never represent.
//
// Every medicine that currently has stock becomes one "opening balance"
// batch, carrying its existing stock_quantity/expiration_date forward so
// nothing changes numerically until later phases wire batches into the
// sale/disposal/delivery flows.
//
// Run once, after starting MySQL:
//   node scripts/migrateToMedicineBatches.js
//
// Safe to re-run — checks current state before acting at every step, and
// only backfills medicines that don't already have a batch row.
const db = require('../db/connection');

async function run() {
  const [batchesTable] = await db.query(`SHOW TABLES LIKE 'medicine_batches'`);
  if (batchesTable.length === 0) {
    await db.query(`
      CREATE TABLE medicine_batches (
          batch_id            INT AUTO_INCREMENT PRIMARY KEY,
          medicine_id         INT NOT NULL,
          lot_number          VARCHAR(100),
          quantity_received   INT NOT NULL,
          quantity_on_hand    INT NOT NULL,
          expiration_date     DATE,
          received_date       DATE NOT NULL DEFAULT (CURRENT_DATE),
          request_id          INT,
          created_by          INT,
          created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,

          FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id),
          FOREIGN KEY (request_id) REFERENCES restock_requests(request_id),
          FOREIGN KEY (created_by) REFERENCES users(user_id),
          CHECK (quantity_on_hand >= 0 AND quantity_on_hand <= quantity_received),
          INDEX idx_batches_medicine_expiry (medicine_id, expiration_date)
      )
    `);
    console.log('Created medicine_batches.');
  } else {
    console.log('medicine_batches already exists — skipping create.');
  }

  const [batchIdCol] = await db.query(`SHOW COLUMNS FROM stock_transactions LIKE 'batch_id'`);
  if (batchIdCol.length === 0) {
    await db.query(`
      ALTER TABLE stock_transactions
        ADD COLUMN batch_id INT NULL AFTER medicine_id,
        ADD FOREIGN KEY (batch_id) REFERENCES medicine_batches(batch_id)
    `);
    console.log('Added stock_transactions.batch_id.');
  } else {
    console.log('stock_transactions.batch_id already exists — skipping.');
  }

  await db.query(`
    CREATE OR REPLACE VIEW medicine_stock_summary AS
    SELECT
        medicine_id,
        SUM(quantity_on_hand)   AS stock_quantity,
        MIN(expiration_date)    AS nearest_expiration_date,
        COUNT(*)                AS batch_count
    FROM medicine_batches
    WHERE quantity_on_hand > 0
    GROUP BY medicine_id
  `);
  console.log('Created/refreshed medicine_stock_summary view.');

  const [backfillResult] = await db.query(`
    INSERT INTO medicine_batches
      (medicine_id, lot_number, quantity_received, quantity_on_hand, expiration_date, received_date)
    SELECT m.medicine_id, 'Opening balance (migrated)', m.stock_quantity, m.stock_quantity,
           m.expiration_date, CURDATE()
    FROM medicines m
    WHERE m.stock_quantity > 0
      AND NOT EXISTS (SELECT 1 FROM medicine_batches mb WHERE mb.medicine_id = m.medicine_id)
  `);
  console.log(`Backfilled ${backfillResult.affectedRows} opening-balance batch(es).`);

  const [mismatches] = await db.query(`
    SELECT m.medicine_id, m.medicine_name, m.stock_quantity AS old_qty,
           COALESCE(ms.stock_quantity, 0) AS new_qty
    FROM medicines m
    LEFT JOIN medicine_stock_summary ms ON ms.medicine_id = m.medicine_id
    HAVING old_qty <> new_qty
  `);

  if (mismatches.length > 0) {
    console.error('Reconciliation FAILED — old stock_quantity does not match new batch totals:');
    console.table(mismatches);
    process.exit(1);
  }

  console.log('Reconciliation OK — every medicine\'s batch total matches its old stock_quantity.');
  console.log('\nDone. Legacy medicines.stock_quantity/expiration_date columns are untouched for now (dropped in a later cleanup migration).');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
