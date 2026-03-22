-- Migration: V020
-- Description: Insert sample order items
-- Type: seeds

INSERT OR IGNORE INTO order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price) VALUES
    (4, 3, 1, 'Coca Cola 500ml', 3, 2.50, 7.50),
    (5, 3, 2, 'Bread Loaf', 2, 3.99, 7.98),
    (6, 4, 3, 'Premium Coffee Beans 1kg', 1, 24.99, 24.99),
    (7, 4, 4, 'Organic Milk 1L', 2, 4.50, 9.00),
    (8, 4, 5, 'Chocolate Bar', 3, 5.99, 17.97),
    (9, 5, 6, 'Fresh Salmon Fillet', 1, 18.99, 18.99),
    (10, 5, 1, 'Coca Cola 500ml', 2, 2.50, 5.00);
