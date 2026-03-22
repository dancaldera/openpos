-- Migration: V005
-- Description: Insert default products
-- Type: seeds

INSERT OR IGNORE INTO products (id, name, description, price, cost, stock, category, barcode, image, is_active, created_at, updated_at) VALUES
    (1, 'Coca Cola 500ml', 'Refreshing soft drink', 2.50, 1.20, 120, 'Beverages', '7501055363063', NULL, 1, '2024-01-01T00:00:00.000Z', '2024-01-15T10:30:00.000Z'),
    (2, 'Bread Loaf', 'Fresh whole wheat bread', 3.99, 1.80, 25, 'Bakery', '1234567890123', NULL, 1, '2024-01-02T00:00:00.000Z', '2024-01-16T14:45:00.000Z'),
    (3, 'Premium Coffee Beans 1kg', 'Arabica coffee beans from Colombia', 24.99, 12.00, 8, 'Coffee & Tea', '9876543210987', NULL, 1, '2024-01-03T00:00:00.000Z', '2024-01-17T09:15:00.000Z'),
    (4, 'Organic Milk 1L', 'Fresh organic whole milk', 4.50, 2.20, 45, 'Dairy', '5555666677778', NULL, 1, '2024-01-04T00:00:00.000Z', '2024-01-18T16:20:00.000Z'),
    (5, 'Chocolate Bar', 'Dark chocolate 70% cocoa', 5.99, 2.80, 0, 'Snacks', '1111222233334', NULL, 0, '2024-01-05T00:00:00.000Z', '2024-01-19T11:10:00.000Z'),
    (6, 'Fresh Salmon Fillet', 'Atlantic salmon, wild-caught', 18.99, 12.50, 12, 'Seafood', '2222333344445', NULL, 1, '2024-01-06T00:00:00.000Z', '2024-01-20T08:30:00.000Z'),
    (7, 'Frozen Pizza Margherita', 'Traditional Italian style pizza', 6.99, 3.50, 35, 'Frozen Foods', '3333444455556', NULL, 1, '2024-01-07T00:00:00.000Z', '2024-01-21T15:45:00.000Z'),
    (8, 'Bananas (per lb)', 'Fresh organic bananas', 1.29, 0.65, 150, 'Fresh Produce', '4444555566667', NULL, 1, '2024-01-08T00:00:00.000Z', '2024-01-22T12:15:00.000Z'),
    (9, 'Paper Towels (6-pack)', 'Ultra-absorbent paper towels', 12.99, 7.20, 28, 'Household Items', '9999888877778', NULL, 1, '2024-01-09T00:00:00.000Z', '2024-01-23T09:30:00.000Z'),
    (10, 'Shampoo & Conditioner Set', 'Moisturizing hair care set', 15.99, 8.90, 22, 'Personal Care', '6666777788889', NULL, 1, '2024-01-10T00:00:00.000Z', '2024-01-24T14:20:00.000Z');
