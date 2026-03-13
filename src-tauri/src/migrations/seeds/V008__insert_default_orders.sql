-- Migration: V008
-- Description: Insert default orders
-- Type: seeds

INSERT OR IGNORE INTO orders (id, subtotal, tax, total, status, payment_method, created_at, updated_at, completed_at) VALUES
    (1, 8.99, 0.90, 9.89, 'completed', 'cash', '2024-01-15T10:30:00.000Z', '2024-01-15T10:35:00.000Z', '2024-01-15T10:35:00.000Z'),
    (2, 24.99, 2.50, 27.49, 'paid', 'card', '2024-01-16T14:45:00.000Z', '2024-01-16T14:50:00.000Z', '2024-01-16T14:50:00.000Z');
