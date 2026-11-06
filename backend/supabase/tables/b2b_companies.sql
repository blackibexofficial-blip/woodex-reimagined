CREATE TABLE b2b_companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name VARCHAR(255) NOT NULL,
    company_type VARCHAR(100),
    registration_number VARCHAR(255),
    tax_id VARCHAR(255),
    billing_address TEXT,
    shipping_address TEXT,
    credit_limit DECIMAL(15,2) DEFAULT 0,
    payment_terms VARCHAR(100) DEFAULT 'net_30',
    discount_tier VARCHAR(50) DEFAULT 'standard',
    contact_person VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);