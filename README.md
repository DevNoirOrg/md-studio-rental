# MD Dance School – Stúdió bérlés

Standalone studio-rental site of MD Dance School (moved out of the `md-dance-school` repo).
Stack: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4, motion, lucide-react.

| Route | Purpose |
| --- | --- |
| `/` | Room cards, lesson type, calendar and booking request |
| `/dontes` | Confirmation page behind the approve/reject links in notification emails |
| `/admin` | Admin login + booking calendar (create, reschedule, delete) |
| `/adatkezeles` | Privacy policy (sample text, must be finalised) |
| `/api/studio-bookings` | Public availability (GET) and booking request (POST) |
| `/api/studio-bookings/decision` | Email decision (POST) |
| `/admin/api/bookings` | Session-protected admin API |

## Local preview

```bash
npm ci
cp .env.example .env.local   # fill in the values
npm run dev
```

Open http://localhost:3000. Other scripts: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Moving from md-dance-school

- Uses the **same Supabase project and tables** and the **same Resend account** as before; no data migration is needed.
- Set `APP_BASE_URL` to this site's public URL, so new emails link to `/dontes` here.
- `NEXT_PUBLIC_SCHOOL_URL` is the "back to MD Dance School" link in the header/footer.
- The school site redirects `/studio-berles` → this site and `/studio-berles/dontes?…` → `/dontes?…`
  (set `NEXT_PUBLIC_STUDIO_RENTAL_URL` there), so links in emails sent before the move keep working.
- Admin credentials (`ADMIN_*`) move here; the school site no longer has an `/admin` page.

## Booking notifications with Resend

1. Create a Resend account and verify a sender domain.
2. Create an API key with permission to send emails.
3. Copy `.env.example` to `.env.local` and set:
   - `RESEND_API_KEY`: your private Resend API key.
   - `RESEND_FROM_EMAIL`: a verified sender, e.g. `MD Dance School <booking@your-domain.hu>`.
   - `BOOKING_NOTIFICATION_EMAIL`: the recipient of booking notifications.
4. Restart the development server. In deployment, set the same server-side environment variables and redeploy.
5. Submit a booking request to test delivery, then check the Resend delivery log and the recipient's inbox/spam folder.

Never commit `.env.local`, share the API key in chat, or prefix it with `NEXT_PUBLIC_`.
Notifications go to `BOOKING_NOTIFICATION_EMAIL`; the customer's address is the reply-to address.
Missing or invalid recipient configuration prevents submission before a booking is saved.
Both HTML and plain-text notifications include the selected lesson type, contact details, individual slots and total price.
Resend's test sender can only send to the account owner's address; use a verified domain for production.

The API validates contact details and slots, and calculates prices from the shared room data.
Success means Resend accepted the email, not that delivery or approval has completed.
Availability is based exclusively on bookings stored in Supabase; no demo occupied slots remain.
The calendar refreshes pending and approved bookings every 10 seconds and when the window gains focus.
Pending slots are yellow. Email-approved slots are blue ("Foglalás alatt") and remain unavailable
for new requests, but are not final bookings yet. The database status stays `approved`;
no additional completion step is implemented yet. Past slots are gray and cannot be selected.
Rejected slots become available again.
The database prevents overlapping active requests, even when two users submit simultaneously.

## Supabase setup and email decisions

1. Create a Supabase project.
2. Run `supabase/studio-bookings.sql` in its SQL Editor (and `supabase/rename-opera-room.sql` once,
   if the database still contains the old „Opera - Kis Terem” name), for both new and existing databases.
   This single script can be rerun safely. It preserves legacy bookings as 60-minute intervals,
   keeps the duration of newer bookings, and adds atomic overlap protection for every occupied half hour.
3. Add these server-only settings to `.env.local`:
   - `SUPABASE_URL`: your project's URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: the project's service-role key. Never use this key in client code or commit it.
   - `APP_BASE_URL`: `http://localhost:3000` locally; the public HTTPS URL of **this rental site** in production
     (decision links point to `${APP_BASE_URL}/dontes`).
4. Restart the preview. Set the same settings on the deployed server.

Email links contain an unguessable decision token; only its SHA-256 hash is stored.
Do not forward these links: possession grants permission to decide that request.
Opening a link does not change any booking. The destination requires an explicit confirmation via POST,
preventing mail link scanners from accidentally changing statuses.
Individual approval/rejection changes only a pending slot. Approve-all approves only pending slots,
and does not override rejected or already approved ones. Repeated clicks are harmless.
Older emails sent before this feature do not have working decision links; submit a new request to test it.
Localhost links work only on the machine running the preview; a public URL is required for other devices.
Public availability responses contain no customer data or tokens; RLS restricts direct table access.
If Resend explicitly rejects sending, the saved request is removed and its slots released.
If sending times out or its result is uncertain, the request stays pending to prevent double booking;
check Resend and the Supabase records before retrying. Such requests can be resolved by the studio
in Supabase if no notification arrives.
Before a public production launch, add abuse protection/rate limiting and define retention for customer data.

Do not run `npm run build` while `next dev` is running: both use `.next`.

## Admin login

