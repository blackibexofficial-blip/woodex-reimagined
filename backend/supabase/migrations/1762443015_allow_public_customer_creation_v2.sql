-- Migration: allow_public_customer_creation_v2
-- Created at: 1762443015

-- Drop existing conflicting policies if they exist
DROP POLICY IF EXISTS "Allow public customer creation" ON customers;
DROP POLICY IF EXISTS "Allow anon customer creation" ON customers;

-- Allow public users to create customer records for guest checkout
CREATE POLICY "Allow public customer creation" ON customers
FOR INSERT
WITH CHECK (true);;