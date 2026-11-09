-- Raw settings can include arbitrary keys and are owner-only. Preserve the
-- existing owner write policy and rows. Staff get a typed, allowlisted store
-- projection for existing document and CRM workflows; this is not public API.
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select to authenticated
  using (public.my_role() = 'owner');

create function public.staff_store_settings()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare
  v_store jsonb;
  v_safe jsonb;
  v_team jsonb;
begin
  if auth.uid() is null or not (
    public.has_cap('page.manage') or public.has_cap('crm.manage') or public.has_cap('finance.manage')
  ) then
    raise exception 'not authorized to read store settings' using errcode = '42501';
  end if;
  select value into v_store from public.app_settings where key = 'store';
  if not found then return '{}'::jsonb; end if;
  if jsonb_typeof(v_store) is distinct from 'object' then
    raise exception 'store settings must be an object' using errcode = '22023';
  end if;
  -- Owner needs the entire existing blob so saving does not strip unknown keys.
  if public.my_role() = 'owner' then return v_store; end if;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_safe
    from jsonb_each(v_store)
   where (key in ('storeName','tagline','phone','whatsapp','email','address','city',
                  'currency','deliveryNote','storeLogo') and jsonb_typeof(value) = 'string')
      or (key = 'taxRate' and jsonb_typeof(value) = 'number');
  -- Lead roster and draft preference are used by CRM staff, not all employees.
  if public.has_cap('crm.manage') then
    if jsonb_typeof(v_store->'team') = 'array' then
      select coalesce(jsonb_agg(item order by ord), '[]'::jsonb) into v_team
        from jsonb_array_elements(v_store->'team') with ordinality as t(item,ord)
       where jsonb_typeof(item) = 'string';
      v_safe := v_safe || jsonb_build_object('team', v_team);
    end if;
    if jsonb_typeof(v_store->'aiOfflineDraftsEnabled') = 'boolean' then
      v_safe := v_safe || jsonb_build_object('aiOfflineDraftsEnabled', v_store->'aiOfflineDraftsEnabled');
    end if;
  end if;
  return v_safe;
end $$;
revoke execute on function public.staff_store_settings() from public, anon;
grant execute on function public.staff_store_settings() to authenticated;

-- Update only recognized UI fields and preserve all unknown existing data even
-- when the caller previously read a partial projection. Serialize concurrent
-- writers to the row. Known fields can still conflict (last writer wins).
create function public.owner_save_store_settings(p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_store jsonb;
  entry record;
  field_type text;
begin
  if auth.uid() is null or public.my_role() <> 'owner' then
    raise exception 'only the owner may save store settings' using errcode = '42501';
  end if;
  if jsonb_typeof(p_settings) is distinct from 'object' then
    raise exception 'store settings must be an object' using errcode = '22023';
  end if;
  insert into public.app_settings(key,value) values ('store','{}'::jsonb) on conflict (key) do nothing;
  select value into v_store from public.app_settings where key='store' for update;
  if jsonb_typeof(v_store) is distinct from 'object' then
    raise exception 'stored settings must be an object' using errcode = '22023';
  end if;
  for entry in select key,value from jsonb_each(p_settings) loop
    if entry.key not in ('storeName','tagline','phone','whatsapp','email','address','city','currency',
                         'deliveryNote','storeLogo','taxRate','team','aiOfflineDraftsEnabled') then
      continue;
    end if;
    field_type := jsonb_typeof(entry.value);
    if entry.key = 'storeLogo' and field_type = 'null' then
      v_store := v_store - 'storeLogo';
      continue;
    elsif entry.key = 'team' then
      if field_type <> 'array' then raise exception 'invalid team setting' using errcode='22023'; end if;
      if exists (select 1 from jsonb_array_elements(entry.value) element where jsonb_typeof(element) <> 'string') then
        raise exception 'invalid team member' using errcode='22023';
      end if;
    elsif entry.key = 'taxRate' then
      if field_type <> 'number' then raise exception 'invalid taxRate setting' using errcode='22023'; end if;
    elsif entry.key = 'aiOfflineDraftsEnabled' then
      if field_type <> 'boolean' then raise exception 'invalid draft setting' using errcode='22023'; end if;
    elsif field_type <> 'string' then
      raise exception 'invalid store setting %', entry.key using errcode='22023';
    end if;
    v_store := v_store || jsonb_build_object(entry.key, entry.value);
  end loop;
  update public.app_settings set value = v_store, updated_at = now() where key='store';
  return v_store;
end $$;
revoke execute on function public.owner_save_store_settings(jsonb) from public, anon;
grant execute on function public.owner_save_store_settings(jsonb) to authenticated;
