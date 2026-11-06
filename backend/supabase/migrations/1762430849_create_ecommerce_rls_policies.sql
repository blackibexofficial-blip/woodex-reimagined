-- Migration: create_ecommerce_rls_policies
-- Created at: 1762430849

-- Room Packages RLS Policies
ALTER TABLE room_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Room packages are viewable by everyone" ON room_packages FOR SELECT USING (is_active = true);
CREATE POLICY "Room packages are editable by admins" ON room_packages FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Pricing Rules RLS Policies  
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pricing rules viewable by authenticated users" ON pricing_rules FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Pricing rules editable by admins" ON pricing_rules FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- B2B Companies RLS Policies
ALTER TABLE b2b_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Companies viewable by their users" ON b2b_companies FOR SELECT TO authenticated USING (
  id IN (SELECT company_id FROM b2b_users WHERE user_id = auth.uid())
);
CREATE POLICY "Companies editable by admins" ON b2b_companies FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- B2B Users RLS Policies
ALTER TABLE b2b_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "B2B users can view own record" ON b2b_users FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "B2B users editable by admins" ON b2b_users FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Virtual Rooms RLS Policies
ALTER TABLE virtual_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public virtual rooms viewable by all" ON virtual_rooms FOR SELECT USING (is_public = true);
CREATE POLICY "Users can view own virtual rooms" ON virtual_rooms FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can manage own virtual rooms" ON virtual_rooms FOR ALL TO authenticated USING (user_id = auth.uid());;