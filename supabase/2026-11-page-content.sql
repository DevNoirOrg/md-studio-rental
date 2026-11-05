-- =====================================================================
--  Stúdióbérlés — a foglalóoldal szövegei az adminból (admin → Szövegek)
--
--  Új tábla: rental.settings (kulcs → jsonb). A 'page' sorban vannak az
--  óratípus-kártyák és a naptár alatti tájékoztató szövegei, magyarul és
--  angolul. Amíg nincs sor, az oldal a kódban lévő alapértékeket mutatja.
--
--  NEM destruktív: csak létrehoz (create table if not exists), meglévő
--  adathoz nem nyúl. Többször is futtatható.
-- =====================================================================
begin;

create table if not exists rental.settings (
  key        text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz,
  updated_by text
);
alter table rental.settings enable row level security;
revoke all on rental.settings from anon, authenticated;
grant all on rental.settings to service_role;

commit;

-- Ellenőrzés futtatás után:
select key, updated_at, updated_by from rental.settings;
