-- Migration: V019
-- Description: Insert sample orders
-- Type: seeds

INSERT OR IGNORE INTO orders (id, subtotal, tax, total, status, payment_method, user_id, customer_id, created_at, updated_at, completed_at) VALUES
    (3, 15.99, 1.60, 17.59, 'completed', 'cash', 3, 2, '2025-01-20T10:30:00.000Z', '2025-01-20T10:35:00.000Z', '2025-01-20T10:35:00.000Z'),
    (4, 42.97, 4.30, 47.27, 'completed', 'card', 3, 3, '2025-01-21T14:45:00.000Z', '2025-01-21T14:50:00.000Z', '2025-01-21T14:50:00.000Z'),
    (5, 8.50, 0.85, 9.35, 'completed', 'cash', 3, NULL, '2025-01-22T09:15:00.000Z', '2025-01-22T09:20:00.000Z', '2025-01-22T09:20:00.000Z');
