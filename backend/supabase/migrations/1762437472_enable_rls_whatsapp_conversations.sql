-- Migration: enable_rls_whatsapp_conversations
-- Created at: 1762437472


-- Enable RLS on whatsapp_conversations
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users and service role to view conversations
CREATE POLICY "Authenticated can view conversations" ON whatsapp_conversations
  FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role', 'anon'));

-- Allow admin/editor roles to manage conversations
CREATE POLICY "Admins can manage conversations" ON whatsapp_conversations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'editor')
    ) 
    OR auth.role() = 'service_role'
  );

-- Enable RLS on whatsapp_campaigns
ALTER TABLE whatsapp_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view campaigns" ON whatsapp_campaigns
  FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role', 'anon'));

CREATE POLICY "Admins can manage campaigns" ON whatsapp_campaigns
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'editor')
    ) 
    OR auth.role() = 'service_role'
  );

-- Enable RLS on whatsapp_analytics
ALTER TABLE whatsapp_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view analytics" ON whatsapp_analytics
  FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role', 'anon'));

CREATE POLICY "Admins can manage analytics" ON whatsapp_analytics
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'editor')
    ) 
    OR auth.role() = 'service_role'
  );

-- Enable RLS on customer_journey_events
ALTER TABLE customer_journey_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public to log journey events" ON customer_journey_events
  FOR INSERT
  WITH CHECK (auth.role() IN ('authenticated', 'service_role', 'anon'));

CREATE POLICY "Authenticated can view journey events" ON customer_journey_events
  FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role', 'anon'));

-- Enable RLS on whatsapp_appointments
ALTER TABLE whatsapp_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view appointments" ON whatsapp_appointments
  FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role', 'anon'));

CREATE POLICY "Admins can manage appointments" ON whatsapp_appointments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'editor')
    ) 
    OR auth.role() = 'service_role'
  );
;