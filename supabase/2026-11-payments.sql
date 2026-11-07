-- =====================================================================
--  Stúdióbérlés — online fizetés (Stripe) + számlázás (Billingo) + ügyfél-e-mailek
--
--  Új oszlopok a rental.studio_requests táblán (fizetési állapot, határidő,
--  számla), és az idősáv új állapota: 'expired' (lejárt fizetési határidő).
--
--  NEM destruktív: csak oszlopot ad hozzá (add column if not exists) és a
--  check-kényszereket bővíti. Meglévő foglaláshoz nem nyúl, többször is
--  futtatható. Ugyanez benne van a supabase/studio-bookings.sql-ben is.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
--  Online fizetés (Stripe) és számlázás (Billingo) — egy igényhez egy fizetés
--  (az igény jóváhagyott időpontjai). Lásd lib/payment-flow.ts.
--    decision_notified_at — az ügyfél megkapta a döntésről szóló e-mailt
--    payment_status       — awaiting (fizetésre vár) / paid (fizetve) / expired (lejárt)
--    payment_due          — fizetési határidő (null = nincs határidő)
--    paid_via             — stripe / manual (az adminban kézzel fizetettnek jelölve)
--    invoice_*            — a Billingo számla állapota
--  Az idősáv új állapota: expired (a fizetési határidő lejárt, az időpont felszabadult).
-- ---------------------------------------------------------------------
alter table rental.studio_requests add column if not exists decision_notified_at timestamptz;
alter table rental.studio_requests add column if not exists payment_status text;
alter table rental.studio_requests add column if not exists payment_due timestamptz;
alter table rental.studio_requests add column if not exists payment_reminded_at timestamptz;
alter table rental.studio_requests add column if not exists stripe_session_id text;
alter table rental.studio_requests add column if not exists stripe_session_expires_at timestamptz;
alter table rental.studio_requests add column if not exists stripe_payment_intent text;
alter table rental.studio_requests add column if not exists paid_at timestamptz;
alter table rental.studio_requests add column if not exists paid_via text;
alter table rental.studio_requests add column if not exists paid_amount integer;
alter table rental.studio_requests add column if not exists billing jsonb;
alter table rental.studio_requests add column if not exists invoice_status text;
alter table rental.studio_requests add column if not exists invoice_id text;
alter table rental.studio_requests add column if not exists invoice_number text;
alter table rental.studio_requests add column if not exists invoice_error text;
alter table rental.studio_requests add column if not exists invoice_attempts integer not null default 0;
alter table rental.studio_requests add column if not exists invoice_claimed_at timestamptz;
alter table rental.studio_requests add column if not exists access_sent_at timestamptz;
alter table rental.studio_requests add column if not exists studio_paid_notified_at timestamptz;

alter table rental.studio_requests drop constraint if exists studio_requests_payment_status_check;
alter table rental.studio_requests add constraint studio_requests_payment_status_check
  check (payment_status is null or payment_status in ('awaiting', 'paid', 'expired'));
alter table rental.studio_requests drop constraint if exists studio_requests_paid_via_check;
alter table rental.studio_requests add constraint studio_requests_paid_via_check
  check (paid_via is null or paid_via in ('stripe', 'manual'));
alter table rental.studio_requests drop constraint if exists studio_requests_invoice_status_check;
alter table rental.studio_requests add constraint studio_requests_invoice_status_check
  check (invoice_status is null or invoice_status in ('pending', 'issued', 'error', 'skipped'));
create index if not exists studio_requests_payment_open
  on rental.studio_requests(payment_status) where payment_status = 'awaiting';

-- az idősáv lehetséges állapotai (+ expired)
alter table rental.studio_slots drop constraint if exists studio_slots_status_check;
alter table rental.studio_slots add constraint studio_slots_status_check
  check (status in ('pending', 'approved', 'rejected', 'expired'));

commit;

-- Ellenőrzés futtatás után:
select column_name from information_schema.columns
where table_schema = 'rental' and table_name = 'studio_requests' order by ordinal_position;
