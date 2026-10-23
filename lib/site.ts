// Közös oldaladatok (fejléc, lábléc).
export const SCHOOL_URL = (process.env.NEXT_PUBLIC_SCHOOL_URL || "https://www.hiphoptanciskola.com").replace(/\/$/, "");

export const CONTACT = {
  email: "masterdancetanciskola@gmail.com",
  phone: "+36 (30) 633-6682",
  phoneHref: "tel:+36306336682",
  studios: [
    { name: "Astoria Stúdió", address: "1052 Budapest, Semmelweis u. 1–3., Magyarok Háza, 2. emelet (az Astoria metrómegállótól 3 perc séta)" },
  ],
} as const;
