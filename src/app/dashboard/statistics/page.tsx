// app/dashboard/statistics/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";

import { auth, db } from "@/lib/firebase";
import { useUserRole } from "@/hooks/useUserRole";
import RequireRole from "@/components/RequireRole";

import {
  collection,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";

import {
  DashboardShell,
  type DashboardAction,
} from "@/components/dashboard-shell";

/* ───────────── helpers types ───────────── */

type TimeBucket = { label: string; value: number };

type ItemStat = {
  id: string;
  name: string;
  count: number;
  extra?: string;
};

type Stats = {
  // global
  totalReservations: number;
  reservationsLast30: number;
  avgPeoplePerRes: number | null;
  reservationsBySpace: { space: string; count: number }[];
  reservationsByDate: TimeBucket[];

  totalUsers: number;
  newUsersLast30: number;
  usersByDate: TimeBucket[];

  totalLikes: number;
  totalFavorites: number;
  totalComments: number;
  totalRatings: number;
  avgRatingGlobal: number | null;
  interactionsBreakdown: TimeBucket[];

  openReclamations: number;
  treatedReclamations: number;
  archivedReclamations: number;
  avgResolutionHours: number | null;
  reclamationsByStatus: TimeBucket[];

  topLiked: ItemStat[];
  topFavorited: ItemStat[];
  topCommented: ItemStat[];
  topRated: ItemStat[];
};

type PanelKey = "overview" | "reservations" | "menu" | "reclamations" | "users";

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object" && "seconds" in v) {
    return new Date(v.seconds * 1000);
  }
  return null;
}

function getItemIdFromRef(ref: any): string | null {
  if (!ref) return null;
  if (typeof ref === "string") {
    const parts = ref.split("/");
    return parts[parts.length - 1] || null;
  }
  if (ref.id) return ref.id as string;
  if (ref.path) {
    const parts = (ref.path as string).split("/");
    return parts[parts.length - 1] || null;
  }
  return null;
}

function parsePeople(s: any): number | null {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isNaN(n) ? null : n;
}

function mapToSeriesLastPeriod(
  map: Map<string, number>,
  cutoff: Date | null
): TimeBucket[] {
  const arr: TimeBucket[] = [];
  for (const [label, value] of map.entries()) {
    if (cutoff) {
      const d = new Date(label);
      if (d < cutoff) continue;
    }
    arr.push({ label, value });
  }
  arr.sort((a, b) => a.label.localeCompare(b.label));
  // Garde max 10 points pour rester lisible
  return arr.slice(-10);
}

/* ───────────── main page ───────────── */

