ALTER TABLE bookings ADD COLUMN idempotency_key VARCHAR(255);
ALTER TABLE bookings ADD CONSTRAINT uq_user_idempotency UNIQUE (user_id, idempotency_key);
