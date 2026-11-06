CREATE TABLE whatsapp_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    whatsapp_number VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    last_message_at TIMESTAMP WITH TIME ZONE,
    total_messages INTEGER DEFAULT 0,
    lead_score INTEGER DEFAULT 0,
    customer_stage VARCHAR(20),
    assigned_to UUID REFERENCES admin_users(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);