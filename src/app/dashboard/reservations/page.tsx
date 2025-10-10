// app/dashboard/reservations/client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

/** ----- Types that match your Firestore fields ----- */
type Resv = {
  id: string;

  // your fields (strings in your screenshot)
  Nom?: string;          // last name
  Prnom?: string;        // first name (your field is "Prnom")
  Email?: string;
  Tlphone?: string;      // your field is "Tlphone"
  Espace?: string;
  Demandes_speciales?: string;
  nombre_de_perssone?: string; // your field spelling
  date?: any;            // string "22 août 2025 à 00:00:00 UTC+1" OR Timestamp
  heure?: string;        // e.g. "21:30 PM"
  createdAt?: any;       // Timestamp

  // computed
  when?: Date | null;
};

/** ----- Helpers ----- */

// French month map
const FR_MONTHS: Record<string, number> = {
  janvier: 0,
  février: 1, fevrier: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  août: 7, aout: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  décembre: 11, decembre: 11,
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function parseFrenchDateString(s: string): Date | null {
  // examples you showed:
  // "22 août 2025 à 00:00:00 UTC+1"
  // "22 aout 2025"
  if (!s) return null;

  // keep only "DD <mois> YYYY"
  const main = s.split(" à ")[0].trim();

  const parts = main.split(/\s+/); // ["22","août","2025"]
  if (parts.length < 3) return null;

  const day = parseInt(parts[0], 10);
  const monthWord = parts[1].toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, ""); // "août" -> "aout"
  const year = parseInt(parts[2], 10);

  const month = FR_MONTHS[monthWord];
  if (Number.isNaN(day) || Number.isNaN(year) || month == null) return null;

  const dt = new Date();
  dt.setFullYear(year, month, day);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function parseHeure(s?: string): { h: number; m: number } | null {
  if (!s) return null;
  // supports "21:30", "9:05", "9:05 PM", "21:30 PM" (we'll ignore PM if already 24h)
  const m = s.match(/(\d{1,2}):(\d{2})\s*([AP]M)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  let mi = parseInt(m[2], 10);
  const ap = (m[3] || "").toUpperCase();

  if (ap === "AM" && h === 12) h = 0;
  if (ap === "PM" && h < 12) h += 12;

  if (Number.isNaN(h) || Number.isNaN(mi)) return null;
  return { h, m: mi };
}

function coerceWhen(r: Resv): Date | null {
  // If date is Firestore Timestamp use it
  if (r.date && typeof r.date === "object" && "seconds" in r.date) {
    const d = new Date(r.date.seconds * 1000);
    const hm = parseHeure(r.heure);
    if (hm) d.setHours(hm.h, hm.m, 0, 0);
    return d;
  }

  // If string
  const base = typeof r.date === "string" ? parseFrenchDateString(r.date) : null;
  if (!base) return null;
  const hm = parseHeure(r.heure);
  if (hm) base.setHours(hm.h, hm.m, 0, 0);
  return base;
}

/** ----- Component ----- */

export default function ReservationsClient() {
  const resCol = useMemo(() => collection(db, "Reservation"), []);
  const [resv, setResv] = useState<Resv[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    // order by createdAt if you have it; otherwise remove orderBy
    const q = query(resCol, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr: Resv[] = snap.docs.map((d) => {
          const x = d.data() as any;
          const r: Resv = {
            id: d.id,
            Nom: x.Nom ?? "",
            Prnom: x.Prnom ?? "",
            Email: x.Email ?? x.email ?? "",
            Tlphone: x.Tlphone ?? x.telephone ?? "",
            Espace: x.Espace ?? "",
            Demandes_speciales: x.Demandes_speciales ?? "",
            nombre_de_perssone: x.nombre_de_perssone ?? "",
            date: x.date,
            heure: x.heure,
            createdAt: x.createdAt,
          };
          r.when = coerceWhen(r);
          return r;
        });
        setResv(arr);
      },
      (e) => setErr(e.message)
    );
    return () => unsub();
  }, [resCol]);

  // simple search
  const q = filter.trim().toLowerCase();
  const searched = resv.filter((r) => {
    if (!q) return true;
    return [
      r.Nom, r.Prnom, r.Email, r.Tlphone, r.Espace, r.Demandes_speciales,
      r.nombre_de_perssone, r.heure, typeof r.date === "string" ? r.date : ""
    ]
      .filter(Boolean)
      .some((s) => (s as string).toLowerCase().includes(q));
  });

  // group by date
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const todayEnd = endOfDay(now).getTime();

  const today: Resv[] = [];
  const upcoming: Resv[] = [];
  const past: Resv[] = [];

  for (const r of searched) {
    const t = r.when ? r.when.getTime() : null;
    if (t == null) {
      // unknown date -> treat as upcoming by createdAt
      upcoming.push(r);
      continue;
    }
    if (t >= todayStart && t <= todayEnd) today.push(r);
    else if (t > todayEnd) upcoming.push(r);
    else past.push(r);
  }

  today.sort((a, b) => (a.when!.getTime() - b.when!.getTime()));
  upcoming.sort((a, b) => (a.when!.getTime() - b.when!.getTime()));
  past.sort((a, b) => (b.when!.getTime() - a.when!.getTime())); // newest past first

  async function del(r: Resv) {
    if (!confirm(`Delete reservation of ${r.Prnom || ""} ${r.Nom || ""}?`)) return;
    await deleteDoc(doc(db, "Reservation", r.id));
  }

  function fmt(d?: Date | null) {
    if (!d) return "—";
    return d.toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" });
  }

  function Card({ r }: { r: Resv }) {
    return (
      <div className="border rounded p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="font-medium">
            {r.Prnom || "—"} {r.Nom || ""}
          </div>
          <div className="text-sm text-gray-600">{fmt(r.when)}</div>
        </div>
        <div className="grid gap-1 text-sm text-gray-700 md:grid-cols-2">
          <div><span className="text-gray-500">Personnes:</span> {r.nombre_de_perssone || "—"}</div>
          <div><span className="text-gray-500">Espace:</span> {r.Espace || "—"}</div>
          <div><span className="text-gray-500">Téléphone:</span> {r.Tlphone || "—"}</div>
          <div><span className="text-gray-500">Email:</span> {r.Email || "—"}</div>
          <div className="md:col-span-2">
            <span className="text-gray-500">Demandes:</span> {r.Demandes_speciales || "—"}
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          {r.Tlphone && (
            <a href={`tel:${r.Tlphone}`} className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm">Appeler</a>
          )}
          {r.Email && (
            <a href={`mailto:${r.Email}`} className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm">Email</a>
          )}
          <button onClick={() => del(r)} className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 text-sm">
            Delete
          </button>
        </div>
      </div>
    );
  }

  function Section({ title, list }: { title: string; list: Resv[] }) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{title} <span className="text-gray-400">({list.length})</span></h2>
        {list.length === 0 ? (
          <div className="text-sm text-gray-500">Nothing here.</div>
        ) : (
          <div className="grid gap-3">
            {list.map((r) => <Card key={r.id} r={r} />)}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Reservations</h1>
        <input
          className="border rounded px-3 py-2 w-72"
          placeholder="Search name / phone / email…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </header>

      {err && <div className="text-red-600">{err}</div>}

      <Section title="Today" list={today} />
      <Section title="Upcoming" list={upcoming} />
      <Section title="Past" list={past} />
    </div>
  );
}
