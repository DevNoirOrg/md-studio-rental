import { roomPrices, type Room } from "./studio-booking.ts";

export interface RoomDetails {
  location: string;
  name: string;
  image: string;
  area: number;
  length: number;
  width: number;
  height: number;
  capacity: number;
  ac: boolean;
  sound: string;
  mirror: string;
  floor: string;
  light: string;
  extras: string[];
  description: string;
}

// A termek bemutató adatai (Stúdió bérlés oldal: kártyák + részletes modal).
// FIGYELEM: a képek és az adatok egyelőre HELYŐRZŐK — a valódi fotókra és
// méretekre cserélendők. A kulcs a lib/studio-booking.js `rooms` listájának neve.
export const roomDetails: Record<Room, RoomDetails> = {
  "Astoria - Nagy Terem": {
    location: "Astoria stúdió",
    name: "Nagy Terem",
    image: "/rooms/astoria-nagy-foto.jpg",
    area: 120,
    length: 15,
    width: 8,
    height: 3.5,
    capacity: 36,
    ac: true,
    sound: "2 × 1000 W aktív hangfal, keverő, Bluetooth és jack csatlakozás",
    mirror: "15 méteres, teljes falas tükör",
    floor: "Rugalmas táncpadló balettszőnyeggel",
    light: "Szabályozható LED-világítás",
    extras: ["Öltöző és zuhany", "Ingyenes Wi-Fi", "Ivóvíz-adagoló"],
    description:
      "A legnagyobb termünk: tágas tér nagy létszámú csoportos órákhoz, workshopokhoz és próbákhoz, teljes falas tükörrel és erős hangrendszerrel.",
  },
  "Astoria - Kis Terem": {
    location: "Astoria stúdió",
    name: "Kis Terem",
    image: "/rooms/astoria-kis-foto.jpg",
    area: 60,
    length: 10,
    width: 6,
    height: 3.2,
    capacity: 18,
    ac: true,
    sound: "2 × 500 W aktív hangfal, Bluetooth és jack csatlakozás",
    mirror: "10 méteres tükörfal",
    floor: "Rugalmas táncpadló balettszőnyeggel",
    light: "Szabályozható LED-világítás",
    extras: ["Öltöző", "Ingyenes Wi-Fi"],
    description:
      "Meghitt, jól felszerelt terem kiscsoportos órákhoz, privát edzésekhez és koreográfia-gyakorláshoz.",
  },
  "Opera - Nagy Terem": {
    location: "Opera stúdió",
    name: "Nagy Terem",
    image: "/rooms/opera-nagy-foto.jpg",
    area: 90,
    length: 12,
    width: 7.5,
    height: 3.4,
    capacity: 24,
    ac: true,
    sound: "2 × 800 W aktív hangfal, mélynyomó, Bluetooth és jack csatlakozás",
    mirror: "12 méteres tükörfal",
    floor: "Parketta táncpadló",
    light: "Természetes fény + LED-világítás",
    extras: ["Öltöző és zuhany", "Ingyenes Wi-Fi"],
    description:
      "Világos, nagy belmagasságú terem természetes fénnyel — ideális kiscsoportos órákhoz, próbákhoz és videóforgatáshoz.",
  },
  "Opera - Közepes Terem": {
    location: "Opera stúdió",
    name: "Közepes Terem",
    image: "/rooms/opera-kis-foto.jpg",
    area: 55,
    length: 11,
    width: 5,
    height: 3,
    capacity: 18,
    ac: true,
    sound: "Bluetooth hangfal (2 × 300 W)",
    mirror: "11 méteres tükörfal",
    floor: "Parketta táncpadló",
    light: "LED-világítás",
    extras: ["Ingyenes Wi-Fi"],
    description:
      "Közepes méretű terem kiscsoportos és privát órákhoz, gyakorláshoz és próbákhoz.",
  },
};

export const roomPrice = (room: Room) => roomPrices[room];
