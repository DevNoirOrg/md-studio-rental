// Tesztekhez: a valódi lib/admin-auth.ts Supabase Auth-ot hív; itt egy egyszerű süti dönt.
export const adminCookie = "test_admin";
export const VALID = "ok";
export async function adminFromRequest(request: { cookies: { get(name: string): { value: string } | undefined } }) {
  return request.cookies.get(adminCookie)?.value === VALID ? { email: "admin@example.hu" } : null;
}
