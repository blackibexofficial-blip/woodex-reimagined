CREATE TABLE customer_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    interaction_type TEXT NOT NULL CHECK (interaction_type IN ('call',
    'email',
    'whatsapp',
    'meeting',
    'note')),
    subject TEXT,
    content TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);