export default function StatisticsPage() {
  const r = useRouter();
  const { uid, role, loading: roleLoading } = useUserRole();

  const [userName, setUserName] = useState("Administrateur");
  const [userEmail, setUserEmail] = useState("contact@altamaro.com");


      // 🔹 Redirection si pas connecté / pas de rôle
  useEffect(() => {
    if (!roleLoading && (!uid || !role)) {
      r.replace("/login");
    }
  }, [roleLoading, uid, role, r]);

  // 🔹 Charger nom + email depuis Auth + Firestore /user/{uid}
  useEffect(() => {
    if (roleLoading || !uid) return;

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
  }, [roleLoading, uid]);

  const isReady = !roleLoading && !!uid && !!role;

  if (!isReady) {
    return <div className="p-6">Chargement…</div>;
  }



    

  const allActions: DashboardAction[] = [
    { href: "/dashboard/statistics", title: "Statistiques", desc: "Vue globale des performances", icon: "📊", section: "Analyse" },

    { href: "/dashboard/home", title: "Accueil", desc: "Gestion du contenu principal", icon: "🏠", section: "Pages" },
    { href: "/dashboard/pages-common", title: "Interface Commune", desc: "Contenu partagé", icon: "🧩", section: "Pages" },
    { href: "/dashboard/restaurant", title: "Page Restaurant", desc: "Images & vidéos", icon: "🏨", section: "Pages" },

    { href: "/dashboard/menu", title: "Menus", desc: "Sections & produits", icon: "🍽️", section: "Carte & Produits" },
    { href: "/dashboard/menu/all", title: "Tous les Produits", desc: "Liste complète", icon: "🛒", section: "Carte & Produits" },
    { href: "/dashboard/categories", title: "Catégories", desc: "Ajouter / modifier", icon: "📂", section: "Carte & Produits" },

    { href: "/dashboard/reservations", title: "Réservations", desc: "Demandes des clients", icon: "📅", section: "Clients" },
    { href: "/dashboard/reclamations", title: "Réclamations", desc: "Messages clients", icon: "✉️", section: "Clients" },
    { href: "/dashboard/users", title: "Utilisateurs app", desc: "Profils, blocage & bannissement.", icon: "👤", section: "Clients" },
    { href: "/dashboard/comments", title: "Commentaires", desc: "Masquer ou supprimer.", icon: "💬", section: "Clients", },
    
    { href: "/dashboard/branding", title: "Branding & Réseaux", desc: "Logos et liens", icon: "🎨", section: "Marque" },
    { href: "/dashboard/card", title: "Vidéos", desc: "Télécharger / gérer", icon: "🎞️", section: "Marque" },

    { href: "/dashboard/administration", title: "Administration", desc: "Rôles & accès staff", icon: "🧑‍💼", section: "Administration" },
  ];

  let actions: DashboardAction[] = [];

  if (role === "admin") {
    actions = allActions;
  } else if (role === "chef") {
    const allowed = new Set<string>([
      "/dashboard/statistics",
      "/dashboard/menu",
      "/dashboard/menu/all",
      "/dashboard/categories",
    ]);
    actions = allActions.filter((a) => allowed.has(a.href));
  } else if (role === "responsable_pages") {
    const allowed = new Set<string>([
      "/dashboard/statistics",
      "/dashboard/home",
      "/dashboard/pages-common",
      "/dashboard/restaurant",
      "/dashboard/branding",
      "/dashboard/card",
    ]);
    actions = allActions.filter((a) => allowed.has(a.href));
  } else if (role === "responsable_clients") {
  const allowed = new Set<string>([
    "/dashboard/statistics",
    "/dashboard/reservations",
    "/dashboard/reclamations",
    "/dashboard/users",
    "/dashboard/comments", // ✅ autoriser
  ]);
  actions = allActions.filter((a) => allowed.has(a.href));
}



    return (
    <RequireRole
      allow={[
        "admin",
        "chef",
        "responsable_pages",
        "responsable_clients",
      ]}
    >
      <DashboardShell
        uid={uid}
        userName={userName}
        userEmail={userEmail}
        userRole={role || undefined}
        actions={actions}
        onSignOut={async () => {
          await signOut(auth);
          r.replace("/login");
        }}
      >
        <StatisticsClient role={role} />
      </DashboardShell>
    </RequireRole>
  );

}


