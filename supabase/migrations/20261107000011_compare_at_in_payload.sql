-- 20261107000011_compare_at_in_payload — let merchandising "compare-at strikethrough"
-- ride the document RPC like the rest of the catalogue payload.
--
-- Context: product_update_payload (0002) rejects any patch touching
-- price/compareAtPrice/stock/inStock/sku on the doctrine "money rides the
-- product_update ledger RPC only". But compareAtPrice ISN'T the sale price —
-- it's merchandising metadata next to isBestSeller/brandId/stockStatus, which
-- all merge through the document path happily. The result was a latent
-- hosted-runtime bug: admin Bulk Editor actions pricePct(includeCompareAt),
-- markOnSale and clearSale called product_update_payload with
-- {compareAtPrice: ...} and would have thrown
-- 'price/inStock/sku changes must go through product_update' on the hosted DB
-- on every invocation (demo mode was unaffected, so local gates stayed green).
-- The fix keeps the ledger doctrine intact (price/stock/inStock/sku remain
-- rejected) and admits exactly one new key, validated: non-negative number
-- or JSON null (null clears the strikethrough). Demo adapter parity: it
-- treats compareAtPrice as a plain field already.
-- NOT rehearsed on hosted infra; rehearsed under pglite (test:rehearsal).

create or replace function public.product_update_payload(p_id text, p_patch jsonb)
returns public.products language plpgsql security definer set search_path = public as $$
declare p_row public.products;
begin
  perform public.require_cap('catalog.manage');
  if p_patch is null then p_patch := '{}'::jsonb; end if;

  -- ledger keys remain RPC-only; compare-at is deliberately NOT in this set.
  if p_patch ? 'price' or p_patch ? 'stock' or p_patch ? 'stock_qty'
     or p_patch ? 'inStock' or p_patch ? 'sku' then
    raise exception 'price/stock/inStock/sku changes must go through product_update';
  end if;

  -- tariff guard: strikethrough must be a real amount or an explicit null.
  if p_patch ? 'compareAtPrice'
     and p_patch->'compareAtPrice' is not null
     and p_patch->'compareAtPrice' <> 'null'::jsonb then
    if jsonb_typeof(p_patch->'compareAtPrice') <> 'number'
       or (p_patch->>'compareAtPrice')::numeric < 0 then
      raise exception 'compareAtPrice must be a non-negative number or null (clear)';
    end if;
  end if;

  update public.products
     set payload = coalesce(payload, '{}'::jsonb) || p_patch,
         series_id = case when p_patch ? 'seriesId' then nullif(p_patch->>'seriesId','') else series_id end,
         category_id = case when p_patch ? 'category' then nullif(p_patch->>'category','') else category_id end,
         updated_at = now()
   where id = p_id returning * into p_row;
  if not found then raise exception 'product % not found', p_id; end if;
  return p_row;
end $$;
