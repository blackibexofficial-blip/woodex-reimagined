-- Migration: create_rls_policies
-- Created at: 1762423277

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

-- Profiles policies (users can view all, update own)
CREATE POLICY "Anyone can view profiles" ON profiles FOR SELECT USING (auth.role() IN ('anon', 'authenticated', 'service_role'));
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id OR auth.role() = 'service_role');
CREATE POLICY "Service role can insert profiles" ON profiles FOR INSERT WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- User permissions policies (only admins)
CREATE POLICY "Admins can manage permissions" ON user_permissions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') OR auth.role() = 'service_role'
);

-- Categories policies (all can view, editors+ can manage)
CREATE POLICY "Anyone can view active categories" ON categories FOR SELECT USING (is_active = TRUE OR auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Editors can manage categories" ON categories FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'editor')) OR auth.role() = 'service_role'
);

-- Products policies (all can view, editors+ can manage)
CREATE POLICY "Anyone can view active products" ON products FOR SELECT USING (is_active = TRUE OR auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Editors can manage products" ON products FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'editor')) OR auth.role() = 'service_role'
);

-- Product variants policies
CREATE POLICY "Anyone can view active variants" ON product_variants FOR SELECT USING (is_active = TRUE OR auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Editors can manage variants" ON product_variants FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'editor')) OR auth.role() = 'service_role'
);

-- Inventory policies (authenticated can view, editors+ can manage)
CREATE POLICY "Authenticated can view inventory" ON inventory FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Editors can manage inventory" ON inventory FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'editor')) OR auth.role() = 'service_role'
);

-- Customers policies (authenticated can view, editors+ can manage)
CREATE POLICY "Authenticated can view customers" ON customers FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Editors can manage customers" ON customers FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'editor')) OR auth.role() = 'service_role'
);

-- Customer interactions policies
CREATE POLICY "Authenticated can view interactions" ON customer_interactions FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Authenticated can create interactions" ON customer_interactions FOR INSERT WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- Quotations policies (authenticated can view own/all, editors+ can manage)
CREATE POLICY "Users can view quotations" ON quotations FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Editors can manage quotations" ON quotations FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'editor')) OR auth.role() = 'service_role'
);

-- Quotation items policies
CREATE POLICY "Users can view quotation items" ON quotation_items FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Editors can manage quotation items" ON quotation_items FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'editor')) OR auth.role() = 'service_role'
);

-- Orders policies
CREATE POLICY "Users can view orders" ON orders FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Editors can manage orders" ON orders FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'editor')) OR auth.role() = 'service_role'
);

-- Order items policies
CREATE POLICY "Users can view order items" ON order_items FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Editors can manage order items" ON order_items FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'editor')) OR auth.role() = 'service_role'
);

-- WhatsApp messages policies (for edge function integration)
CREATE POLICY "Service can manage messages" ON whatsapp_messages FOR ALL USING (auth.role() IN ('anon', 'authenticated', 'service_role'));

-- WhatsApp templates policies
CREATE POLICY "Users can view templates" ON whatsapp_templates FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Admins can manage templates" ON whatsapp_templates FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') OR auth.role() = 'service_role'
);

-- WhatsApp automation policies
CREATE POLICY "Admins can manage automation" ON whatsapp_automation_rules FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') OR auth.role() = 'service_role'
);

-- Analytics policies (authenticated can view)
CREATE POLICY "Users can view analytics" ON analytics_daily FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Service can update analytics" ON analytics_daily FOR ALL USING (auth.role() IN ('anon', 'authenticated', 'service_role'));

-- Activity log policies (authenticated can view own)
CREATE POLICY "Users can view own activity" ON user_activity_log FOR SELECT USING (user_id = auth.uid() OR auth.role() = 'service_role');
CREATE POLICY "Service can insert activity" ON user_activity_log FOR INSERT WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- Collaboration policies (authenticated users)
CREATE POLICY "Users can manage collaboration sessions" ON collaboration_sessions FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Users can manage presence" ON user_presence FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));

-- Media assets policies
CREATE POLICY "Anyone can view media" ON media_assets FOR SELECT USING (auth.role() IN ('anon', 'authenticated', 'service_role'));
CREATE POLICY "Authenticated can upload media" ON media_assets FOR INSERT WITH CHECK (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Users can delete own media" ON media_assets FOR DELETE USING (uploaded_by = auth.uid() OR auth.role() = 'service_role');
;