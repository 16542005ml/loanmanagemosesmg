-- Bcrypt hashes are 60 characters; keep room for future hash formats.
ALTER TABLE members MODIFY COLUMN security_pin VARCHAR(255) NULL;
ALTER TABLE approved_members MODIFY COLUMN security_pin VARCHAR(255) NULL;