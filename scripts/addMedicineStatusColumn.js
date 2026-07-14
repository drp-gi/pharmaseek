// scripts/addMedicineStatusColumn.js
//
// One-time migration for the Pharmacist Medicine Catalog's soft-delete
// feature. Adds a status column to medicines (Active/Discontinued,
// defaulting existing rows to Active) so "Remove" hides a medicine from
// active inventory instead of deleting it and its transaction history.
//
// Run once, after starting MySQL:
//   node scripts/addMedicineStatusColumn.js
//
// Safe to re-run — checks for the column before adding it.
const db = require('../db/connection');

async function run() {
  const [existing] = await db.query(
    `SHOW COLUMNS FROM medicines LIKE 'status'`
  );

  if (existing.length > 0) {
    console.log('medicines.status already exists — nothing to do.');
    process.exit(0);
  }

  await db.query(
    `ALTER TABLE medicines
     ADD COLUMN status ENUM('Active', 'Discontinued') NOT NULL DEFAULT 'Active' AFTER image_path`
  );
  console.log('Added medicines.status (all existing rows default to Active).');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
