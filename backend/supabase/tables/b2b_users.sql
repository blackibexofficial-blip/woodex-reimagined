CREATE TABLE b2b_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    company_id UUID NOT NULL,
    role VARCHAR(100) NOT NULL,
    department VARCHAR(255),
    approval_limit DECIMAL(15,2),
    can_approve_orders BOOLEAN DEFAULT false,
    can_place_orders BOOLEAN DEFAULT true,
    can_view_pricing BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);