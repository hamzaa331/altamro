// app/dashboard/reclamations/page.tsx
"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation"; 
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  getDoc,                                                 // 🔹 AJOUT
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { signOut } from "firebase/auth"; 
import {
  DashboardShell,
  type DashboardAction,
} from "@/components/dashboard-shell";
import RequireRole from "@/components/RequireRole";
import { useUserRole } from "@/hooks/useUserRole";


/* ---------- types ---------- */
type Reclamation = {
  id: string;
  titre?: string;
  text?: string;
  status?: "en cours" | "traité" | string;
  Reponse?: string;
  is_Repondre?: boolean;
  is_archived?: boolean;
  author_name?: string;
  contact_name?: string;
  contact_prenom?: string;
  contact_email?: string;
  contact_phone?: string;
  owner_key?: string;
  created_at?: any;
};

/* TAB NAMES */
const TAB_TO_TREAT = "to_treat";
const TAB_TREATED = "treated";
const TAB_ALL = "all";
const TAB_ARCHIVED = "archived";

/* ---------- Outer page with left dashboard ---------- */

export default function ReclamationsPage() {
  const r = useRouter();

  const { uid, role, loading: roleLoading } = useUserRole();   // 🔹 uid vient du hook

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
  href: "/dashboard/comments",
  title: "Commentaires",
  desc: "Masquer ou supprimer.",
  icon: "💬",
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
    "/dashboard/comments", // ✅ autoriser
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
  userRole={role || undefined}                 // 🔹 AJOUT
  onSignOut={async () => {
    await signOut(auth);
    r.replace("/login");                       // 🔹 Redirection après logout
  }}
>
  <ReclamationsAdminInner />
</DashboardShell>

    </RequireRole>
  );

}

/* ---------- Inner component (logic unchanged) ---------- */

