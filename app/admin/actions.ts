"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminCookie, checkAdminCredentials, createAdminSession, sessionLifetime } from "@/lib/admin-auth";

export async function loginAdmin(_previousState: { error?: string } | null, formData: FormData): Promise<{ error?: string } | null> {
  const username = formData.get("username");
  const password = formData.get("password");
  if (typeof username !== "string" || typeof password !== "string" ||
      !username || !password || username.length > 200 || password.length > 200) {
    return { error: "Add meg a felhasználónevet és a jelszót (legfeljebb 200 karakter)." };
  }
  let session: string;
  try {
    if (!checkAdminCredentials(username, password)) {
      return { error: "Hibás felhasználónév vagy jelszó." };
    }
    session = createAdminSession();
  } catch (caught) {
    console.error("Admin login failed.", { message: (caught as Error).message });
    return { error: "A bejelentkezés jelenleg nem elérhető. Ellenőrizd a szerver adminbeállításait." };
  }
  (await cookies()).set(adminCookie, session, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/admin", maxAge: sessionLifetime,
  });
  redirect("/admin");
}

export async function logoutAdmin() {
  (await cookies()).set(adminCookie, "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/admin", maxAge: 0,
  });
  redirect("/admin");
}
