-- Migration: V017
-- Description: Insert default customers
-- Type: seeds

INSERT OR IGNORE INTO customers (id, customer_number, first_name, last_name, email, phone, customer_type, is_active, created_at, updated_at) VALUES
    (1, 'CUST-00001', 'Walk-In', 'Customer', NULL, NULL, 'individual', 1, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
    (2, 'CUST-00002', 'John', 'Doe', 'john.doe@email.com', '555-0100', 'individual', 1, '2024-01-02T00:00:00.000Z', '2024-01-02T00:00:00.000Z'),
    (3, 'CUST-00003', 'Acme', 'Corporation', 'billing@acme.com', '555-0200', 'business', 1, '2024-01-03T00:00:00.000Z', '2024-01-03T00:00:00.000Z');
