CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    variant_name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    material TEXT,
    finish TEXT,
    color TEXT,
    price_adjustment DECIMAL(12,2) DEFAULT 0,
    images JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);