-- Migration: V009
-- Description: Insert default order items
-- Type: seeds

INSERT OR IGNORE INTO order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price) VALUES
    (1, 1, 1, 'Coca Cola 500ml', 2, 2.50, 5.00),
    (2, 1, 2, 'Bread Loaf', 1, 3.99, 3.99),
    (3, 2, 3, 'Premium Coffee Beans 1kg', 1, 24.99, 24.99);
