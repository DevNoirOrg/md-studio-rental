import Image from "next/image";
import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { CONTACT, SCHOOL_URL } from "@/lib/site";
import { PRIVACY_URL } from "@/lib/privacy";

export default function SiteFooter() {
  return (
    <footer className="relative z-20 border-t border-black/5 bg-white px-5 pb-8 pt-14">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 text-center">
        <Image src="/brand/logo-md-black-trim.png" alt="MD Dance School" width={273} height={219} className="h-24 w-auto" />
        <ul className="space-y-3 text-base text-gray-900 sm:text-lg">
          <li className="flex items-center justify-center gap-2">
            <Mail size={18} className="text-[#087c81]" aria-hidden="true" />
            <a href={`mailto:${CONTACT.email}`} className="underline underline-offset-2 transition-colors hover:text-[#087c81]">{CONTACT.email}</a>
          </li>
          <li className="flex items-center justify-center gap-2">
            <Phone size={18} className="text-[#087c81]" aria-hidden="true" />
            <a href={CONTACT.phoneHref} className="underline underline-offset-2 transition-colors hover:text-[#087c81]">{CONTACT.phone}</a>
          </li>
          {CONTACT.studios.map((s) => (
            <li key={s.name} className="mx-auto flex max-w-xl items-start justify-center gap-2 leading-relaxed">
              <MapPin size={18} className="mt-1 shrink-0 text-[#087c81]" aria-hidden="true" />
              <span><strong>{s.name}:</strong> {s.address}</span>
            </li>
          ))}
        </ul>
        <div className="flex w-full flex-wrap justify-between gap-4 border-t border-black/5 pt-6 text-sm text-gray-600 sm:text-base">
          <Link href={PRIVACY_URL} className="transition-colors hover:text-black">Adatkezelési tájékoztató</Link>
          <a href={SCHOOL_URL} className="transition-colors hover:text-black">MD Dance School</a>
          <span>© {new Date().getFullYear()} MD Dance School</span>
        </div>
      </div>
    </footer>
  );
}
