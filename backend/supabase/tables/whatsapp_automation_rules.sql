CREATE TABLE whatsapp_automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('keyword',
    'schedule',
    'event')),
    trigger_value TEXT NOT NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('send_template',
    'create_lead',
    'assign_user',
    'add_tag')),
    action_config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);