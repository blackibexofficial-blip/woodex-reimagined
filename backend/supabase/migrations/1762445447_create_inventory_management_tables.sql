-- Migration: create_inventory_management_tables
-- Created at: 1762445447

-- Create inventory table for stock tracking
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity_available INTEGER NOT NULL DEFAULT 0,
    quantity_reserved INTEGER NOT NULL DEFAULT 0,
    quantity_sold INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER DEFAULT 10,
    reorder_quantity INTEGER DEFAULT 50,
    last_stock_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    supplier_id UUID,
    warehouse_location TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(product_id)
);

-- Create delivery zones table for cost calculation
CREATE TABLE IF NOT EXISTS delivery_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_name TEXT NOT NULL,
    city TEXT NOT NULL,
    postal_codes TEXT[],
    base_delivery_cost NUMERIC(10,2) NOT NULL DEFAULT 2000,
    express_delivery_cost NUMERIC(10,2) NOT NULL DEFAULT 5000,
    same_day_delivery_cost NUMERIC(10,2) NOT NULL DEFAULT 8000,
    estimated_delivery_days INTEGER DEFAULT 3,
    express_delivery_days INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create deliveries table for delivery management
CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    delivery_type TEXT NOT NULL DEFAULT 'standard' CHECK (delivery_type IN ('standard', 'express', 'same_day')),
    delivery_zone_id UUID REFERENCES delivery_zones(id),
    tracking_number TEXT,
    courier_name TEXT,
    delivery_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned')),
    scheduled_date DATE,
    scheduled_time_slot TEXT,
    pickup_date TIMESTAMP WITH TIME ZONE,
    delivered_date TIMESTAMP WITH TIME ZONE,
    delivery_address JSONB NOT NULL,
    recipient_name TEXT,
    recipient_phone TEXT,
    delivery_instructions TEXT,
    proof_of_delivery_url TEXT,
    delivery_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create returns table for return processing
CREATE TABLE IF NOT EXISTS returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    order_item_id UUID,
    return_number TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    reason_category TEXT CHECK (reason_category IN ('defective', 'wrong_item', 'not_as_described', 'changed_mind', 'damaged', 'other')),
    status TEXT DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'picked_up', 'received', 'inspected', 'refunded', 'exchanged')),
    return_type TEXT DEFAULT 'refund' CHECK (return_type IN ('refund', 'exchange', 'store_credit')),
    refund_amount NUMERIC(10,2),
    exchange_product_id UUID REFERENCES products(id),
    customer_notes TEXT,
    admin_notes TEXT,
    inspection_notes TEXT,
    images TEXT[],
    pickup_scheduled_date DATE,
    pickup_tracking_number TEXT,
    received_date TIMESTAMP WITH TIME ZONE,
    approved_date TIMESTAMP WITH TIME ZONE,
    refunded_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create order status history table
CREATE TABLE IF NOT EXISTS order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_by UUID REFERENCES profiles(id),
    change_reason TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create stock movements table for inventory tracking
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id),
    movement_type TEXT NOT NULL CHECK (movement_type IN ('inbound', 'outbound', 'adjustment', 'return', 'damage')),
    quantity INTEGER NOT NULL,
    reference_id UUID,
    reference_type TEXT,
    notes TEXT,
    performed_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_returns_order_id ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);

-- Add RLS policies
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- Public can view inventory (for stock availability)
CREATE POLICY "Public can view inventory" ON inventory
FOR SELECT USING (true);

-- Public can view delivery zones
CREATE POLICY "Public can view delivery zones" ON delivery_zones
FOR SELECT USING (is_active = true);

-- Customers can view their own deliveries
CREATE POLICY "Customers can view own deliveries" ON deliveries
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM orders 
        WHERE orders.id = deliveries.order_id 
        AND (orders.user_id = auth.uid() OR orders.auth_user_id = auth.uid())
    )
);

-- Customers can create return requests
CREATE POLICY "Customers can create returns" ON returns
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM orders 
        WHERE orders.id = returns.order_id 
        AND (orders.user_id = auth.uid() OR orders.auth_user_id = auth.uid())
    )
);

-- Customers can view their own returns
CREATE POLICY "Customers can view own returns" ON returns
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM orders 
        WHERE orders.id = returns.order_id 
        AND (orders.user_id = auth.uid() OR orders.auth_user_id = auth.uid())
    )
);

-- Admins can manage all tables
CREATE POLICY "Admins can manage inventory" ON inventory
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = ANY(ARRAY['admin', 'editor'])
    )
);

CREATE POLICY "Admins can manage deliveries" ON deliveries
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = ANY(ARRAY['admin', 'editor'])
    )
);

CREATE POLICY "Admins can manage returns" ON returns
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = ANY(ARRAY['admin', 'editor'])
    )
);

CREATE POLICY "Admins can manage delivery zones" ON delivery_zones
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = ANY(ARRAY['admin', 'editor'])
    )
);

CREATE POLICY "Public can view order status history" ON order_status_history
FOR SELECT USING (true);

CREATE POLICY "Admins can manage stock movements" ON stock_movements
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = ANY(ARRAY['admin', 'editor'])
    )
);;