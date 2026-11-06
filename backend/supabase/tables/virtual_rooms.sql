CREATE TABLE virtual_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    room_name VARCHAR(255) NOT NULL,
    room_type VARCHAR(100),
    dimensions JSONB,
    configuration_data JSONB NOT NULL,
    products_placed JSONB DEFAULT '[]',
    thumbnail_url TEXT,
    is_public BOOLEAN DEFAULT false,
    is_saved BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);