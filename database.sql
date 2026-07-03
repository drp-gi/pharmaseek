-- ============================================================
-- PharmaSeek: Pharmacy Inventory System
-- Database Schema v2.0
-- Engine: MariaDB / MySQL
-- ============================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";
SET NAMES utf8mb4;

-- ============================================================
-- CREATE DATABASE
-- ============================================================

CREATE DATABASE IF NOT EXISTS `pharmaseek_db`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE `pharmaseek_db`;

-- ============================================================
-- TABLE: categories
-- Organizes medicines into logical groupings (e.g. Analgesics)
-- ============================================================

CREATE TABLE `categories` (
  `category_id`   int(11)       NOT NULL AUTO_INCREMENT,
  `category_name` varchar(100)  NOT NULL,
  `description`   text          DEFAULT NULL,
  PRIMARY KEY (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================
-- TABLE: suppliers
-- Stores reference contact data only. No system login/access.
-- One supplier can supply many medicines (Version B).
-- ============================================================

CREATE TABLE `suppliers` (
  `supplier_id`    int(11)      NOT NULL AUTO_INCREMENT,
  `company_name`   varchar(100) NOT NULL,
  `contact_person` varchar(100) DEFAULT NULL,
  `phone_number`   varchar(20)  DEFAULT NULL,
  `email`          varchar(100) DEFAULT NULL,
  PRIMARY KEY (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================
-- TABLE: users
-- Admin, Pharmacist, Staff — no Supplier role.
-- ============================================================

CREATE TABLE `users` (
  `user_id`    int(11)      NOT NULL AUTO_INCREMENT,
  `first_name` varchar(50)  NOT NULL,
  `last_name`  varchar(50)  NOT NULL,
  `username`   varchar(50)  NOT NULL,
  `password`   varchar(255) NOT NULL,
  `email`      varchar(100) DEFAULT NULL,
  `position`   ENUM('Admin','Pharmacist','Staff') NOT NULL,
  `status`     ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================
-- TABLE: medicines
-- Primary catalog. FK to categories and suppliers.
-- supplier_id links to suppliers table (data only, no login).
-- ============================================================

CREATE TABLE `medicines` (
  `medicine_id`     int(11)       NOT NULL AUTO_INCREMENT,
  `medicine_name`   varchar(100)  NOT NULL,
  `brand_name`      varchar(100)  DEFAULT NULL,
  `medicine_type`   varchar(50)   DEFAULT NULL,
  `dose`            varchar(50)   DEFAULT NULL,
  `description`     text          DEFAULT NULL,
  `unit_price`      decimal(10,2) DEFAULT NULL,
  `stock_quantity`  int(11)       NOT NULL DEFAULT 0,
  `stock_threshold` int(11)       NOT NULL DEFAULT 50,
  `expiration_date` date          DEFAULT NULL,
  `image_path`      varchar(255)  DEFAULT NULL,
  `category_id`     int(11)       DEFAULT NULL,
  `supplier_id`     int(11)       DEFAULT NULL,
  PRIMARY KEY (`medicine_id`),
  KEY `category_id` (`category_id`),
  KEY `supplier_id` (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================
-- TABLE: restock_requests
-- Internal workflow record when stock falls below threshold.
-- Created by system/Pharmacist, approved/dismissed by Pharmacist.
-- ============================================================

CREATE TABLE `restock_requests` (
  `request_id`         int(11)   NOT NULL AUTO_INCREMENT,
  `status`             ENUM('Pending','Approved','Cancelled','Completed')
                                  NOT NULL DEFAULT 'Pending',
  `request_date`       datetime  NOT NULL DEFAULT current_timestamp(),
  `quantity_requested` int(11)   DEFAULT NULL,
  `notes`              text      DEFAULT NULL,
  `medicine_id`        int(11)   DEFAULT NULL,
  `user_id`            int(11)   DEFAULT NULL,
  PRIMARY KEY (`request_id`),
  KEY `medicine_id` (`medicine_id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================
-- TABLE: stock_transactions
-- Logs every physical inventory movement: sale, restock, disposal.
-- ============================================================

CREATE TABLE `stock_transactions` (
  `transaction_id`       int(11)  NOT NULL AUTO_INCREMENT,
  `transaction_type`     ENUM('restock','sale','disposal') NOT NULL,
  `transaction_quantity` int(11)  NOT NULL,
  `transaction_date`     datetime NOT NULL DEFAULT current_timestamp(),
  `disposal_reason`      varchar(255) DEFAULT NULL,
  `notes`                text         DEFAULT NULL,
  `request_id`           int(11)      DEFAULT NULL,
  `medicine_id`          int(11)      DEFAULT NULL,
  `user_id`              int(11)      DEFAULT NULL,
  PRIMARY KEY (`transaction_id`),
  KEY `medicine_id` (`medicine_id`),
  KEY `user_id` (`user_id`),
  KEY `request_id` (`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================
-- TABLE: management_logs
-- Manual audit entries filed by Admin after reviewing reports.
-- Optionally linked to a specific medicine.
-- ============================================================

CREATE TABLE `management_logs` (
  `log_id`           int(11)  NOT NULL AUTO_INCREMENT,
  `findings`         text     DEFAULT NULL,
  `corrective_action` text    DEFAULT NULL,
  `date_logged`      datetime NOT NULL DEFAULT current_timestamp(),
  `user_id`          int(11)  DEFAULT NULL,
  `medicine_id`      int(11)  DEFAULT NULL,
  PRIMARY KEY (`log_id`),
  KEY `user_id` (`user_id`),
  KEY `medicine_id` (`medicine_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================

ALTER TABLE `medicines`
  ADD CONSTRAINT `medicines_ibfk_1`
    FOREIGN KEY (`category_id`) REFERENCES `categories` (`category_id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `medicines_ibfk_2`
    FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `restock_requests`
  ADD CONSTRAINT `restock_requests_ibfk_1`
    FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`medicine_id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `restock_requests_ibfk_2`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `stock_transactions`
  ADD CONSTRAINT `stock_transactions_ibfk_1`
    FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`medicine_id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `stock_transactions_ibfk_2`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `stock_transactions_ibfk_3`
    FOREIGN KEY (`request_id`) REFERENCES `restock_requests` (`request_id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `management_logs`
  ADD CONSTRAINT `management_logs_ibfk_1`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `management_logs_ibfk_2`
    FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`medicine_id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- SEED DATA: one user per role for development/testing
-- All three use password: "password"
-- Hash: $2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi
-- IMPORTANT: replace with real accounts before live demo
-- ============================================================

INSERT INTO `users`
  (`user_id`, `first_name`, `last_name`, `username`, `password`, `email`, `position`, `status`)
VALUES
  (1, 'Admin',  'User',  'admin',     '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin@pharmaseek.com',      'Admin',      'Active'),
  (2, 'Rica',   'Cruz',  'rcruz_ph',  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'rcruz@pharmaseek.com',      'Pharmacist', 'Active'),
  (3, 'Marco',  'Reyes', 'mreyes_s',  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'mreyes@pharmaseek.com',     'Staff',      'Active');

-- ============================================================
-- SEED DATA: sample categories
-- ============================================================

INSERT INTO `categories` (`category_id`, `category_name`, `description`) VALUES
  (1, 'Analgesics',   'Pain relief medicines'),
  (2, 'Antibiotics',  'Medicines that fight bacterial infections'),
  (3, 'Vitamins',     'Dietary supplements and vitamins'),
  (4, 'Antivirals',   'Medicines used to treat viral infections'),
  (5, 'Antacids',     'Medicines that neutralize stomach acid');

-- ============================================================
-- SEED DATA: sample supplier
-- ============================================================

INSERT INTO `suppliers` (`supplier_id`, `company_name`, `contact_person`, `phone_number`, `email`) VALUES
  (1, 'MediCore Philippines', 'Juan Dela Cruz', '0920-111-2222', 'orders@medicore.ph');

COMMIT;