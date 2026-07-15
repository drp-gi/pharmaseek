

CREATE DATABASE IF NOT EXISTS pharmaseek_db;
USE pharmaseek_db;


-- CATEGORIES
-- Groups medicines together, e.g. "Analgesics", "Vitamins"
CREATE TABLE categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL,
    description TEXT
);


-- SUPPLIERS
-- Contact info only. Suppliers do not log into the system.
CREATE TABLE suppliers (
    supplier_id INT AUTO_INCREMENT PRIMARY KEY,
    company_name VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100),
    phone_number VARCHAR(20),
    email VARCHAR(100)
);


-- PHARMACY_INFO
-- Singleton table (one row, id = 1) holding the pharmacy-wide details
-- shown on the Admin Settings page.
CREATE TABLE pharmacy_info (
    pharmacy_id INT PRIMARY KEY DEFAULT 1,
    pharmacy_name VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    contact_number VARCHAR(20),
    email VARCHAR(100)
);


-- USERS
-- Admin, Pharmacist, or Staff. Accounts are created by an Admin only.
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    position ENUM('Admin', 'Pharmacist', 'Staff') NOT NULL,
    status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active'
);


-- MEDICINES
-- The main catalog. Linked to one category and one supplier.
CREATE TABLE medicines (
    medicine_id INT AUTO_INCREMENT PRIMARY KEY,
    medicine_name VARCHAR(100) NOT NULL,
    brand_name VARCHAR(100),
    medicine_type VARCHAR(50),
    dose VARCHAR(50),
    description TEXT,
    unit_price DECIMAL(10, 2),
    stock_quantity INT NOT NULL DEFAULT 0,
    stock_threshold INT NOT NULL DEFAULT 50,
    expiration_date DATE,
    image_path VARCHAR(255),
    status ENUM('Active', 'Discontinued') NOT NULL DEFAULT 'Active',
    category_id INT,
    supplier_id INT,

    FOREIGN KEY (category_id) REFERENCES categories(category_id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id)
);


-- RESTOCK_REQUESTS
-- Created when stock is low. Pharmacist approves or cancels it.
CREATE TABLE restock_requests (
    request_id INT AUTO_INCREMENT PRIMARY KEY,
    status ENUM('Pending', 'Approved', 'Cancelled', 'Completed') NOT NULL DEFAULT 'Pending',
    request_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    quantity_requested INT,
    notes TEXT,
    medicine_id INT,
    user_id INT,

    FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);


-- MEDICINE_BATCHES
-- One row per physical lot/delivery of a medicine, each with its own
-- quantity and expiration_date — a delivery can bring in stock that
-- expires on a different date than what's already on the shelf, which a
-- single stock_quantity/expiration_date column on medicines could never
-- represent. Rows are never deleted — a depleted batch (quantity_on_hand
-- = 0) is kept for audit/FEFO history, the same way medicines uses
-- status='Discontinued' instead of DELETE.
CREATE TABLE medicine_batches (
    batch_id INT AUTO_INCREMENT PRIMARY KEY,
    medicine_id INT NOT NULL,
    lot_number VARCHAR(100),
    quantity_received INT NOT NULL,
    quantity_on_hand INT NOT NULL,
    expiration_date DATE,
    received_date DATE NOT NULL DEFAULT (CURRENT_DATE),
    request_id INT,
    created_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id),
    FOREIGN KEY (request_id) REFERENCES restock_requests(request_id),
    FOREIGN KEY (created_by) REFERENCES users(user_id),
    CHECK (quantity_on_hand >= 0 AND quantity_on_hand <= quantity_received),
    INDEX idx_batches_medicine_expiry (medicine_id, expiration_date)
);


