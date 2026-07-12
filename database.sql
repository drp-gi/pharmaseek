

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
    user_id INT,

    FOREIGN KEY (request_id) REFERENCES restock_requests(request_id),
    FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id),
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


-- SEED DATA
-- One test account per role. All three use the password: password
-- The long text below is that password already encrypted (hashed)

INSERT INTO users (first_name, last_name, username, password, email, position, status)
VALUES
('Admin', 'User', 'admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin.user@pharmaseek.com', 'Admin', 'Active'),
('Rica', 'Cruz', 'rcruz_ph', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'rica.cruz@pharmaseek.com', 'Pharmacist', 'Active'),
('Marco', 'Reyes', 'mreyes_s', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'marco.reyes@pharmaseek.com', 'Staff', 'Active');


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

