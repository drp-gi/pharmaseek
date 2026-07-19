// scripts/backfillRestockRequests.js
//
// One-time backfill for the auto-restock-request feature. Sales and
// disposals now auto-generate a Pending restock request when they push a
// medicine below its threshold,but that only covers *future* stock
// movements. This script catches anything that's already below threshold
// right now (e.g. from before this feature existed) and creates the
// missing Pending requests, using the same suggested-quantity formula.
//
// Run once, after starting MySQL:
//   node scripts/backfillRestockRequests.js
//
// Safe to re-run — it skips any medicine that already has an open
// (Pending/Approved) request, so it won't create duplicates.
const db = require('../db/connection');
const { maybeCreateRestockRequest } = require('../utils/autoRestock');

async function run() {
  const [medicines] = await db.query(
    `SELECT medicine_id, medicine_name, stock_quantity, stock_threshold
     FROM medicines
     WHERE stock_quantity < stock_threshold
     ORDER BY medicine_name`
  );

  if (medicines.length === 0) {
    console.log('No medicines are currently below their stock threshold. Nothing to do.');
    process.exit(0);
  }

  let created = 0;
  let skipped = 0;

  for (const m of medicines) {
    const didCreate = await maybeCreateRestockRequest(db, {
      medicineId: m.medicine_id,
      userId: null,
      reason: 'Auto-generated: stock already below threshold (backfill).'
    });

    if (didCreate) {
      created++;
      console.log(`Created Pending request for "${m.medicine_name}" (${m.stock_quantity}/${m.stock_threshold}).`);
    } else {
      skipped++;
      console.log(`Skipped "${m.medicine_name}" — already has an open restock request.`);
    }
  }

  console.log(`\nDone. ${created} request(s) created, ${skipped} skipped.`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
