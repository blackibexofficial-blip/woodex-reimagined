CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    variant_id UUID,
    quantity INTEGER DEFAULT 0,
    location TEXT,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);