/* ───────────── client stats component ───────────── */


  function StatisticsClient({ role }: { role: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<PanelKey>("overview");

    const allowedPanelsByRole: Record<string, PanelKey[]> = {
    admin: ["overview", "reservations", "menu", "reclamations", "users"],
    chef: ["overview", "reservations", "menu"],
    responsable_pages: ["overview", "menu", "users"],
    responsable_clients: ["overview", "reservations", "reclamations", "users"],
  };

  const allowedPanels = allowedPanelsByRole[role] ?? ["overview"];

  const canSeeReservations = allowedPanels.includes("reservations");
  const canSeeMenu = allowedPanels.includes("menu");
  const canSeeReclamations = allowedPanels.includes("reclamations");
  const canSeeUsers = allowedPanels.includes("users");

  function safeSetActivePanel(p: PanelKey) {
    if (!allowedPanels.includes(p)) return;
    setActivePanel(p);
  }


  const reservationCol = useMemo(() => collection(db, "Reservation"), []);
  const usersCol       = useMemo(() => collection(db, "user"), []);
  const likesCol       = useMemo(() => collection(db, "item_likes"), []);
  const favCol         = useMemo(() => collection(db, "item_favorites"), []);
  const commentsCol    = useMemo(() => collection(db, "item_comments"), []);
  const ratingsCol     = useMemo(() => collection(db, "item_ratings"), []);
  const reclamCol      = useMemo(() => collection(db, "reclamations"), []);
  const menuItemsCol   = useMemo(() => collection(db, "menu_items"), []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const [
          resSnap,
          usersSnap,
          likesSnap,
          favSnap,
          comSnap,
          ratSnap,
          reclSnap,
          itemsSnap,
        ] = await Promise.all([
          getDocs(reservationCol),
          getDocs(usersCol),
          getDocs(likesCol),
          getDocs(favCol),
          getDocs(commentsCol),
          getDocs(ratingsCol),
          getDocs(reclamCol),
          getDocs(menuItemsCol),
        ]);

        const now = new Date();
        const last30 = new Date();
        last30.setDate(now.getDate() - 30);

        /* ---------- menu items name map ---------- */
        const nameByItemId = new Map<string, string>();
        itemsSnap.forEach((d) => {
          const x = d.data() as any;
          const name =
            x.name ||
            x.title ||
            x.nom ||
            d.id;
          nameByItemId.set(d.id, name);
        });

        /* ---------- reservations ---------- */
        let totalReservations = 0;
        let reservationsLast30 = 0;
        let sumPeople = 0;
        let countPeople = 0;
        const bySpace = new Map<string, number>();
        const resByDate = new Map<string, number>();

        resSnap.forEach((d) => {
          totalReservations++;
          const x = d.data() as any;
          const created =
            toDate(x.createdAt || x.created_at || x.date);
          if (created) {
            const key = created.toISOString().slice(0, 10);
            resByDate.set(key, (resByDate.get(key) || 0) + 1);
            if (created >= last30) reservationsLast30++;
          }

          const n = parsePeople(x.nombre_de_perssone);
          if (n != null) {
            sumPeople += n;
            countPeople++;
          }

          const space = x.Espace || x.espace || "Autre";
          bySpace.set(space, (bySpace.get(space) || 0) + 1);
        });

        const avgPeoplePerRes =
          countPeople > 0 ? sumPeople / countPeople : null;

        const reservationsBySpace = Array.from(bySpace.entries()).map(
          ([space, count]) => ({ space, count })
        );

        const reservationsByDate = mapToSeriesLastPeriod(
          resByDate,
          last30
        );

        /* ---------- users ---------- */
        let totalUsers = 0;
        let newUsersLast30 = 0;
        const usersByDateMap = new Map<string, number>();

        usersSnap.forEach((d) => {
          totalUsers++;
          const x = d.data() as any;
          const created = toDate(x.created_time || x.createdAt);
          if (!created) return;
          const key = created.toISOString().slice(0, 10);
          usersByDateMap.set(key, (usersByDateMap.get(key) || 0) + 1);
          if (created >= last30) newUsersLast30++;
        });

        const usersByDate = mapToSeriesLastPeriod(
          usersByDateMap,
          last30
        );

        /* ---------- interactions par item ---------- */

        const likesByItem   = new Map<string, number>();
        const favByItem     = new Map<string, number>();
        const commentsByItem= new Map<string, number>();
        const ratingCountByItem = new Map<string, number>();
        const ratingSumByItem   = new Map<string, number>();

        // likes
        likesSnap.forEach((d) => {
          const x = d.data() as any;
          const id = getItemIdFromRef(x.item_ref);
          if (!id) return;
          likesByItem.set(id, (likesByItem.get(id) || 0) + 1);
        });

        // favorites
        favSnap.forEach((d) => {
          const x = d.data() as any;
          const id = getItemIdFromRef(x.item_ref);
          if (!id) return;
          favByItem.set(id, (favByItem.get(id) || 0) + 1);
        });

        // comments (only non deleted, depth=1)
        comSnap.forEach((d) => {
          const x = d.data() as any;
          if (x.is_deleted) return;
          if (x.depth && x.depth !== 1) return;
          const id = getItemIdFromRef(x.item_ref);
          if (!id) return;
          commentsByItem.set(id, (commentsByItem.get(id) || 0) + 1);
        });

        // ratings
        let globalSum = 0;
        let globalCount = 0;
        ratSnap.forEach((d) => {
          const x = d.data() as any;
          const id = getItemIdFromRef(x.item_ref);
          const v = typeof x.value === "number" ? x.value : null;
          if (!id || v == null) return;
          ratingCountByItem.set(
            id,
            (ratingCountByItem.get(id) || 0) + 1
          );
          ratingSumByItem.set(
            id,
            (ratingSumByItem.get(id) || 0) + v
          );
          globalSum += v;
          globalCount++;
        });

        const avgRatingGlobal =
          globalCount > 0 ? globalSum / globalCount : null;

        const totalLikes = likesSnap.size;
        const totalFavorites = favSnap.size;
        const totalComments = comSnap.size;
        const totalRatings = ratSnap.size;

        const interactionsBreakdown: TimeBucket[] = [
          { label: "Likes", value: totalLikes },
          { label: "Favoris", value: totalFavorites },
          { label: "Commentaires", value: totalComments },
          { label: "Notes", value: totalRatings },
        ].filter((x) => x.value > 0);

        // helper to build top N list
        const buildTop = (
          map: Map<string, number>,
          extra?: "rating"
        ): ItemStat[] => {
          const arr: ItemStat[] = [];
          map.forEach((count, id) => {
            const name = nameByItemId.get(id) || id;
            let extraLabel: string | undefined;
            if (extra === "rating") {
              const c = ratingCountByItem.get(id) || 0;
              const s = ratingSumByItem.get(id) || 0;
              if (c > 0) {
                const avg = s / c;
                extraLabel = `${avg.toFixed(1)}★ (${c})`;
              }
            }
            arr.push({ id, name, count, extra: extraLabel });
          });
          arr.sort((a, b) => b.count - a.count);
          return arr.slice(0, 5);
        };

        const topLiked      = buildTop(likesByItem);
        const topFavorited  = buildTop(favByItem);
        const topCommented  = buildTop(commentsByItem);
        const topRated      = buildTop(ratingCountByItem, "rating");

        /* ---------- réclamations ---------- */

        let openReclamations = 0;
        let treatedReclamations = 0;
        let archivedReclamations = 0;
        let sumResolutionHours = 0;
        let countResolution = 0;

        reclSnap.forEach((d) => {
          const x = d.data() as any;
          const status = (x.status || "en cours") as string;
          const isArchived = x.is_archived === true;

          if (isArchived) {
            archivedReclamations++;
            return;
          }

          if (status === "traité") {
            treatedReclamations++;
            const c = toDate(x.created_at);
            const u = toDate(x.updated_at);
            if (c && u) {
              const diffMs = u.getTime() - c.getTime();
              const h = diffMs / (1000 * 60 * 60);
              if (h >= 0) {
                sumResolutionHours += h;
                countResolution++;
              }
            }
          } else {
            openReclamations++;
          }
        });

        const avgResolutionHours =
          countResolution > 0
            ? sumResolutionHours / countResolution
            : null;

        const reclamationsByStatus: TimeBucket[] = [
          { label: "En cours", value: openReclamations },
          { label: "Traitée", value: treatedReclamations },
          { label: "Archivée", value: archivedReclamations },
        ].filter((x) => x.value > 0);

        const final: Stats = {
          totalReservations,
          reservationsLast30,
          avgPeoplePerRes,
          reservationsBySpace,
          reservationsByDate,

          totalUsers,
          newUsersLast30,
          usersByDate,

          totalLikes,
          totalFavorites,
          totalComments,
          totalRatings,
          avgRatingGlobal,
          interactionsBreakdown,

          openReclamations,
          treatedReclamations,
          archivedReclamations,
          avgResolutionHours,
          reclamationsByStatus,

          topLiked,
          topFavorited,
          topCommented,
          topRated,
        };

        setStats(final);
      } catch (e: any) {
        console.error(e);
        setErr(e.message || "Erreur de chargement des statistiques.");
      } finally {
        setLoading(false);
      }
    })();
  }, [
    reservationCol,
    usersCol,
    likesCol,
    favCol,
    commentsCol,
    ratingsCol,
    reclamCol,
    menuItemsCol,
  ]);

  if (loading) return <div className="p-6">Chargement des statistiques…</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;
  if (!stats) return <div className="p-6">Aucune donnée.</div>;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1
          className="text-4xl font-extrabold"
          style={{ color: "#2f4632" }}
        >
          Statistiques
        </h1>
        <p
          className="text-sm mt-2"
          style={{ color: "#43484f" }}
        >
          Vue globale des performances d’Altamaro : réservations, carte,
          clients et réclamations. Clique sur une carte pour voir le détail.
        </p>
      </div>

      {/* Global KPIs */}
      <section className="space-y-4">
  <h2 className="text-xl font-semibold" style={{ color: "#2f4632" }}>
    Vue d’ensemble
  </h2>
  <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
    {canSeeReservations && (
      <>
        <StatCard
          title="Réservations (total)"
          value={stats.totalReservations.toString()}
          subtitle="Depuis l’ouverture"
          onClick={() => safeSetActivePanel("reservations")}
        />
        <StatCard
          title="Réservations 30 derniers jours"
          value={stats.reservationsLast30.toString()}
          subtitle="Tendance récente"
          onClick={() => safeSetActivePanel("reservations")}
        />
      </>
    )}

    {canSeeUsers && (
      <StatCard
        title="Utilisateurs inscrits"
        value={stats.totalUsers.toString()}
        subtitle={`+${stats.newUsersLast30} sur 30 jours`}
        onClick={() => safeSetActivePanel("users")}
      />
    )}

    {canSeeMenu && (
      <StatCard
        title="Note moyenne globale"
        value={
          stats.avgRatingGlobal != null
            ? stats.avgRatingGlobal.toFixed(1) + " ★"
            : "—"
        }
        subtitle={`${stats.totalRatings} avis au total`}
        onClick={() => safeSetActivePanel("menu")}
      />
    )}
  </div>
