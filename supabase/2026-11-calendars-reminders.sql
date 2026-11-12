-- =====================================================================
--  Stúdióbérlés — termenkénti Google Naptárak, időpont előtti emlékeztetők
--  (bejutási infók 24 órával előtte), „még nem rendezted” e-mail.
--
--  NEM destruktív: új oszlopok (add column if not exists), új tábla
--  (create table if not exists), a törlési trigger függvényének frissítése.
--  Többször is futtatható. Ugyanez benne van a supabase/studio-bookings.sql-ben.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
--  Termenkénti Google Naptárak + időpont előtti emlékeztetők (bejutási infók)
--    studio_slots.gcal_calendar_id   — melyik naptárba írtuk az eseményt (áthelyezéshez / törléshez)
--    gcal_deletions.calendar_id      — a törlendő esemény naptára
--    studio_requests.access_reminders_enabled — kap-e az ügyfél időpont előtti emlékeztetőt
--    studio_requests.payment_overdue_notified_at — kiment-e a „még nem rendezted” e-mail
--    rental.access_reminders         — foglalási naponként: kiment-e az emlékeztető (és benne a bejutási infó)
-- ---------------------------------------------------------------------
alter table rental.studio_slots add column if not exists gcal_calendar_id text;
alter table rental.gcal_deletions add column if not exists calendar_id text;
alter table rental.studio_requests add column if not exists access_reminders_enabled boolean not null default false;
alter table rental.studio_requests add column if not exists payment_overdue_notified_at timestamptz;

create or replace function rental.gcal_queue_deletion()
returns trigger language plpgsql security invoker set search_path = rental as $$
begin
  if old.status = 'approved' or old.gcal_synced_at is not null then
    insert into gcal_deletions(slot_id, room, calendar_id) values (old.id, old.room, old.gcal_calendar_id)
      on conflict (slot_id) do nothing;
  end if;
  return old;
end;
$$;
revoke all on function rental.gcal_queue_deletion() from public, anon, authenticated;

create table if not exists rental.access_reminders (
  request_id  uuid not null references rental.studio_requests(id) on delete cascade,
  day         date not null,
  with_access boolean not null default false,
  sent_at     timestamptz not null default now(),
  primary key (request_id, day)
);
alter table rental.access_reminders enable row level security;
revoke all on rental.access_reminders from anon, authenticated;
grant all on rental.access_reminders to service_role;

-- az online fizetős foglalások (fizetésre vár / fizetve) mostantól emlékeztetőt kapnak az időpont előtt
update rental.studio_requests set access_reminders_enabled = true
  where access_reminders_enabled = false and payment_status in ('awaiting', 'paid') and paid_via is distinct from 'manual';

commit;
