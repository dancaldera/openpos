-- Migration: V013
-- Description: Update existing orders with default user
-- Type: seeds

UPDATE orders SET user_id = 1 WHERE user_id IS NULL;