-- STOCK_TRANSACTIONS
-- Every physical stock movement: a sale, a restock delivery, or a disposal.
CREATE TABLE stock_transactions (
    transaction_id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_type ENUM('restock', 'sale', 'disposal') NOT NULL,
    transaction_quantity INT NOT NULL,
    transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    disposal_reason VARCHAR(255),
    notes TEXT,
    request_id INT,
    medicine_id INT,
    batch_id INT,
    user_id INT,

    FOREIGN KEY (request_id) REFERENCES restock_requests(request_id),
    FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id),
    FOREIGN KEY (batch_id) REFERENCES medicine_batches(batch_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);


-- MANAGEMENT_LOGS
-- Written by Admin after reviewing a report and finding an issue.
CREATE TABLE management_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    findings TEXT,
    corrective_action TEXT,
    date_logged DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INT,
    medicine_id INT,

    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id)
);


-- MEDICINE_STOCK_SUMMARY
-- Per-medicine total stock + nearest expiring batch, aggregated from
-- medicine_batches. Read sites that used to select medicines.stock_quantity/
-- expiration_date directly now LEFT JOIN this view instead (depleted
-- batches are excluded, so a medicine with no remaining stock simply has
-- no row here — callers COALESCE the total to 0).
CREATE VIEW medicine_stock_summary AS
SELECT
    medicine_id,
    SUM(quantity_on_hand) AS stock_quantity,
    MIN(expiration_date) AS nearest_expiration_date,
    COUNT(*) AS batch_count
FROM medicine_batches
WHERE quantity_on_hand > 0
GROUP BY medicine_id;


-- SEED DATA
-- One test account per role. All three use the password: password
-- The long text below is that password already encrypted (hashed)

INSERT INTO users (first_name, last_name, username, password, email, position, status)
VALUES
('Admin', 'User', 'admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin.user@pharmaseek.com', 'Admin', 'Active'),
('Rica', 'Cruz', 'rcruz_ph', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'rica.cruz@pharmaseek.com', 'Pharmacist', 'Active'),
('Marco', 'Reyes', 'mreyes_s', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'marco.reyes@pharmaseek.com', 'Staff', 'Active');


INSERT INTO pharmacy_info (pharmacy_id, pharmacy_name, address, contact_number, email)
VALUES
(1, 'City Center Pharmacy', '123 Health Blvd, Medical District, NY 10001', '+1 (555) 012-3456', 'contact@citycenterpharma.com');


INSERT INTO categories (category_name, description)
VALUES
('Analgesics', 'Pain relief medicines'),
('Antibiotics', 'Medicines that fight bacterial infections'),
('Vitamins', 'Dietary supplements and vitamins'),
('Antivirals', 'Medicines used to treat viral infections'),
('Antacids', 'Medicines that neutralize stomach acid');


INSERT INTO suppliers (company_name, contact_person, phone_number, email)
VALUES
('MediCore Philippines', 'Juan Dela Cruz', '0920-111-2222', 'orders@medicore.ph'),
('Unilab Distribution Inc.', 'Maria Santos', '+63 2 8858 1000', 'orders@unilab.com.ph');


-- MEDICINES
-- Mixed on purpose: some below their stock_threshold (shows red/low-stock
-- in the UI), some past expiration_date, some expiring within 30 days,
-- so both the Inventory catalog and the Reports > Expiration Tracking
-- tab have real data to render against.

INSERT INTO medicines (medicine_name, brand_name, medicine_type, dose, description, unit_price, stock_quantity, stock_threshold, expiration_date, image_path, category_id, supplier_id)
VALUES
('Paracetamol 500mg', 'Biogesic', 'Tablet', '500mg',
 'For the relief of minor aches and pains such as headache, muscle ache, backache, minor arthritis pain, common cold, toothache, and menstrual cramps.',
 4.50, 1240, 100, '2025-12-12', '/uploads/medicines/paracetamol500.webp',
 (SELECT category_id FROM categories WHERE category_name = 'Analgesics'),
 (SELECT supplier_id FROM suppliers WHERE company_name = 'Unilab Distribution Inc.')),

