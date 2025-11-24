// app/dashboard/reservations/client.tsx
"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation"; // 🔹 AJOUT
import { db, auth } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  getDoc,                       // 🔹 AJOUT
} from "firebase/firestore";
import { signOut } from "firebase/auth";      // 🔹 ENLEVER onAuthStateChanged

import {
  DashboardShell,
  type DashboardAction,
} from "@/components/dashboard-shell";

import RequireRole from "@/components/RequireRole";
import { useUserRole } from "@/hooks/useUserRole";


/** ----- Types that match your Firestore fields ----- */
type Resv = {
  id: string;

  // your fields (strings in your screenshot)
  Nom?: string; // last name
  Prnom?: string; // first name (your field is "Prnom")
  Email?: string;
  Tlphone?: string; // your field is "Tlphone"
  Espace?: string;
  Demandes_speciales?: string;
  nombre_de_perssone?: string; // your field spelling
  date?: any; // string "22 août 2025 à 00:00:00 UTC+1" OR Timestamp
  heure?: string; // e.g. "21:30 PM"
  createdAt?: any; // Timestamp

  // computed
  when?: Date | null;
};

/** ----- Helpers ----- */

// French month map
const FR_MONTHS: Record<string, number> = {
  janvier: 0,
  février: 1,
  fevrier: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  août: 7,
  aout: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  décembre: 11,
  decembre: 11,
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
  // examples:
  // "22 août 2025 à 00:00:00 UTC+1"
  // "22 aout 2025"
  if (!s) return null;

  // keep only "DD <mois> YYYY"
  const main = s.split(" à ")[0].trim();

  const parts = main.split(/\s+/); // ["22","août","2025"]
  if (parts.length < 3) return null;

  const day = parseInt(parts[0], 10);
  const monthWord = parts[1]
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, ""); // "août" -> "aout"
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
  // supports "21:30", "9:05", "9:05 PM", "21:30 PM"
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

type SectionFilter = "all" | "today" | "upcoming" | "past";
type SortMode = "default" | "time_asc" | "time_desc";

/** ----- Outer component with DashboardShell ----- */

export default function ReservationsPage() {
  const r = useRouter();

  const { uid, role, loading: roleLoading } = useUserRole(); // 🔹 uid vient du hook

  const [userName, setUserName] = useState("Utilisateur");
  const [userEmail, setUserEmail] = useState("contact@altamaro.com");

  // 🔁 Redirection si pas connecté
  useEffect(() => {
    if (!roleLoading && !uid) {
      r.replace("/login");
    }
  }, [roleLoading, uid, r]);

  // 👤 Charger nom + email depuis Auth + Firestore /user/{uid}
  useEffect(() => {
    if (!roleLoading && uid) {
      const authUser = auth.currentUser;

      if (authUser) {
        if (authUser.displayName) setUserName(authUser.displayName);
        if (authUser.email) setUserEmail(authUser.email);
      }

      const userRef = doc(db, "user", uid);
      getDoc(userRef).then((snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as any;

        const nameFromDoc =
          data.display_name ||
          `${data.Prnom || ""} ${data.nomFamille || ""}`.trim();
        const emailFromDoc = data.email;

        if (nameFromDoc) setUserName(nameFromDoc);
        if (emailFromDoc) setUserEmail(emailFromDoc);
      });
    }
  }, [roleLoading, uid]);

  if (roleLoading || !uid || !role) {
    return <div className="p-6">Chargement…</div>;
  }



  const allActions: DashboardAction[] = [

    {
      href: "/dashboard/statistics",
      title: "Statistiques",
      desc: "Vue d’ensemble, tops, activité",
      icon: "📊",
      section: "Analyse",
    },

    {
      href: "/dashboard/home",
      title: "Accueil",
      desc: "Contenu principal de l’app.",
      icon: "🏠",
      section: "Pages",
    },
    {
      href: "/dashboard/pages-common",
      title: "Interface Commune",
      desc: "Éléments partagés.",
      icon: "🧩",
      section: "Pages",
    },
    {
      href: "/dashboard/restaurant",
      title: "Page Restaurant",
      desc: "Textes, images & vidéos.",
      icon: "🏨",
      section: "Pages",
    },

    {
      href: "/dashboard/menu",
      title: "Menus",
      desc: "Sections, groupes & produits.",
      icon: "🍽️",
      section: "Carte & Produits",
    },
    {
      href: "/dashboard/menu/all",
      title: "Tous les Produits",
      desc: "Liste complète.",
      icon: "🛒",
      section: "Carte & Produits",
    },
    {
      href: "/dashboard/categories",
      title: "Catégories",
      desc: "Entrées, plats, desserts…",
      icon: "📂",
      section: "Carte & Produits",
    },

    {
      href: "/dashboard/reservations",
      title: "Réservations",
      desc: "Demandes clients.",
      icon: "📅",
      section: "Clients",
    },
    {
      href: "/dashboard/reclamations",
      title: "Réclamations",
      desc: "Messages & réclamations.",
      icon: "✉️",
      section: "Clients",
    },
    {
      href: "/dashboard/users",
      title: "Utilisateurs app",
      desc: "Profils, blocage & bannissement.",
      icon: "👤",
      section: "Clients",
    },

    {
      href: "/dashboard/branding",
      title: "Branding & Réseaux",
      desc: "Logos et liens sociaux.",
      icon: "🎨",
      section: "Marque",
    },
    {
      href: "/dashboard/card",
      title: "Vidéos",
      desc: "Télécharger & gérer.",
      icon: "🎞️",
      section: "Marque",
    },
    
     {
      href: "/dashboard/administration",
      title: "Administration",
      desc: "Rôles & accès staff",
      icon: "🧑‍💼",
      section: "Administration",
    },
    
  ];


      let actions: DashboardAction[] = [];

  if (role === "admin") {
    actions = allActions;
  } else if (role === "responsable_clients") {
  const allowed = new Set<string>([
    "/dashboard/statistics",
    "/dashboard/reservations",
    "/dashboard/reclamations",
    "/dashboard/users",
  ]);
  actions = allActions.filter((a) => allowed.has(a.href));
}



      return (
    <RequireRole allow={["admin", "responsable_clients"]}>

      <DashboardShell
  uid={uid}
  userName={userName}
  userEmail={userEmail}
  actions={actions}
  userRole={role || undefined}             // 🔹 AJOUT
  onSignOut={async () => {
    await signOut(auth);
    r.replace("/login");                   // 🔹 Redirection après logout
  }}
>
  <InnerReservations />
</DashboardShell>
    </RequireRole>
  );

}