</section>


      {/* Interactions carte & plats (global, résumés) */}
      {canSeeMenu && (
  <section className="space-y-4">
    <h2 className="text-xl font-semibold" style={{ color: "#2f4632" }}>
      Carte & Plats (aperçu)
    </h2>
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title="Likes"
        value={stats.totalLikes.toString()}
        subtitle="Sur tous les plats"
        onClick={() => safeSetActivePanel("menu")}
      />
      <StatCard
        title="Favoris"
        value={stats.totalFavorites.toString()}
        subtitle="Plats enregistrés"
        onClick={() => safeSetActivePanel("menu")}
      />
      <StatCard
        title="Commentaires"
        value={stats.totalComments.toString()}
        subtitle="Commentaires visibles"
        onClick={() => safeSetActivePanel("menu")}
      />
      <StatCard
        title="Notes"
        value={stats.totalRatings.toString()}
        subtitle="Nombre total de notes"
        onClick={() => safeSetActivePanel("menu")}
      />
    </div>
  </section>
)}


      {/* Réclamations aperçu */}
      {canSeeReclamations && (
  <section className="space-y-4">
    <h2 className="text-xl font-semibold" style={{ color: "#2f4632" }}>
      Réclamations & SAV (aperçu)
    </h2>
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
      <StatCard
        title="Réclamations en cours"
        value={stats.openReclamations.toString()}
        subtitle="Non archivées"
        onClick={() => safeSetActivePanel("reclamations")}
      />
      <StatCard
        title="Réclamations traitées"
        value={stats.treatedReclamations.toString()}
        subtitle="Statut = traité"
        onClick={() => safeSetActivePanel("reclamations")}
      />
      <StatCard
        title="Délai moyen de résolution"
        value={
          stats.avgResolutionHours != null
            ? `${stats.avgResolutionHours.toFixed(1)} h`
            : "—"
        }
        subtitle="Entre création et réponse"
        onClick={() => safeSetActivePanel("reclamations")}
      />
    </div>
  </section>
)}


      {/* Panel selector */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold" style={{ color: "#2f4632" }}>
            Détail sélectionné
          </h2>
         <DetailTabs
  active={activePanel}
  onChange={safeSetActivePanel}
  visiblePanels={allowedPanels}
/>

        </div>

        {/* Detail content */}
        {activePanel === "overview" && <OverviewDetail stats={stats} />}
        {activePanel === "reservations" && (
          <ReservationsDetail stats={stats} />
        )}
        {activePanel === "menu" && <MenuDetail stats={stats} />}
        {activePanel === "reclamations" && (
          <ReclamationsDetail stats={stats} />
        )}
        {activePanel === "users" && <UsersDetail stats={stats} />}
      </section>
    </div>
  );
}