('Ibuprofen 400mg', 'Advil', 'Tablet', '400mg',
 'Nonsteroidal anti-inflammatory drug (NSAID) used to reduce fever and treat pain or inflammation.',
 12.00, 850, 100, '2027-03-20', '/uploads/medicines/ibuprofen400.webp',
 (SELECT category_id FROM categories WHERE category_name = 'Analgesics'),
 (SELECT supplier_id FROM suppliers WHERE company_name = 'MediCore Philippines')),

('Amoxicillin 500mg', 'Amoxil', 'Capsule', '500mg',
 'Penicillin-type antibiotic used to treat a wide variety of bacterial infections.',
 25.00, 42, 50, '2027-01-10', '/uploads/medicines/amoxicillin500.avif',
 (SELECT category_id FROM categories WHERE category_name = 'Antibiotics'),
 (SELECT supplier_id FROM suppliers WHERE company_name = 'Unilab Distribution Inc.')),

('Ascorbic Acid 500mg', 'Cecon', 'Tablet', '500mg',
 'Vitamin C supplement that supports immune function and antioxidant activity.',
 8.75, 2100, 200, '2028-05-01', '/uploads/medicines/ascorbic500mg.png',
 (SELECT category_id FROM categories WHERE category_name = 'Vitamins'),
 (SELECT supplier_id FROM suppliers WHERE company_name = 'MediCore Philippines')),

('Oseltamivir 75mg', 'Tamiflu', 'Capsule', '75mg',
 'Antiviral medicine used to treat and prevent influenza (flu).',
 85.00, 0, 30, '2026-08-01', '/uploads/medicines/Oseltamivir75mg.jpg',
 (SELECT category_id FROM categories WHERE category_name = 'Antivirals'),
 (SELECT supplier_id FROM suppliers WHERE company_name = 'Unilab Distribution Inc.')),

('Omeprazole 20mg', 'Losec', 'Capsule', '20mg',
 'Proton pump inhibitor used to treat heartburn, acid reflux, and stomach ulcers.',
 15.00, 300, 50, '2027-11-11', '/uploads/medicines/Omeprazole20mg.webp',
 (SELECT category_id FROM categories WHERE category_name = 'Antacids'),
 (SELECT supplier_id FROM suppliers WHERE company_name = 'MediCore Philippines'));


-- MEDICINE_BATCHES
-- One opening-balance batch per medicine, carrying forward the same
-- quantity/expiration_date seeded above — this is what a real delivery
-- check-in would create going forward, just backdated as "already on the
-- shelf" for demo purposes.

INSERT INTO medicine_batches (medicine_id, lot_number, quantity_received, quantity_on_hand, expiration_date, received_date)
VALUES
((SELECT medicine_id FROM medicines WHERE medicine_name = 'Paracetamol 500mg'),
 'Opening balance', 1240, 1240, '2025-12-12', '2026-01-01'),

((SELECT medicine_id FROM medicines WHERE medicine_name = 'Ibuprofen 400mg'),
 'Opening balance', 850, 850, '2027-03-20', '2026-01-01'),

((SELECT medicine_id FROM medicines WHERE medicine_name = 'Amoxicillin 500mg'),
 'Opening balance', 42, 42, '2027-01-10', '2026-01-01'),

((SELECT medicine_id FROM medicines WHERE medicine_name = 'Ascorbic Acid 500mg'),
 'Opening balance', 2100, 2100, '2028-05-01', '2026-01-01'),

((SELECT medicine_id FROM medicines WHERE medicine_name = 'Omeprazole 20mg'),
 'Opening balance', 300, 300, '2027-11-11', '2026-01-01');
-- Oseltamivir 75mg starts at 0 stock (see medicines seed above) — no
-- batch row, matching how zero stock is represented everywhere else.


-- RESTOCK REQUESTS
-- Pending requests for the two lowest-stock medicines, flagged by Staff
-- and awaiting a Pharmacist's Approve/Dismiss on the dashboard.

