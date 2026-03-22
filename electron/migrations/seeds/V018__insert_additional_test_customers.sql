-- Migration: V018
-- Description: Insert additional test customers
-- Type: seeds

INSERT OR IGNORE INTO customers (id, customer_number, first_name, last_name, email, phone, customer_type, is_active, created_at, updated_at) VALUES
    (4, 'CUST-00004', 'Jane', 'Smith', 'jane.smith@email.com', '555-0300', 'individual', 1, '2024-01-04T00:00:00.000Z', '2024-01-04T00:00:00.000Z'),
    (5, 'CUST-00005', 'Bob', 'Johnson', 'bob.j@email.com', '555-0400', 'individual', 1, '2024-01-05T00:00:00.000Z', '2024-01-05T00:00:00.000Z'),
    (6, 'CUST-00006', 'Tech', 'Solutions', 'contact@techsolutions.com', '555-0500', 'business', 1, '2024-01-06T00:00:00.000Z', '2024-01-06T00:00:00.000Z');
