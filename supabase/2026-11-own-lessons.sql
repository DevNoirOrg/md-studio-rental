-- Saját órák (ismétlődő saját foglalások). Nem destruktív, újrafuttatható.
-- Supabase → SQL Editor → futtasd le egyszer.
begin;

-- ---------------------------------------------------------------------
--  Saját órák (a stúdió saját, ismétlődő foglalásai — pl. félévre a táncórák)
--    rental.own_series — a sorozat: terem, napok (0 = hétfő … 6 = vasárnap), idősáv, időszak, szünetek
--    Az alkalmak sima, jóváhagyott studio_slots sorok egy saját igény (studio_requests) alatt
--    (customer.own = true, ár 0), így ugyanúgy foglalják a termet, a foglalóoldalon „foglalt”-ként
--    látszanak, és bekerülnek a terem Google naptárába. Egy alkalom törlése = felszabadítás.
-- ---------------------------------------------------------------------
create table if not exists rental.own_series (
  id               uuid primary key default gen_random_uuid(),
  request_id       uuid not null unique references rental.studio_requests(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 80),
  room             text not null,
  weekdays         smallint[] not null,
  hour             numeric(3,1) not null,
  duration_minutes integer not null,
  start_date       date not null,
  end_date         date not null,
  excluded         jsonb not null default '[]'::jsonb,
  skipped          jsonb not null default '[]'::jsonb,
  created_by       text,
  created_at       timestamptz not null default now()
);
alter table rental.own_series enable row level security;
revoke all on rental.own_series from anon, authenticated;
grant all on rental.own_series to service_role;

-- a saját órák ára 0 (eddig legalább 1 Ft kellett)
alter table rental.studio_slots drop constraint if exists studio_slots_price_check;
alter table rental.studio_slots add constraint studio_slots_price_check check (price >= 0);

-- Sorozat létrehozása: a foglalt (ütköző) alkalmakat kihagyja, és visszaadja a dátumukat.
create or replace function rental.create_own_series(
  p_name text, p_room text, p_weekdays smallint[], p_hour numeric, p_duration integer,
  p_start date, p_end date, p_excluded jsonb, p_created_by text
)
returns jsonb language plpgsql security invoker set search_path = rental as $$
declare
  v_request uuid;
  v_series uuid;
  v_day date;
  v_created integer := 0;
  v_skipped jsonb := '[]'::jsonb;
begin
  if p_end < p_start or p_end - p_start > 366 then raise exception 'Invalid period'; end if;
  insert into studio_requests(customer, lesson_type, token_hash)
    values (jsonb_build_object('name', p_name, 'email', '', 'phone', '', 'own', true), 'csoportos', 'own-' || gen_random_uuid()::text)
    returning id into v_request;
  for v_day in select generate_series(p_start, p_end, interval '1 day')::date loop
    continue when not ((extract(isodow from v_day)::int - 1) = any(p_weekdays));
    continue when exists (
      select 1 from jsonb_array_elements(coalesce(p_excluded, '[]'::jsonb)) as e
      where v_day between (e->>'from')::date and (e->>'to')::date
    );
    begin
      insert into studio_slots(request_id, room, date, hour, duration_minutes, price, status, decided_at)
        values (v_request, p_room, v_day, p_hour, p_duration, 0, 'approved', now());
      v_created := v_created + 1;
    exception when unique_violation then
      v_skipped := v_skipped || to_jsonb(v_day::text);
    end;
  end loop;
  insert into own_series(request_id, name, room, weekdays, hour, duration_minutes, start_date, end_date, excluded, skipped, created_by)
    values (v_request, p_name, p_room, p_weekdays, p_hour, p_duration, p_start, p_end, coalesce(p_excluded, '[]'::jsonb), v_skipped, p_created_by)
    returning id into v_series;
  update studio_requests set customer = customer || jsonb_build_object('seriesId', v_series) where id = v_request;
  return jsonb_build_object('id', v_series, 'created', v_created, 'skipped', v_skipped);
end;
$$;
revoke all on function rental.create_own_series(text, text, smallint[], numeric, integer, date, date, jsonb, text) from public, anon, authenticated;
grant execute on function rental.create_own_series(text, text, smallint[], numeric, integer, date, date, jsonb, text) to service_role;

commit;
