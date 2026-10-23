-- Egyszeri átnevezés: az Opera stúdió kisterme valójában KÖZEPES terem.
-- A kód (lib/studio-booking.js) mostantól az "Opera - Közepes Terem" nevet használja,
-- ezért a már elmentett foglalásokat is át kell nevezni, különben a naptár nem
-- mutatná őket foglaltnak. Egyszer kell lefuttatni a Supabase SQL Editorban.
begin;

update public.studio_slots
   set room = 'Opera - Közepes Terem'
 where room = 'Opera - Kis Terem';

update public.studio_slot_units
   set room = 'Opera - Közepes Terem'
 where room = 'Opera - Kis Terem';

commit;
