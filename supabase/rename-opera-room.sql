-- Egyszeri átnevezés: az Opera stúdió kisterme valójában KÖZEPES terem.
-- A kód (lib/studio-booking.ts) mostantól az "Opera - Közepes Terem" nevet használja,
-- ezért a már elmentett foglalásokat is át kell nevezni, különben a naptár nem
-- mutatná őket foglaltnak. Egyszer kell lefuttatni a Supabase SQL Editorban (a studio-bookings.sql UTÁN,
-- ami a táblákat a rental sémába teszi). Ha már korábban lefutott, nem árt újra.
begin;

update rental.studio_slots
   set room = 'Opera - Közepes Terem'
 where room = 'Opera - Kis Terem';

update rental.studio_slot_units
   set room = 'Opera - Közepes Terem'
 where room = 'Opera - Kis Terem';

commit;