/** ----- Inner logic (Firestore logic unchanged) ----- */

function InnerReservations() {
  const resCol = useMemo(() => collection(db, "Reservation"), []);
  const [resv, setResv] = useState<Resv[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("default");

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
      r.Nom,
      r.Prnom,
      r.Email,
      r.Tlphone,
      r.Espace,
      r.Demandes_speciales,
      r.nombre_de_perssone,
      r.heure,
      typeof r.date === "string" ? r.date : "",
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

  // original behaviour: today & upcoming ascending, past descending
  function sortList(list: Resv[], kind: "today" | "upcoming" | "past"): Resv[] {
    const arr = [...list];
    if (sortMode === "default") {
      if (kind === "past") {
        arr.sort((a, b) => b.when!.getTime() - a.when!.getTime());
      } else {
        arr.sort((a, b) => a.when!.getTime() - b.when!.getTime());
      }
      return arr;
    }
    if (sortMode === "time_asc") {
      arr.sort((a, b) => a.when!.getTime() - b.when!.getTime());
      return arr;
    }
    // time_desc
    arr.sort((a, b) => b.when!.getTime() - a.when!.getTime());
    return arr;
  }

  const todaySorted = sortList(today, "today");
  const upcomingSorted = sortList(upcoming, "upcoming");
  const pastSorted = sortList(past, "past");

  async function del(r: Resv) {
    if (
      !confirm(
        `Supprimer la réservation de ${r.Prnom || ""} ${r.Nom || ""} ?`
      )
    )
      return;
    await deleteDoc(doc(db, "Reservation", r.id));
  }

  function fmt(d?: Date | null) {
    if (!d) return "—";
    return d.toLocaleString("fr-FR", {
      dateStyle: "full",
      timeStyle: "short",
    });
  }

  function Card({ r }: { r: Resv }) {
    return (
      <div className="border border-[#e4ded1] rounded-2xl p-3 flex flex-col gap-2 bg-[#faf9f6]">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-sm md:text-base">
            {r.Prnom || "—"} {r.Nom || ""}
          </div>
          <div className="text-xs md:text-sm text-gray-600 whitespace-nowrap">
            {fmt(r.when)}
          </div>
        </div>
        <div className="grid gap-1 text-xs md:text-sm text-gray-700 md:grid-cols-2">
          <div>
            <span className="text-gray-500">Personnes :</span>{" "}
            {r.nombre_de_perssone || "—"}
          </div>
          <div>
            <span className="text-gray-500">Espace :</span>{" "}
            {r.Espace || "—"}
          </div>
          <div>
            <span className="text-gray-500">Téléphone :</span>{" "}
            {r.Tlphone || "—"}
          </div>
          <div>
            <span className="text-gray-500">Email :</span>{" "}
            {r.Email || "—"}
          </div>
          <div className="md:col-span-2">
            <span className="text-gray-500">Demandes :</span>{" "}
            {r.Demandes_speciales || "—"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {r.Tlphone && (
            <a
              href={`tel:${r.Tlphone}`}
              className="px-2 py-1 rounded-xl bg-white border border-[#d4cec2] hover:bg-[#f3f1ea] text-xs md:text-sm"
            >
              Appeler
            </a>
          )}
          {r.Email && (
            <a
              href={`mailto:${r.Email}`}
              className="px-2 py-1 rounded-xl bg-white border border-[#d4cec2] hover:bg-[#f3f1ea] text-xs md:text-sm"
            >
              Email
            </a>
          )}
          <button
            onClick={() => del(r)}
            className="px-3 py-1 rounded-xl bg-red-600 text-white hover:bg-red-700 text-xs md:text-sm"
          >
            Supprimer
          </button>
        </div>
      </div>
    );
  }

  function Section({
    title,
    list,
    accent,
  }: {
    title: string;
    list: Resv[];
    accent: "today" | "upcoming" | "past";
  }) {
    const badgeColor =
      accent === "today"
        ? "bg-emerald-100 text-emerald-700"
        : accent === "upcoming"
        ? "bg-amber-100 text-amber-700"
        : "bg-gray-200 text-gray-700";

    return (
      <section className="border border-[#e4ded1] rounded-3xl bg-white p-4 flex flex-col h-full">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm md:text-base font-semibold flex items-center gap-2">
            <span>{title}</span>
            <span
              className={`px-2 py-0.5 text-[11px] rounded-full ${badgeColor}`}
            >
              {list.length}
            </span>
          </h2>
        </div>
        {list.length === 0 ? (
          <div className="text-xs md:text-sm text-gray-500">
            Aucune réservation.
          </div>
        ) : (
          <div className="space-y-3 max-h-[520px] overflow-auto pr-1">
            {list.map((r) => (
              <Card key={r.id} r={r} />
            ))}
          </div>
        )}
      </section>
    );
  }

  const showToday =
    sectionFilter === "all" || sectionFilter === "today";
  const showUpcoming =
    sectionFilter === "all" || sectionFilter === "upcoming";
  const showPast = sectionFilter === "all" || sectionFilter === "past";

  const total = resv.length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* HEADER */}
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1
            className="text-3xl font-extrabold"
            style={{ color: "#2f4632" }}
          >
            Réservations
          </h1>
          <p className="text-sm" style={{ color: "#43484f" }}>
            Gérez les demandes clients : aujourd’hui, à venir et passées.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Total : {total} réservation(s).
          </p>
        </div>

        {/* search + filters */}
        <div className="w-full md:w-[340px] bg-white border border-[#e4ded1] rounded-2xl px-3 py-2 shadow-sm space-y-2">
          <input
            className="w-full border border-[#e4ded1] rounded-xl px-3 py-1.5 text-xs md:text-sm bg-[#faf9f6]"
            placeholder="Rechercher par nom, téléphone, email…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="flex items-center justify-between gap-2 text-[11px] md:text-xs">
            <select
              className="border border-[#e4ded1] rounded-xl px-2 py-1 bg-white flex-1"
              value={sectionFilter}
              onChange={(e) =>
                setSectionFilter(e.target.value as SectionFilter)
              }
            >
              <option value="all">Toutes les sections</option>
              <option value="today">Aujourd’hui</option>
              <option value="upcoming">À venir</option>
              <option value="past">Passées</option>
            </select>
            <select
              className="border border-[#e4ded1] rounded-xl px-2 py-1 bg-white flex-1"
              value={sortMode}
              onChange={(e) =>
                setSortMode(e.target.value as SortMode)
              }
            >
              <option value="default">Tri par défaut</option>
              <option value="time_asc">Heure croissante</option>
              <option value="time_desc">Heure décroissante</option>
            </select>
          </div>
        </div>
      </header>

      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl px-4 py-2">
          {err}
        </div>
      )}

      {/* 3 columns: Today / Upcoming / Past */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {showToday && (
          <Section
            title="Aujourd’hui"
            list={todaySorted}
            accent="today"
          />
        )}
        {showUpcoming && (
          <Section
            title="À venir"
            list={upcomingSorted}
            accent="upcoming"
          />
        )}
        {showPast && (
          <Section
            title="Passées"
            list={pastSorted}
            accent="past"
          />
        )}
      </div>

      <p className="text-[11px] text-gray-500">
        Astuce : le tri est seulement visuel. La suppression n’affecte
        que la collection <code>Reservation</code> dans Firestore.
      </p>
    </div>
  );
}
