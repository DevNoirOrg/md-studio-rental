-- Új és meglévő adatbázison is futtatható; a foglalásokat megtartja.
begin;

create table if not exists public.studio_requests (
  id uuid primary key default gen_random_uuid(),
  customer jsonb not null,
  lesson_type text not null check (lesson_type in ('privat', 'kiscsoportos', 'csoportos')),
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.studio_slots (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.studio_requests(id) on delete cascade,
  room text not null,
  date date not null,
  hour numeric(3,1) not null,
  duration_minutes integer not null default 60,
  price integer not null check (price > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_at timestamptz
);

lock table public.studio_slots in access exclusive mode;
drop trigger if exists studio_slot_units_sync on public.studio_slots;
alter table public.studio_slots add column if not exists duration_minutes integer not null default 60;
alter table public.studio_slots drop constraint if exists studio_slots_hour_check;
alter table public.studio_slots alter column hour type numeric(3,1);
alter table public.studio_slots drop constraint if exists studio_slots_interval_check;
alter table public.studio_slots add constraint studio_slots_interval_check check (
  hour >= 8 and hour * 2 = trunc(hour * 2) and
  duration_minutes >= 60 and duration_minutes % 30 = 0 and
  hour * 60 + duration_minutes <= 1320
);

-- Egy idősávot egyszerre csak egy aktív igény vagy foglalás tarthat fenn.
create unique index if not exists studio_slots_active_unique
  on public.studio_slots(room, date, hour) where status in ('pending', 'approved');

alter table public.studio_requests enable row level security;
alter table public.studio_slots enable row level security;
revoke all on public.studio_requests, public.studio_slots from anon, authenticated;
grant all on public.studio_requests, public.studio_slots to service_role;

-- A félórás egységek egyedi kulcsa eltérő kezdésnél is kizárja az átfedést.
create table if not exists public.studio_slot_units (
  slot_id uuid not null references public.studio_slots(id) on delete cascade,
  room text not null,
  date date not null,
  minute integer not null,
  primary key (room, date, minute)
);
alter table public.studio_slot_units enable row level security;
revoke all on public.studio_slot_units from anon, authenticated;
grant all on public.studio_slot_units to service_role;

delete from public.studio_slot_units;
insert into public.studio_slot_units(slot_id, room, date, minute)
  select id, room, date, generate_series((hour * 60)::integer,
    (hour * 60)::integer + duration_minutes - 30, 30)
  from public.studio_slots where status in ('pending', 'approved');

create or replace function public.sync_studio_slot_units()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  delete from studio_slot_units where slot_id = new.id;
  if new.status in ('pending', 'approved') then
    insert into studio_slot_units(slot_id, room, date, minute)
      select new.id, new.room, new.date, generate_series((new.hour * 60)::integer,
        (new.hour * 60)::integer + new.duration_minutes - 30, 30);
  end if;
  return new;
end;
$$;
create trigger studio_slot_units_sync after insert or update of room, date, hour, duration_minutes, status
  on public.studio_slots for each row execute function public.sync_studio_slot_units();
revoke all on function public.sync_studio_slot_units() from public, anon, authenticated;
grant execute on function public.sync_studio_slot_units() to service_role;

create or replace function public.create_studio_request(p_customer jsonb, p_lesson_type text, p_token_hash text, p_slots jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_request_id uuid;
  result jsonb;
begin
  insert into studio_requests(customer, lesson_type, token_hash)
    values (p_customer, p_lesson_type, p_token_hash) returning id into v_request_id;
  insert into studio_slots(request_id, room, date, hour, duration_minutes, price)
    select v_request_id, item->>'room', (item->>'date')::date,
      (item->>'hour')::numeric, coalesce((item->>'durationMinutes')::integer, 60),
      (item->>'price')::integer from jsonb_array_elements(p_slots) as item
    order by item->>'date', item->>'room', (item->>'hour')::numeric;
  select jsonb_build_object('id', v_request_id, 'slots', jsonb_agg(
    jsonb_build_object('id', id, 'room', room, 'date', date, 'hour', hour,
      'durationMinutes', duration_minutes, 'price', price, 'status', status)
    order by date, hour, room
  )) into result from studio_slots where studio_slots.request_id = v_request_id;
  return result;
end;
$$;

-- A kérés zárolása sorba rendezi az egyedi és az összesített döntéseket.
-- Végleges döntést egy régi vagy ismételt kattintás nem írhat felül.
create or replace function public.decide_studio_request(p_token_hash text, p_action text, p_slot_id uuid default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  target_id uuid;
  changed integer;
begin
  if p_action not in ('approve', 'reject', 'approve-all') or
     (p_action <> 'approve-all' and p_slot_id is null) then
    raise exception 'Invalid decision';
  end if;
  select id into target_id from studio_requests where token_hash = p_token_hash for update;
  if target_id is null then return null; end if;
  if p_action <> 'approve-all' and not exists (
    select 1 from studio_slots where request_id = target_id and id = p_slot_id
  ) then return null; end if;
  update studio_slots
    set status = case when p_action = 'reject' then 'rejected' else 'approved' end,
        decided_at = now()
    where request_id = target_id and status = 'pending'
      and (p_action = 'approve-all' or id = p_slot_id);
  get diagnostics changed = row_count;
  return jsonb_build_object('changed', changed);
end;
$$;

revoke all on function public.create_studio_request(jsonb, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.decide_studio_request(text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_studio_request(jsonb, text, text, jsonb) to service_role;
grant execute on function public.decide_studio_request(text, text, uuid) to service_role;

create or replace function public.create_admin_studio_request(
  p_customer jsonb, p_lesson_type text, p_token_hash text, p_slots jsonb
)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  result jsonb;
begin
  result := create_studio_request(p_customer, p_lesson_type, p_token_hash, p_slots);
  perform decide_studio_request(p_token_hash, 'approve-all', null);
  return jsonb_build_object('id', result->'id');
end;
$$;
revoke all on function public.create_admin_studio_request(jsonb, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_admin_studio_request(jsonb, text, text, jsonb) to service_role;

commit;