Visit `/admin` to sign in. Set server-only `ADMIN_USERNAME` and `ADMIN_PASSWORD` in
`.env.local` (and in the hosting provider's environment for deployment). No credentials
are embedded in client code. After login, a day/week/month calendar shows the four rooms'
pending and approved bookings using a session-protected `/admin/api/bookings` endpoint.
Click a booking to open a right-hand details panel (full-width on mobile) with its interval,
lesson type, price, status and customer contact details. Close with X, Escape, or a click
outside the panel. Outside controls remain usable, including selecting a different booking.
The public availability endpoint still excludes customer data, IDs and decision tokens.
It refreshes every 10 seconds and on focus and supports past/future dates.
Month cells summarize pending and approved bookings and open the selected day's timeline.
Day/week grids remain mounted during date-range loading to preserve the page's scroll position;
selection is disabled until the new range loads, and old-range bookings are hidden.
Admins can select future intervals, extend them in half-hour steps, choose a lesson type,
and enter customer contact details. Clicking a selected admin interval again removes it;
the customer calendar keeps its X removal control. Lesson types are chosen with cards alongside
the contact form; the group card is disabled if a selected interval is outside Astoria - Nagy Terem.
Saving uses the session-protected, same-origin POST endpoint
and the `create_admin_studio_request` RPC to atomically create approved (“Foglalás alatt”)
slots without sending email. Prices and overlaps are validated server-side; group lessons
remain restricted to Astoria - Nagy Terem. Pending and approved intervals can be permanently deleted from the details panel after
confirmation. Only the chosen slot is removed; other slots and the parent request are retained.
Deletion releases its half-hour occupancy units, sends no email, and requires an authenticated
same-origin DELETE request. No additional SQL migration is required for deletion.
Pending and approved intervals can also be rescheduled by clicking “Időpont módosítása” in
the details panel, then choosing a new start directly on the calendar and confirming the save.
The rescheduling controls appear below the calendar, in the same area as the new-booking form.
The panel closes to expose the calendar; room switching is locked, but day/week/month navigation
remains available. The mouse/keyboard preview uses the original duration: turquoise means the
whole interval fits; red means overlap, past time, or a finish after 22:00, and cannot be selected.
Touch users select a valid start by tapping. The original booking is excluded from conflict checks,
so a partially overlapping move of the same booking is allowed. Cancel leaves it unchanged.
The authenticated, same-origin PATCH endpoint changes only
the date and start time: room, duration, price, status and customer data are preserved.
Only future intervals within 08:00–22:00 are allowed. Existing occupancy triggers atomically
release the old time and reserve the new one; overlaps roll back the entire update, preserving
the original booking. Conditional updates detect concurrent rescheduling or deletion.
After saving, the calendar opens the new date. No email is sent and no additional SQL is needed.
Run the updated `supabase/studio-bookings.sql` before using admin creation; it adds this RPC
without deleting bookings. The customer booking/email approval flow remains unchanged.

Production also requires a random `ADMIN_SESSION_SECRET` (generate with
`openssl rand -hex 32`). Development uses an ephemeral signing key, so restarting the
server invalidates local sessions. Sessions expire after eight hours and use an HttpOnly,
SameSite cookie, with Secure enabled in production. Changing credentials invalidates sessions.
Use strong credentials instead of the local test pair before public deployment, and add
rate limiting before exposing this test admin login publicly.
Future admin pages and APIs must verify the session server-side before returning protected data.

`npm test` also covers credential and session validation (`tests/admin-auth.test.ts`).

## Calendar interval selection

After choosing a lesson type, customers choose from four room cards before the calendar appears.
Group lessons can select only Astoria - Nagy Terem; the other cards remain visible but disabled.
Changing rooms preserves selected intervals; changing lesson types starts a new selection.
Choosing a room scrolls to the current local half-hour row between 08:00 and 22:00,
or to 08:00 outside opening hours. In monthly view it scrolls to the calendar instead.

Daily and weekly views use a continuous half-hour grid from 08:00 to 22:00.
Hover previews one hour with a translucent highlight; click selects it.
Preview and selected blocks have no visible time-range or price labels, keeping the underlying
calendar times readable. Selected intervals and prices remain in the booking summary.
Click the selection's upper arrow to start 30 minutes earlier, or its lower arrow to end
30 minutes later (minimum 60 minutes). The arrows support standard keyboard button activation.
Dragging does not extend selections. Selected blocks can be clicked to remove them.
Starts must allow at least a full hour before closing. Stored or selected intervals may not overlap;
adjacent intervals are allowed. Prices are proportional to duration, including half hours.
Monthly availability counts valid one-hour starting times, not independent bookable hours.
The API and notification emails include the complete interval and its calculated price.
Run the updated SQL script before using the updated app; without it availability fails explicitly.

## Booking tests

Run `npm test` (Node.js 22.6+; the tests run the TypeScript sources directly with `--experimental-strip-types`).
The API tests use an in-memory PostgreSQL engine (PGlite) to execute the actual SQL schema and
transactions, while mocking Supabase's HTTP interface and Resend. They do not send real emails
or change the configured Supabase database.
