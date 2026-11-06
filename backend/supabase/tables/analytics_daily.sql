CREATE TABLE analytics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE UNIQUE NOT NULL,
    messages_sent INTEGER DEFAULT 0,
    messages_received INTEGER DEFAULT 0,
    leads_generated INTEGER DEFAULT 0,
    quotations_created INTEGER DEFAULT 0,
    quotations_accepted INTEGER DEFAULT 0,
    orders_created INTEGER DEFAULT 0,
    revenue DECIMAL(12,2) DEFAULT 0,
    active_users INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);