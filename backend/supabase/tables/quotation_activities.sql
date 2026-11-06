CREATE TABLE quotation_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID NOT NULL,
    activity_type VARCHAR(50) NOT NULL,
    description TEXT,
    metadata JSONB,
    user_id UUID,
    user_name VARCHAR(255),
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);