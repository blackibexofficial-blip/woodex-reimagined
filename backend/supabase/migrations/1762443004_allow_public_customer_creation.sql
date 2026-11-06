-- Migration: allow_public_customer_creation
-- Created at: 1762443004

-- Allow public users to create customer records for guest checkout
CREATE POLICY IF NOT EXISTS "Allow public customer creation" ON customers
FOR INSERT
TO public
WITH CHECK (true);

-- Also allow anonymous users to insert into customers
CREATE POLICY IF NOT EXISTS "Allow anon customer creation" ON customers
FOR INSERT
TO anon
WITH CHECK (true);;