INSERT INTO restock_requests (status, request_date, quantity_requested, notes, medicine_id, user_id)
VALUES
('Pending', '2026-07-09 09:15:00', 100,
 'Completely out of stock — flu season demand.',
 (SELECT medicine_id FROM medicines WHERE medicine_name = 'Oseltamivir 75mg'),
 (SELECT user_id FROM users WHERE username = 'mreyes_s')),

('Pending', '2026-07-08 14:40:00', 200,
 'Below threshold, still moving fast.',
 (SELECT medicine_id FROM medicines WHERE medicine_name = 'Amoxicillin 500mg'),
 (SELECT user_id FROM users WHERE username = 'mreyes_s')),

('Approved', '2026-07-06 11:00:00', 300,
 'Approved by Pharmacist, delivery pending.',
 (SELECT medicine_id FROM medicines WHERE medicine_name = 'Ibuprofen 400mg'),
 (SELECT user_id FROM users WHERE username = 'mreyes_s'));


-- STOCK TRANSACTIONS
-- A few same-day sales by Staff, so the Staff dashboard's "recorded X
-- transactions today" line has real data instead of always reading 0.

INSERT INTO stock_transactions (transaction_type, transaction_quantity, transaction_date, notes, medicine_id, user_id)
VALUES
('sale', 12, '2026-07-10 09:20:00', NULL,
 (SELECT medicine_id FROM medicines WHERE medicine_name = 'Paracetamol 500mg'),
 (SELECT user_id FROM users WHERE username = 'mreyes_s')),

('sale', 5, '2026-07-10 10:45:00', NULL,
 (SELECT medicine_id FROM medicines WHERE medicine_name = 'Ibuprofen 400mg'),
 (SELECT user_id FROM users WHERE username = 'mreyes_s')),

('sale', 20, '2026-07-10 13:05:00', NULL,
 (SELECT medicine_id FROM medicines WHERE medicine_name = 'Ascorbic Acid 500mg'),
 (SELECT user_id FROM users WHERE username = 'mreyes_s'));


-- MANAGEMENT LOGS
-- Sample findings/corrective actions filed by Admin, so the Management
-- Logs page has real entries to browse, search, and paginate.

INSERT INTO management_logs (findings, corrective_action, date_logged, user_id, medicine_id)
VALUES
('Amoxicillin 500mg stock count does not match system records.',
 'Investigated with Staff, found 5 units miscounted during the last delivery. Corrected the inventory record.',
 '2026-07-10 14:20:00',
 (SELECT user_id FROM users WHERE username = 'admin'),
 (SELECT medicine_id FROM medicines WHERE medicine_name = 'Amoxicillin 500mg')),

('Unusual spike in Paracetamol sales on July 7.',
 'Confirmed with Staff — a nearby community health drive caused a temporary demand surge. No further action needed.',
 '2026-07-08 09:15:00',
 (SELECT user_id FROM users WHERE username = 'admin'),
 (SELECT medicine_id FROM medicines WHERE medicine_name = 'Paracetamol 500mg')),

('Temperature deviation in cold storage unit overnight.',
 'Re-calibrated the thermostat and checked affected stock for spoilage. None found; all units remain within safe range.',
 '2026-07-05 08:00:00',
 (SELECT user_id FROM users WHERE username = 'admin'),
 NULL),

('Incorrect labeling on a newly arrived Amoxicillin batch.',
 'Returned the entire batch to the supplier for relabeling. Replacement expected within the week.',
 '2026-06-30 16:45:00',
 (SELECT user_id FROM users WHERE username = 'admin'),
 (SELECT medicine_id FROM medicines WHERE medicine_name = 'Amoxicillin 500mg')),

('Staff reported recurring lag in the inventory system during peak hours.',
 'Contacted IT support for a server capacity review.',
 '2026-06-28 11:30:00',
 (SELECT user_id FROM users WHERE username = 'admin'),
 NULL);

