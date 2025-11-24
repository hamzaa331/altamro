"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { signOut } from "firebase/auth";

import { db, auth } from "@/lib/firebase";
import RequireRole from "@/components/RequireRole";
import {
  DashboardShell,
  type DashboardAction,
} from "@/components/dashboard-shell";
import { useUserRole } from "@/hooks/useUserRole";

/* ---------- types ---------- */

type CommentDoc = {
  id: string;

  text?: string;
  created_at?: any;
  updated_at?: any;

  author_name?: string;
  author_user_ref?: any; // DocumentReference | null
  guest_id?: string;

  item_ref?: string; // ex: "/menu_items/salade-tunisienne"
  thread_ref?: string;
  parent_ref?: any; // DocumentReference | null
  depth?: number;

  like_count?: number;
  reply_count?: number;

  is_deleted?: boolean; // ✅ utilisé pour "masquer"
};

function refToString(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  // Firestore DocumentReference has .path
  if (typeof v.path === "string") return v.path;
  return "";
}

/* ========================================================= */
/*                      INNER CONTENT                        */
/* ========================================================= */

function CommentsInner() {
  const commentsCol = useMemo(() => collection(db, "item_comments"), []);

  const [comments, setComments] = useState<CommentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<
    "all" | "visible" | "hidden"
  >("all");
  const [depthFilter, setDepthFilter] = useState<
    "all" | "root" | "reply"
  >("all");

  /* ---- live load comments ---- */
  useEffect(() => {
    setLoading(true);
    setErr(null);

    const q = query(commentsCol, orderBy("created_at", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: CommentDoc[] = snap.docs.map((d) => {
  const x = d.data() as any;

  return {
    id: d.id,
    text: x.text ?? "",
    created_at: x.created_at,
    updated_at: x.updated_at,

    author_name: x.author_name ?? x.display_name ?? "",
    guest_id: x.guest_id ?? "",

    // ✅ normalize refs into strings
    item_ref: refToString(x.item_ref),
    thread_ref: refToString(x.thread_ref),
    parent_ref: refToString(x.parent_ref),
    author_user_ref: refToString(x.author_user_ref),

    depth: x.depth ?? 0,
    like_count: x.like_count ?? 0,
    reply_count: x.reply_count ?? 0,
    is_deleted: x.is_deleted ?? false,
  };
});

        setComments(list);
        setLoading(false);
      },
      (e) => {
        setErr(e.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [commentsCol]);

  /* ---- actions ---- */

  const toggleHidden = async (c: CommentDoc) => {
    try {
      const ref = doc(commentsCol, c.id);
      await updateDoc(ref, { is_deleted: !c.is_deleted });
      setComments((prev) =>
        prev.map((x) =>
          x.id === c.id ? { ...x, is_deleted: !c.is_deleted } : x
        )
      );
    } catch (e: any) {
      setErr(e.message || "Erreur lors de la mise à jour du commentaire.");
    }
  };

  const deleteComment = async (c: CommentDoc) => {
    if (
      !confirm(
        "Supprimer définitivement ce commentaire ? Cette action est irréversible."
      )
    )
      return;

    try {
      await deleteDoc(doc(commentsCol, c.id));
      setComments((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e: any) {
      setErr(e.message || "Erreur lors de la suppression.");
    }
  };

  /* ---- derived list ---- */

 const filtered = comments.filter((c) => {
  const q = search.trim().toLowerCase();

  const text = (c.text ?? "").toLowerCase();
  const author = (c.author_name ?? "").toLowerCase();
  const guest = (c.guest_id ?? "").toLowerCase();
  const item = (c.item_ref ?? "").toLowerCase();

  const inSearch =
    !q ||
    text.includes(q) ||
    author.includes(q) ||
    guest.includes(q) ||
    item.includes(q);

  const inVisibility =
    visibilityFilter === "all" ||
    (visibilityFilter === "visible" && !c.is_deleted) ||
    (visibilityFilter === "hidden" && c.is_deleted);

  const inDepth =
    depthFilter === "all" ||
    (depthFilter === "root" && (c.depth ?? 0) === 0) ||
    (depthFilter === "reply" && (c.depth ?? 0) > 0);

  return inSearch && inVisibility && inDepth;
});


  if (loading) return <div className="p-6">Chargement…</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold" style={{ color: "#2f4632" }}>
            Commentaires des utilisateurs
          </h1>
          <p className="text-sm mt-1" style={{ color: "#43484f" }}>
            Voir tous les avis/commentaires FlutterFlow et les gérer (masquer ou supprimer).
          </p>
        </div>
      </header>

      {err && (
        <div className="p-3 rounded-2xl bg-red-100 text-red-700 text-sm">
          {err}
        </div>
      )}

      {/* Search & filters */}
      <section className="bg-white border border-[#e4ded1] rounded-2xl px-4 py-3 shadow-sm flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex-1">
          <input
            className="w-full border border-[#e4ded1] rounded-xl px-3 py-2 text-sm bg-[#faf9f6]"
            placeholder="Rechercher par texte, auteur, guest_id ou item_ref…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3 text-xs md:text-sm flex-wrap">
          <label className="flex items-center gap-2">
            <span style={{ color: "#43484f" }}>Visibilité :</span>
            <select
              className="border border-[#e4ded1] rounded-xl px-2 py-1 bg-white"
              value={visibilityFilter}
              onChange={(e) =>
                setVisibilityFilter(e.target.value as typeof visibilityFilter)
              }
            >
              <option value="all">Toutes</option>
              <option value="visible">Visibles</option>
              <option value="hidden">Masquées</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span style={{ color: "#43484f" }}>Type :</span>
            <select
              className="border border-[#e4ded1] rounded-xl px-2 py-1 bg-white"
              value={depthFilter}
              onChange={(e) =>
                setDepthFilter(e.target.value as typeof depthFilter)
              }
            >
              <option value="all">Tous</option>
              <option value="root">Commentaires racine</option>
              <option value="reply">Réponses</option>
            </select>
          </label>

          <span className="text-[11px] text-gray-500">
            {filtered.length} / {comments.length} commentaire(s)
          </span>
        </div>
      </section>

      {/* list */}
      <section className="space-y-4">
        {filtered.length === 0 && (
          <p className="text-sm text-gray-500">
            Aucun commentaire ne correspond aux filtres.
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((c) => (
            <CommentCard
              key={c.id}
              c={c}
              onToggleHidden={() => toggleHidden(c)}
              onDelete={() => deleteComment(c)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/* ========================================================= */
/*                         CARD UI                           */
/* ========================================================= */

function CommentCard({
  c,
  onToggleHidden,
  onDelete,
}: {
  c: CommentDoc;
  onToggleHidden: () => void;
  onDelete: () => void;
}) {
  const author =
    c.author_name?.trim() ||
    (c.guest_id ? `Guest ${c.guest_id}` : "") ||
    "Utilisateur anonyme";

  const dateStr = c.created_at?.toDate
    ? c.created_at.toDate().toLocaleString()
    : c.created_at?.seconds
    ? new Date(c.created_at.seconds * 1000).toLocaleString()
    : "—";

  return (
    <div
      className="p-5 rounded-3xl border shadow-md flex flex-col gap-3 bg-white"
      style={{ borderColor: "#e8e2d7" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-bold" style={{ color: "#2f4632" }}>
            {author}
          </p>
          <p className="text-[11px]" style={{ color: "#43484f" }}>
            {dateStr}
          </p>
          {typeof c.item_ref === "string" && c.item_ref && (
  <p className="text-[11px] text-gray-500">
    item_ref: <span className="font-mono">{c.item_ref}</span>
  </p>
)}

          {(c.depth ?? 0) > 0 && (
            <p className="text-[10px] text-gray-400">
              Réponse • depth {c.depth}
            </p>
          )}
        </div>

        <span
          className="px-3 py-1 rounded-full text-[11px] font-semibold"
          style={{
            backgroundColor: c.is_deleted ? "#fbe9e9" : "#e2f3e5",
            color: c.is_deleted ? "#7a1f1f" : "#2f4632",
          }}
        >
          {c.is_deleted ? "Masqué" : "Visible"}
        </span>
      </div>

      <div
        className="text-sm whitespace-pre-wrap rounded-2xl p-3 border"
        style={{
          borderColor: "#e8e2d7",
          backgroundColor: "#faf9f6",
          color: "#111827",
          opacity: c.is_deleted ? 0.6 : 1,
        }}
      >
        {c.text || "— commentaire vide —"}
      </div>

      <div className="flex items-center justify-between text-xs mt-1">
        <div className="flex gap-3 text-gray-500">
          <span>❤️ {c.like_count ?? 0}</span>
          <span>💬 {c.reply_count ?? 0}</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onToggleHidden}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold shadow-sm"
            style={{
              backgroundColor: c.is_deleted ? "#2f4632" : "#b1853c",
              color: "#fff",
            }}
          >
            {c.is_deleted ? "Rendre visible" : "Masquer"}
          </button>

          <button
            onClick={onDelete}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
            style={{
              backgroundColor: "#fbe9e9",
              color: "#a42323",
            }}
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========================================================= */
/*                     PAGE + DASHBOARDSHELL                 */
/* ========================================================= */

export default function CommentsPage() {
  const r = useRouter();
  const { uid, role, loading: roleLoading } = useUserRole();

  const [userName, setUserName] = useState("Administrateur");
  const [userEmail, setUserEmail] = useState("contact@altamaro.com");

  useEffect(() => {
    if (!roleLoading && !uid) r.replace("/login");
  }, [roleLoading, uid, r]);

  useEffect(() => {
    if (!roleLoading && uid) {
      const au = auth.currentUser;
      if (au?.displayName) setUserName(au.displayName);
      if (au?.email) setUserEmail(au.email);

      const userRef = doc(db, "user", uid);
      getDoc(userRef).then((snap) => {
        if (!snap.exists()) return;
        const d = snap.data() as any;
        const n =
          d.display_name || `${d.Prnom || ""} ${d.nomFamille || ""}`.trim();
        if (n) setUserName(n);
        if (d.email) setUserEmail(d.email);
      });
    }
  }, [roleLoading, uid]);

  if (roleLoading || !uid || !role) {
    return <div className="p-6">Chargement…</div>;
  }

  // ⚠️ Ici on suppose que ton DashboardShell filtre déjà selon actions passées dans chaque page.
  // Donc on met juste la même liste que les autres pages.
  const allActions: DashboardAction[] = [
    { href: "/dashboard/statistics", title: "Statistiques", desc: "Vue d’ensemble, tops, activité", icon: "📊", section: "Analyse" },
    { href: "/dashboard/home", title: "Accueil", desc: "Contenu principal de l’app.", icon: "🏠", section: "Pages" },
    { href: "/dashboard/pages-common", title: "Interface Commune", desc: "Éléments partagés.", icon: "🧩", section: "Pages" },
    { href: "/dashboard/restaurant", title: "Page Restaurant", desc: "Textes, images & vidéos.", icon: "🏨", section: "Pages" },
    { href: "/dashboard/menu", title: "Menus", desc: "Sections & produits.", icon: "🍽️", section: "Carte & Produits" },
    { href: "/dashboard/menu/all", title: "Tous les Produits", desc: "Liste complète.", icon: "🛒", section: "Carte & Produits" },
    { href: "/dashboard/categories", title: "Catégories", desc: "Entrées, plats, desserts…", icon: "📂", section: "Carte & Produits" },
    { href: "/dashboard/reservations", title: "Réservations", desc: "Demandes clients.", icon: "📅", section: "Clients" },
    { href: "/dashboard/reclamations", title: "Réclamations", desc: "Messages & réclamations.", icon: "✉️", section: "Clients" },
    { href: "/dashboard/users", title: "Utilisateurs app", desc: "Profils, blocage & bannissement.", icon: "👤", section: "Clients" },

    // ✅ NOUVEAU
    { href: "/dashboard/comments", title: "Commentaires", desc: "Masquer ou supprimer.", icon: "💬", section: "Clients" },

    { href: "/dashboard/branding", title: "Branding & Réseaux", desc: "Logos et liens sociaux.", icon: "🎨", section: "Marque" },
    { href: "/dashboard/card", title: "Vidéos", desc: "Télécharger & gérer.", icon: "🎞️", section: "Marque" },
    { href: "/dashboard/administration", title: "Administration", desc: "Rôles & accès staff", icon: "🧑‍💼", section: "Administration" },
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
        userRole={role || undefined}
        actions={actions}
        onSignOut={async () => {
          await signOut(auth);
          r.replace("/login");
        }}
      >
        <CommentsInner />
      </DashboardShell>
    </RequireRole>
  );
}
