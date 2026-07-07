

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
('Admin', 'User', 'admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin@pharmaseek.com', 'Admin', 'Active'),
('Rica', 'Cruz', 'rcruz_ph', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'rcruz@pharmaseek.com', 'Pharmacist', 'Active'),
('Marco', 'Reyes', 'mreyes_s', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'mreyes@pharmaseek.com', 'Staff', 'Active');


INSERT INTO categories (category_name, description)
VALUES
('Analgesics', 'Pain relief medicines'),
('Antibiotics', 'Medicines that fight bacterial infections'),
('Vitamins', 'Dietary supplements and vitamins'),
('Antivirals', 'Medicines used to treat viral infections'),
('Antacids', 'Medicines that neutralize stomach acid');


INSERT INTO suppliers (company_name, contact_person, phone_number, email)
VALUES
('MediCore Philippines', 'Juan Dela Cruz', '0920-111-2222', 'orders@medicore.ph');


--mao ni databse na file guys mix nani sa inyo gi send na database
--ang katong select select na columns kay magamit to ighumman sa UI ig connect sa database