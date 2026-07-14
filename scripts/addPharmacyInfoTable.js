// scripts/addPharmacyInfoTable.js
//
// One-time migration for the Admin Settings page. Adds the pharmacy_info
// table (a single row holding the pharmacy's name/address/contact/email)
// to an already-existing database, so the team doesn't have to drop and
// reimport database.sql just for this.
//
// Run once, after starting MySQL:
//   node scripts/addPharmacyInfoTable.js
//
// Safe to re-run — uses CREATE TABLE IF NOT EXISTS and only seeds the
// default row when the table is empty.
const db = require('../db/connection');

async function run() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pharmacy_info (
      pharmacy_id INT PRIMARY KEY DEFAULT 1,
      pharmacy_name VARCHAR(100) NOT NULL,
      address VARCHAR(255),
      contact_number VARCHAR(20),
      email VARCHAR(100)
    )
  `);

  const [[{ count }]] = await db.query(`SELECT COUNT(*) AS count FROM pharmacy_info`);

  if (count === 0) {
    await db.query(
      `INSERT INTO pharmacy_info (pharmacy_id, pharmacy_name, address, contact_number, email)
       VALUES (1, 'City Center Pharmacy', '123 Health Blvd, Medical District, NY 10001', '+1 (555) 012-3456', 'contact@citycenterpharma.com')`
    );
    console.log('Created pharmacy_info table and seeded the default row.');
  } else {
    console.log('pharmacy_info table already present — nothing to seed.');
  }

  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