function ReclamationsAdminInner() {
  const [all, setAll] = useState<Reclamation[]>([]);
  const [loading, setLoading] = useState(true);

  // ui state
  const [activeTab, setActiveTab] = useState<
    "to_treat" | "treated" | "all" | "archived"
  >(TAB_TO_TREAT);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "en cours" | "traité">(
    "all"
  );
  const [sortBy, setSortBy] = useState<"created_desc" | "created_asc" | "status">(
    "created_desc"
  );

  // local reply drafts
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  /* ---------- load from firestore ---------- */
  useEffect(() => {
    const q = query(
      collection(db, "reclamations"),
      orderBy("created_at", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const arr: Reclamation[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setAll(arr);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  /* ---------- helpers ---------- */

  async function confirmReply(r: Reclamation) {
    const draft = replyDrafts[r.id] ?? r.Reponse ?? "";
    if (!draft.trim()) {
      alert("Écris une réponse d’abord 🙂");
      return;
    }
    setSavingId(r.id);
    try {
      await updateDoc(doc(db, "reclamations", r.id), {
        Reponse: draft.trim(),
        is_Repondre: true,
        status: "traité",
        updated_at: serverTimestamp(),
      });
    } finally {
      setSavingId(null);
    }
  }

  async function markEnCours(r: Reclamation) {
    setSavingId(r.id);
    try {
      await updateDoc(doc(db, "reclamations", r.id), {
        status: "en cours",
        is_Repondre: false,
        updated_at: serverTimestamp(),
      });
    } finally {
      setSavingId(null);
    }
  }

  async function archiveRec(r: Reclamation, value: boolean) {
    setSavingId(r.id);
    try {
      await updateDoc(doc(db, "reclamations", r.id), {
        is_archived: value,
        updated_at: serverTimestamp(),
      });
    } finally {
      setSavingId(null);
    }
  }

  function setDraft(id: string, value: string) {
    setReplyDrafts((prev) => ({ ...prev, [id]: value }));
  }

  function matchSearch(r: Reclamation) {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (r.titre || "").toLowerCase().includes(s) ||
      (r.text || "").toLowerCase().includes(s) ||
      (r.contact_name || "").toLowerCase().includes(s) ||
      (r.contact_prenom || "").toLowerCase().includes(s) ||
      (r.author_name || "").toLowerCase().includes(s)
    );
  }

  /* ---------- build visible list ---------- */
  let visible = all;

  if (activeTab === TAB_TO_TREAT) {
    visible = visible.filter(
      (r) => r.is_archived !== true && (r.status || "en cours") === "en cours"
    );
  } else if (activeTab === TAB_TREATED) {
    visible = visible.filter(
      (r) => r.is_archived !== true && (r.status || "") === "traité"
    );
  } else if (activeTab === TAB_ALL) {
    visible = visible.filter((r) => r.is_archived !== true);
  } else if (activeTab === TAB_ARCHIVED) {
    visible = visible.filter((r) => r.is_archived === true);
  }

  if (statusFilter !== "all") {
    visible = visible.filter(
      (r) => (r.status || "en cours") === statusFilter && r.is_archived !== true
    );
  }

  visible = visible.filter(matchSearch);

  visible = [...visible];
  if (sortBy === "created_desc") {
    visible.sort(
      (a, b) =>
        (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)
    );
  } else if (sortBy === "created_asc") {
    visible.sort(
      (a, b) =>
        (a.created_at?.seconds || 0) - (b.created_at?.seconds || 0)
    );
  } else if (sortBy === "status") {
    visible.sort((a, b) => (a.status || "").localeCompare(b.status || ""));
  }

  const total = all.length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* header + filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#2f4632]">
            Réclamations
          </h1>
          <p className="text-sm text-[#43484f]">
            Gérez les messages, réponses et archivage des clients.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Total : {total} réclamation(s).
          </p>

          {/* tabs */}
          <div className="mt-4 flex flex-wrap gap-2">
            <TabButton
              active={activeTab === TAB_TO_TREAT}
              onClick={() => setActiveTab(TAB_TO_TREAT)}
            >
              À traiter
            </TabButton>
            <TabButton
              active={activeTab === TAB_TREATED}
              onClick={() => setActiveTab(TAB_TREATED)}
            >
              Traitées
            </TabButton>
            <TabButton
              active={activeTab === TAB_ALL}
              onClick={() => setActiveTab(TAB_ALL)}
            >
              Toutes
            </TabButton>
            <TabButton
              active={activeTab === TAB_ARCHIVED}
              onClick={() => setActiveTab(TAB_ARCHIVED)}
            >
              Archivées
            </TabButton>
          </div>
        </div>

        {/* right filters & search */}
        <div className="w-full md:w-[360px] bg-white border border-gray-200 rounded-2xl px-3 py-3 shadow-sm space-y-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par titre, nom, email…"
            className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-xs md:text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#b1853c]"
          />
          <div className="flex items-center gap-2 text-[11px] md:text-xs">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="border border-gray-200 rounded-xl px-2 py-1 bg-white flex-1 focus:outline-none focus:ring-1 focus:ring-[#b1853c]"
            >
              <option value="all">Tous statuts</option>
              <option value="en cours">en cours</option>
              <option value="traité">traité</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="border border-gray-200 rounded-xl px-2 py-1 bg-white flex-1 focus:outline-none focus:ring-1 focus:ring-[#b1853c]"
            >
              <option value="created_desc">Plus récent</option>
              <option value="created_asc">Plus ancien</option>
              <option value="status">Par statut</option>
            </select>
          </div>
        </div>
      </div>

      {/* list */}
      {loading ? (
        <div>Chargement…</div>
      ) : visible.length === 0 ? (
        <div className="text-sm text-gray-500">Aucun élément.</div>
      ) : (
        <div className="space-y-4">
          {visible.map((r) => {
            const draft = replyDrafts[r.id] ?? r.Reponse ?? "";
            const isTreated = (r.status || "") === "traité";
            const isArchived = r.is_archived === true;

            return (
              <div
                key={r.id}
                className="border border-gray-200 rounded-2xl p-4 space-y-3 bg-white shadow-sm"
              >
                {/* top line */}
                <div className="flex justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-sm md:text-base text-[#2f4632]">
                      {r.titre || "(Sans titre)"}
                      <span
                        className={`ml-2 text-[11px] md:text-xs px-2 py-0.5 rounded-full align-middle ${
                          isArchived
                            ? "bg-gray-200 text-gray-700"
                            : isTreated
                            ? "bg-[#2f4632]/10 text-[#2f4632]"
                            : "bg-[#b1853c]/10 text-[#b1853c]"
                        }`}
                      >
                        {isArchived ? "archivée" : r.status || "en cours"}
                      </span>
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {r.contact_prenom || r.contact_name || r.author_name || ""}
                      {r.contact_email ? " • " + r.contact_email : ""}
                      {r.contact_phone ? " • " + r.contact_phone : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-xs">
                    {isArchived ? (
                      <button
                        onClick={() => archiveRec(r, false)}
                        disabled={savingId === r.id}
                        className="px-3 py-1 rounded-xl bg-gray-100 hover:bg-gray-200 text-[#43484f]"
                      >
                        Désarchiver
                      </button>
                    ) : (
                      <button
                        onClick={() => archiveRec(r, true)}
                        disabled={savingId === r.id}
                        className="px-3 py-1 rounded-xl bg-gray-100 hover:bg-gray-200 text-[#43484f]"
                      >
                        Archiver
                      </button>
                    )}
                    {!isArchived && isTreated ? (
                      <button
                        onClick={() => markEnCours(r)}
                        disabled={savingId === r.id}
                        className="px-3 py-1 rounded-xl bg-white border border-[#b1853c]/40 text-[#b1853c]"
                      >
                        Remettre en cours
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* original message */}
                <div>
                  <p className="text-[11px] text-gray-500 mb-1">
                    Réclamation :
                  </p>
                  <p className="text-sm whitespace-pre-wrap text-[#43484f]">
                    {r.text || "(vide)"}
                  </p>
                </div>

                {/* reply area – disabled when archived */}
                {!isArchived && (
                  <div className="space-y-2">
                    <label className="text-[11px] text-gray-500">
                      Réponse admin :
                    </label>
                    <textarea
                      className="w-full border border-gray-200 rounded-xl p-2 text-sm bg-white text-[#43484f] focus:outline-none focus:ring-1 focus:ring-[#b1853c]"
                      rows={3}
                      value={draft}
                      onChange={(e) => setDraft(r.id, e.target.value)}
                      placeholder="Écrire la réponse…"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => confirmReply(r)}
                        disabled={savingId === r.id}
                        className={`px-4 py-2 rounded-2xl text-white ${
                          savingId === r.id
                            ? "bg-gray-400"
                            : "bg-[#2f4632] hover:bg-[#243527]"
                        }`}
                      >
                        {savingId === r.id
                          ? "Enregistrement…"
                          : "Confirmer la réponse"}
                      </button>
                      {!isTreated && (
                        <p className="text-[11px] text-gray-400">
                          Confirmer = statut → <b>traité</b> &nbsp;•{" "}
                          <b>is_Repondre = true</b>
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* show existing reply even if archived */}
                {isArchived && r.Reponse ? (
                  <div className="pt-3 border-t border-gray-200">
                    <p className="text-[11px] text-gray-500">
                      Réponse enregistrée :
                    </p>
                    <p className="text-sm whitespace-pre-wrap text-[#43484f]">
                      {r.Reponse}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-gray-500">
        Astuce : utilise les onglets pour passer rapidement de « À traiter »
        aux réclamations <b>traitées</b> ou <b>archivées</b>. La logique
        Firestore reste exactement la même (collection{" "}
        <code>reclamations</code>).
      </p>
    </div>
  );
}

/* small tab btn */
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-2xl text-xs md:text-sm border ${
        active
          ? "bg-[#2f4632] text-white border-[#2f4632]"
          : "bg-white border-gray-300 text-[#43484f] hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}
