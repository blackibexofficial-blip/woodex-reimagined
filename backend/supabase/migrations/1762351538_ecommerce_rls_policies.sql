-- Migration: ecommerce_rls_policies
-- Created at: 1762351538


-- Enable RLS
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- Cart items policies
CREATE POLICY "Users can view their own cart items" ON cart_items
  FOR SELECT USING (auth.uid() = user_id OR session_id IS NOT NULL);

CREATE POLICY "Users can insert their own cart items" ON cart_items
  FOR INSERT WITH CHECK (auth.uid() = user_id OR session_id IS NOT NULL);

CREATE POLICY "Users can update their own cart items" ON cart_items
  FOR UPDATE USING (auth.uid() = user_id OR session_id IS NOT NULL);

CREATE POLICY "Users can delete their own cart items" ON cart_items
  FOR DELETE USING (auth.uid() = user_id OR session_id IS NOT NULL);

-- Orders policies
CREATE POLICY "Users can view their own orders" ON orders
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = auth_user_id);

CREATE POLICY "Anyone can create orders" ON orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can manage all orders" ON orders
  FOR ALL USING (auth.role() = 'authenticated');

-- Order items policies  
CREATE POLICY "Users can view order items for their orders" ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders 
      WHERE orders.id = order_items.order_id 
      AND (orders.user_id = auth.uid() OR orders.auth_user_id = auth.uid())
    )
  );

CREATE POLICY "Authenticated users can manage order items" ON order_items
  FOR ALL USING (auth.role() = 'authenticated');

-- Customer addresses policies
CREATE POLICY "Users can view their own addresses" ON customer_addresses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own addresses" ON customer_addresses
  FOR ALL USING (auth.uid() = user_id);

-- Inventory policies
CREATE POLICY "Public can view inventory" ON inventory
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage inventory" ON inventory
  FOR ALL USING (auth.role() = 'authenticated');
;