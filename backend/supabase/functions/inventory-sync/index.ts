Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    // Simple fetch-based Supabase client
    const supabaseClient = {
      from: (table: string) => ({
        select: async (columns: string) => {
          const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${columns}`, {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
            },
          });
          const data = await response.json();
          return { data, error: response.ok ? null : data };
        },
        update: async (updates: any) => ({
          eq: async (column: string, value: any) => {
            const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${column}=eq.${value}`, {
              method: 'PATCH',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify(updates),
            });
            return { error: response.ok ? null : await response.json() };
          },
        }),
      }),
    };

    // Fetch all products
    const { data: products, error: productsError } = await supabaseClient
      .from('products')
      .select('id,name,sku');

    if (productsError) throw productsError;

    // Fetch inventory data
    const { data: inventory, error: inventoryError } = await supabaseClient
      .from('inventory')
      .select('product_id,quantity,reserved_quantity');

    if (inventoryError) throw inventoryError;

    // Create inventory map
    const inventoryMap = new Map();
    if (inventory) {
      inventory.forEach((item: any) => {
        inventoryMap.set(item.product_id, {
          available: item.quantity - (item.reserved_quantity || 0),
          total: item.quantity,
          reserved: item.reserved_quantity || 0,
        });
      });
    }

    // Sync product stock status
    const updates = [];
    for (const product of products || []) {
      const inv = inventoryMap.get(product.id);
      let newStatus = 'out_of_stock';
      
      if (inv) {
        if (inv.available > 10) {
          newStatus = 'in_stock';
        } else if (inv.available > 0) {
          newStatus = 'low_stock';
        }
      }

      const { error: updateError } = await supabaseClient
        .from('products')
        .update({ stock_status: newStatus })
        .eq('id', product.id);

      if (!updateError) {
        updates.push({ product_id: product.id, status: newStatus });
      }
    }

    return new Response(
      JSON.stringify({ 
        data: { 
          message: 'Inventory sync completed', 
          updated: updates.length,
          details: updates 
        } 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