/* ───────────── Detail panels ───────────── */

function OverviewDetail({ stats }: { stats: Stats }) {
  const globalActivity: TimeBucket[] = [
    { label: "Réservations 30j", value: stats.reservationsLast30 },
    { label: "Nouveaux users 30j", value: stats.newUsersLast30 },
    { label: "Réclamations traitées 30j", value: stats.treatedReclamations },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <DetailCard title="Activité globale (30 derniers jours)">
        <BarChart data={globalActivity} />
      </DetailCard>

      <DetailCard title="Engagement sur la carte">
        <BarChart data={stats.interactionsBreakdown} />
      </DetailCard>
    </div>
  );
}

function ReservationsDetail({ stats }: { stats: Stats }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <DetailCard title="Réservations par jour (30 derniers jours)">
          {stats.reservationsByDate.length === 0 ? (
            <p className="text-xs" style={{ color: "#43484f" }}>
              Aucune réservation récente.
            </p>
          ) : (
            <BarChart data={stats.reservationsByDate} />
          )}
        </DetailCard>

        <DetailCard title="Répartition par espace">
          {stats.reservationsBySpace.length === 0 ? (
            <p className="text-xs" style={{ color: "#43484f" }}>
              Aucune réservation.
            </p>
          ) : (
            <>
              <BarChart
                data={stats.reservationsBySpace.map((s) => ({
                  label: s.space,
                  value: s.count,
                }))}
              />
              <ul className="mt-4 text-sm" style={{ color: "#43484f" }}>
                {stats.reservationsBySpace.map((s) => (
                  <li
                    key={s.space}
                    className="flex justify-between border-b border-[#e8e2d7] py-1"
                  >
                    <span>{s.space}</span>
                    <span className="font-semibold">{s.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DetailCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <DetailCard title="Personnes / réservation (moyenne)">
          <p
            className="text-3xl font-extrabold"
            style={{ color: "#b1853c" }}
          >
            {stats.avgPeoplePerRes != null
              ? stats.avgPeoplePerRes.toFixed(1)
              : "—"}
          </p>
          <p className="mt-2 text-xs" style={{ color: "#43484f" }}>
            Calculé à partir du champ <code>nombre_de_perssone</code>.
          </p>
        </DetailCard>

        <DetailCard title="Réservations totales">
          <p
            className="text-3xl font-extrabold"
            style={{ color: "#b1853c" }}
          >
            {stats.totalReservations}
          </p>
          <p className="mt-2 text-xs" style={{ color: "#43484f" }}>
            Tous espaces confondus.
          </p>
        </DetailCard>

        <DetailCard title="Réservations 30 derniers jours">
          <p
            className="text-3xl font-extrabold"
            style={{ color: "#b1853c" }}
          >
            {stats.reservationsLast30}
          </p>
          <p className="mt-2 text-xs" style={{ color: "#43484f" }}>
            Basé sur <code>createdAt</code>.
          </p>
        </DetailCard>
      </div>
    </div>
  );
}

function MenuDetail({ stats }: { stats: Stats }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <DetailCard title="Répartition des interactions">
          <BarChart data={stats.interactionsBreakdown} />
        </DetailCard>

        <DetailCard title="Note moyenne globale">
          <p
            className="text-4xl font-extrabold"
            style={{ color: "#b1853c" }}
          >
            {stats.avgRatingGlobal != null
              ? stats.avgRatingGlobal.toFixed(1) + " ★"
              : "—"}
          </p>
          <p className="mt-2 text-xs" style={{ color: "#43484f" }}>
            {stats.totalRatings} avis au total.
          </p>
        </DetailCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
        <TopListCard title="Plats les plus likés" items={stats.topLiked} />
        <TopListCard
          title="Plats les plus en favoris"
          items={stats.topFavorited}
        />
        <TopListCard
          title="Plats les plus commentés"
          items={stats.topCommented}
        />
        <TopListCard title="Plats les plus notés" items={stats.topRated} />
      </div>
    </div>
  );
}

function ReclamationsDetail({ stats }: { stats: Stats }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <DetailCard title="Réclamations par statut">
          <BarChart data={stats.reclamationsByStatus} />
        </DetailCard>

        <DetailCard title="Délai moyen de résolution">
          <p
            className="text-4xl font-extrabold"
            style={{ color: "#b1853c" }}
          >
            {stats.avgResolutionHours != null
              ? `${stats.avgResolutionHours.toFixed(1)} h`
              : "—"}
          </p>
          <p className="mt-2 text-xs" style={{ color: "#43484f" }}>
            Temps entre <code>created_at</code> et <code>updated_at</code>{" "}
            pour les réclamations traitées.
          </p>
        </DetailCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <DetailCard title="Réclamations en cours">
          <p
            className="text-3xl font-extrabold"
            style={{ color: "#b1853c" }}
          >
            {stats.openReclamations}
          </p>
        </DetailCard>
        <DetailCard title="Réclamations traitées">
          <p
            className="text-3xl font-extrabold"
            style={{ color: "#b1853c" }}
          >
            {stats.treatedReclamations}
          </p>
        </DetailCard>
        <DetailCard title="Réclamations archivées">
          <p
            className="text-3xl font-extrabold"
            style={{ color: "#b1853c" }}
          >
            {stats.archivedReclamations}
          </p>
        </DetailCard>
      </div>
    </div>
  );
}

function UsersDetail({ stats }: { stats: Stats }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <DetailCard title="Nouveaux utilisateurs par jour (30 derniers jours)">
          {stats.usersByDate.length === 0 ? (
            <p className="text-xs" style={{ color: "#43484f" }}>
              Aucun nouvel utilisateur récent.
            </p>
          ) : (
            <BarChart data={stats.usersByDate} />
          )}
        </DetailCard>

        <DetailCard title="Vue globale utilisateurs">
          <p
            className="text-4xl font-extrabold"
            style={{ color: "#b1853c" }}
          >
            {stats.totalUsers}
          </p>
          <p className="mt-2 text-xs" style={{ color: "#43484f" }}>
            +{stats.newUsersLast30} nouveaux comptes sur les 30 derniers
            jours.
          </p>
        </DetailCard>
      </div>
    </div>
  );
}

/* ───────────── small UI components (same style as dashboard) ───────────── */

function StatCard(props: {
  title: string;
  value: string;
  subtitle?: string;
  children?: ReactNode;
  onClick?: () => void;
}) {
  const clickable = !!props.onClick;
  return (
    <div
      onClick={props.onClick}
      className={`
        p-6 rounded-3xl border shadow-md 
        flex flex-col justify-between
        transition-all
        ${clickable ? "cursor-pointer hover:shadow-xl hover:-translate-y-1" : ""}
      `}
      style={{
        backgroundColor: "#ffffffee",
        borderColor: "#e8e2d7",
      }}
    >
      <div>
        <h3
          className="text-sm font-semibold mb-1"
          style={{ color: "#2f4632" }}
        >
          {props.title}
        </h3>
        {props.subtitle && (
          <p className="text-xs mb-4" style={{ color: "#43484f" }}>
            {props.subtitle}
          </p>
        )}
      </div>
      <div className="mt-auto">
        {props.value && (
          <p
            className="text-3xl font-extrabold tracking-tight"
            style={{ color: "#b1853c" }}
          >
            {props.value}
          </p>
        )}
        {props.children}
      </div>
    </div>
  );
}

function TopListCard({ title, items }: { title: string; items: ItemStat[] }) {
  return (
    <div
      className="p-6 rounded-3xl border shadow-md"
      style={{
        backgroundColor: "#ffffffee",
        borderColor: "#e8e2d7",
      }}
    >
      <h3
        className="text-sm font-semibold mb-3"
        style={{ color: "#2f4632" }}
      >
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs" style={{ color: "#43484f" }}>
          Aucune donnée pour le moment.
        </p>
      ) : (
        <ul className="space-y-2 text-sm" style={{ color: "#43484f" }}>
          {items.map((it, i) => (
            <li
              key={it.id}
              className="flex justify-between items-center"
            >
              <div>
                <span className="font-semibold mr-1">
                  #{i + 1}
                </span>
                {it.name}
              </div>
              <div className="text-right text-xs">
                <div className="font-semibold">{it.count}</div>
                {it.extra && (
                  <div className="opacity-75">{it.extra}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="p-6 rounded-3xl border shadow-md"
      style={{
        backgroundColor: "#ffffffee",
        borderColor: "#e8e2d7",
      }}
    >
      <h3
        className="text-sm font-semibold mb-3"
        style={{ color: "#2f4632" }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

/* simple bar chart (CSS only, no extra lib) */
function BarChart({ data }: { data: TimeBucket[] }) {
  if (!data || data.length === 0) return null;
  const max = data.reduce((m, d) => Math.max(m, d.value), 0) || 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-3 h-36">
        {data.map((d) => {
          const ratio = d.value / max;
          return (
            <div
              key={d.label}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <div
                className="w-full rounded-t-2xl"
                style={{
                  height: `${ratio * 100}%`,
                  background:
                    "linear-gradient(135deg, #2f4632, #435f47)",
                  boxShadow: "0 3px 8px rgba(47,70,50,0.35)",
                }}
              />
              <span
                className="text-[11px] font-semibold"
                style={{ color: "#2f4632" }}
              >
                {d.value}
              </span>
              <span
                className="text-[10px] text-center leading-tight line-clamp-2"
                style={{ color: "#43484f" }}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailTabs({
  active,
  onChange,
  visiblePanels,
}: {
  active: PanelKey;
  onChange: (p: PanelKey) => void;
  visiblePanels: PanelKey[];
}) {
  const allTabs: { id: PanelKey; label: string }[] = [
    { id: "overview", label: "Vue globale" },
    { id: "reservations", label: "Réservations" },
    { id: "menu", label: "Carte & plats" },
    { id: "reclamations", label: "Réclamations" },
    { id: "users", label: "Utilisateurs" },
  ];

  const tabs = allTabs.filter((t) => visiblePanels.includes(t.id));

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`
              px-3 py-1.5 rounded-full text-xs font-semibold
              border transition-all
            `}
            style={{
              background: isActive
                ? "linear-gradient(135deg, #2f4632, #435f47)"
                : "#ffffff",
              color: isActive ? "#ffffff" : "#2f4632",
              borderColor: isActive ? "transparent" : "#e8e2d7",
              boxShadow: isActive
                ? "0 3px 10px rgba(47,70,50,0.35)"
                : "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
