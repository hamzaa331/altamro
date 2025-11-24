// app/dashboard/card/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc, 
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import {
  DashboardShell,
  type DashboardAction,
} from "@/components/dashboard-shell";
import RequireRole from "@/components/RequireRole";       // 🔹 NEW
import { useUserRole } from "@/hooks/useUserRole";        // 🔹 NEW
import { db, auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";   // 🔸 no more onAuthStateChanged



/* ───────── Cloudinary helpers ───────── */

async function uploadToCloudinary(file: File) {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;
  if (!cloud || !preset) throw new Error("Cloudinary env vars missing");

  const endpoint = `https://api.cloudinary.com/v1_1/${cloud}/video/upload`;
  const form = new FormData();
  form.append("upload_preset", preset);
  form.append("file", file);

  const res = await fetch(endpoint, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Upload failed");
  return data.secure_url as string;
}

function cl(url: string, transform: string) {
  if (!url) return "";
  const marker = "/upload/";
  const i = url.indexOf(marker);
  return i === -1 ? url : url.replace(marker, `/upload/${transform}/`);
}
function toPlayableVideoUrl(url: string) {
  if (!url) return url;
  return url.includes("res.cloudinary.com") ? cl(url, "f_mp4,vc_h264,q_auto") : url;
}

/* ───────── Types & constants ───────── */

type VideoItem = {
  id: string;
  url: string;
  order: number;
  visible: boolean;
  page?: number; // 1 per page
  pos?: number;  // always 0
};

const VIDEO_PAGE_SIZE = 1; // exactly one visible video per page

/* ───────── Outer page with dashboard ───────── */

function CardVideosPageInner() {
  const r = useRouter();
  const { uid, role, loading: roleLoading } = useUserRole();

  const [userName, setUserName] = useState("Utilisateur");
  const [userEmail, setUserEmail] = useState("contact@altamaro.com");

  // rediriger vers /login si pas connecté
  useEffect(() => {
    if (!roleLoading && !uid) {
      r.replace("/login");
    }
  }, [roleLoading, uid, r]);

  // récupérer nom + email (Auth puis doc "user/{uid}") comme /dashboard
  useEffect(() => {
    if (!roleLoading && uid) {
      const authUser = auth.currentUser;

      if (authUser) {
        if (authUser.displayName) setUserName(authUser.displayName);
        if (authUser.email) setUserEmail(authUser.email);
      }

      const ref = doc(db, "user", uid);
      getDoc(ref).then((snap) => {
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
      desc: "Logo et liens sociaux.",
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
} else if (role === "responsable_pages") {
  // responsable_pages : uniquement Pages + Marque + Statistiques
  const allowed = new Set<string>([
    "/dashboard/statistics",
    "/dashboard/home",
    "/dashboard/pages-common",
    "/dashboard/restaurant",
    "/dashboard/branding",
    "/dashboard/card",
  ]);
  actions = allActions.filter((a) => allowed.has(a.href));
} else {
  actions = []; // (au cas où, mais normalement cette page est protégée par RequireRole)
}

  return (
    <DashboardShell
      uid={uid}
      userName={userName}
      userEmail={userEmail}
      actions={actions}
      userRole={role || undefined}
      onSignOut={async () => {
        await signOut(auth);
        r.replace("/login");
      }}
    >
      <CardVideosInner />
    </DashboardShell>
  );
}

export default function CardVideosPage() {
  return (
    <RequireRole allow={["admin", "responsable_pages"]}>
      <CardVideosPageInner />
    </RequireRole>
  );
}


/* ───────── Inner content (logique inchangée) ───────── */

function CardVideosInner() {
  // top-level collections
  const videosCol     = useMemo(() => collection(db, "card_videos"), []);
  const videoPagesCol = useMemo(() => collection(db, "card_video_pages"), []);

  const [items, setItems] = useState<VideoItem[]>([]);
  const [newVideoFile, setNewVideoFile] = useState<File | null>(null);
  const [newVideoUrl,  setNewVideoUrl]  = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // search / filter / sort (UI only)
  const [filterQuery, setFilterQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "visible" | "hidden">("all");
  const [sortBy, setSortBy] = useState<"order_asc" | "order_desc">("order_asc");

  /* live list */
  useEffect(() => {
    const unsub = onSnapshot(
      query(videosCol, orderBy("order","asc")),
      (snap) => {
        setItems(
          snap.docs.map((d, i) => {
            const x = d.data() as any;
            return {
              id: d.id,
              url: x.url ?? "",
              order: x.order ?? i,
              visible: x.visible ?? true,
              page: x.page,
              pos:  x.pos,
            } as VideoItem;
          })
        );
        setLoading(false);
      },
      (e) => { setErr(e.message); setLoading(false); }
    );
    return () => unsub();
  }, [videosCol]);

  /* ───────── paging helpers (identiques à ton code) ───────── */

  const syncPagesByCount = async () => {
    const vidsSnap = await getDocs(query(videosCol, orderBy("order","asc")));
    const visibleCount = vidsSnap.docs.filter(d => (d.data() as any).visible !== false).length;
    const maxPage = visibleCount > 0 ? Math.floor((visibleCount - 1) / VIDEO_PAGE_SIZE) : -1;

    const pagesSnap = await getDocs(videoPagesCol);
    const have = new Set(pagesSnap.docs.map(d => Number(d.id)));

    const batch = writeBatch(db);
    for (let i = 0; i <= maxPage; i++) if (!have.has(i)) {
      batch.set(doc(videoPagesCol, String(i)), { index: i });
    }
    pagesSnap.docs.forEach(d => {
      const idx = Number(d.id);
      if (idx > maxPage) batch.delete(d.ref);
    });
    await batch.commit();
  };

  const recomputePagesForVisible = async () => {
    const snap = await getDocs(query(videosCol, orderBy("order","asc")));
    const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const visible = docs.filter(d => d.visible !== false);

    const batch = writeBatch(db);
    visible.forEach((v, i) => {
      const page = Math.floor(i / VIDEO_PAGE_SIZE);
      const pos  = i % VIDEO_PAGE_SIZE;
      batch.update(doc(videosCol, v.id), { page, pos });
    });
    await batch.commit();

    await syncPagesByCount();
  };

  const renumberAll = async () => {
    const snap = await getDocs(query(videosCol, orderBy("order","asc")));
    const batch = writeBatch(db);
    snap.docs.forEach((d, i) => batch.update(d.ref, { order: i }));
    await batch.commit();
    await recomputePagesForVisible();
  };

  useEffect(() => { syncPagesByCount(); }, [items]);

  /* ───────── CRUD (inchangé) ───────── */

  const addVideo = async () => {
    if (!newVideoFile && !newVideoUrl.trim()) return setErr("Upload a file or paste a URL.");
    try {
      setBusy(true); setErr(null);
      const raw = newVideoFile ? (await uploadToCloudinary(newVideoFile)) : newVideoUrl.trim();
      const playable = toPlayableVideoUrl(raw);

      await addDoc(videosCol, {
        url: playable,
        order: items.length,
        visible: true,
        page: 0,
        pos: 0,
      });

      setNewVideoFile(null); setNewVideoUrl("");

      await renumberAll();
    } catch (e:any) {
      setErr(e.message || "Add video failed");
    } finally {
      setBusy(false);
    }
  };

  const moveVideo = async (from:number, to:number) => {
    if (to < 0 || to >= items.length) return;
    const a = items[from], b = items[to];
    const batch = writeBatch(db);
    batch.update(doc(videosCol, a.id), { order: to });
    batch.update(doc(videosCol, b.id), { order: from });
    await batch.commit();
    await recomputePagesForVisible();
  };

  const toggleVideo = async (v:VideoItem) => {
    await updateDoc(doc(videosCol, v.id), { visible: !v.visible });
    await recomputePagesForVisible();
  };

  const delVideo = async (v:VideoItem) => {
    await deleteDoc(doc(videosCol, v.id));
    await renumberAll();
  };

  const editUrl = async (v:VideoItem, url:string) => {
    await updateDoc(doc(videosCol, v.id), { url: toPlayableVideoUrl(url) });
  };

  /* ───────── search / filter / sort (UI only) ───────── */

  const q = filterQuery.trim().toLowerCase();
  let visibleItems = items;

  if (statusFilter === "visible") {
    visibleItems = visibleItems.filter((v) => v.visible);
  } else if (statusFilter === "hidden") {
    visibleItems = visibleItems.filter((v) => !v.visible);
  }

  if (q) {
    visibleItems = visibleItems.filter((v) =>
      v.url.toLowerCase().includes(q)
    );
  }

  visibleItems = [...visibleItems].sort((a, b) => {
    if (sortBy === "order_asc") return a.order - b.order;
    return b.order - a.order;
  });

  /* ───────── UI ───────── */

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* header + filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#2f4632]">
            Vidéos de la carte
          </h1>
          <p className="text-sm text-[#43484f]">
            1 vidéo visible par page dans la carte principale.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          <input
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Rechercher par URL…"
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#b1853c]"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#b1853c]"
          >
            <option value="all">Tous</option>
            <option value="visible">Visibles</option>
            <option value="hidden">Masqués</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#b1853c]"
          >
            <option value="order_asc">Ordre croissant</option>
            <option value="order_desc">Ordre décroissant</option>
          </select>
          <button
            onClick={renumberAll}
            className="px-4 py-2 rounded-2xl text-sm font-medium bg-gray-100 hover:bg-gray-200"
            title="Recompute order and page/pos"
          >
            Recompute layout
          </button>
        </div>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      {/* Add new */}
      <section className="border border-gray-200 rounded-2xl p-4 md:p-5 space-y-4 bg-white shadow-sm">
        <h2 className="text-lg font-semibold text-[#2f4632]">Ajouter une vidéo</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-gray-600">Upload fichier</span>
            <input
              type="file"
              accept="video/*"
              onChange={(e)=>setNewVideoFile(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
          </label>
          <LabeledInput
            label="Ou coller une URL"
            value={newVideoUrl}
            onChange={setNewVideoUrl}
            placeholder="https://…"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={addVideo}
            disabled={busy || (!newVideoFile && !newVideoUrl.trim())}
            className={`px-4 py-2 rounded-2xl text-sm font-medium text-white ${
              busy || (!newVideoFile && !newVideoUrl.trim())
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-[#2f4632] hover:bg-[#243527]"
            }`}
          >
            {busy ? "Adding…" : "Ajouter la vidéo"}
          </button>
          <p className="text-[11px] text-gray-400">
            Les documents sont sauvegardés dans <code>card_videos</code>.  
            Les pages <code>card_video_pages</code> sont créées/supprimées automatiquement.
          </p>
        </div>
      </section>

      {/* List */}
      <section className="space-y-3">
        {visibleItems.length === 0 && (
          <div className="text-sm text-gray-500">Aucune vidéo trouvée.</div>
        )}
        {visibleItems.map((v, idx)=>(
          <div
            key={v.id}
            className="border border-gray-200 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4 bg-white shadow-sm"
          >
            <div className="w-full md:w-64">
              <video
                className="w-full rounded-xl border border-gray-200"
                src={v.url}
                controls
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Ordre {v.order} • page {v.page ?? "-"} • pos {v.pos ?? "-"}
              </p>
            </div>

            <EditableInline
              value={v.url}
              onSave={(u)=>editUrl(v,u)}
              label="URL vidéo"
            />

            <div className="flex flex-col gap-2 items-start">
              <label className="flex items-center gap-2 text-xs text-[#43484f]">
                <input
                  type="checkbox"
                  checked={v.visible}
                  onChange={()=>toggleVideo(v)}
                />
                Visible
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={()=>moveVideo(idx, idx-1)}
                  disabled={idx===0}
                  className={`px-2 py-1 rounded-xl text-xs ${
                    idx===0
                      ? "bg-gray-200 cursor-not-allowed"
                      : "bg-gray-100 hover:bg-gray-200"
                  }`}
                >
                  ↑
                </button>
                <button
                  onClick={()=>moveVideo(idx, idx+1)}
                  disabled={idx===items.length-1}
                  className={`px-2 py-1 rounded-xl text-xs ${
                    idx===items.length-1
                      ? "bg-gray-200 cursor-not-allowed"
                      : "bg-gray-100 hover:bg-gray-200"
                  }`}
                >
                  ↓
                </button>
                <button
                  onClick={()=>delVideo(v)}
                  className="px-3 py-1 rounded-xl text-xs font-medium bg-red-600 text-white hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

/* Small inputs */

function LabeledInput(props:{
  label:string;
  value:string;
  onChange:(v:string)=>void;
  placeholder?:string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-gray-600">{props.label}</span>
      <input
        className="border border-gray-200 p-2 rounded-xl text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#b1853c]"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e)=>props.onChange(e.target.value)}
      />
    </label>
  );
}

function EditableInline(props:{ label?:string; value:string; onSave:(v:string)=>void }) {
  const [val, setVal] = useState(props.value);
  const [editing, setEditing] = useState(false);
  useEffect(()=>setVal(props.value),[props.value]);

  return (
    <div className="flex flex-col gap-1 flex-1">
      {props.label && (
        <span className="text-xs font-medium text-gray-600">{props.label}</span>
      )}
      <div className="flex gap-2">
        <input
          className="border border-gray-200 p-2 rounded-xl w-full text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#b1853c]"
          value={val}
          onChange={(e)=>setVal(e.target.value)}
          disabled={!editing}
        />
        {!editing ? (
          <button
            className="px-3 py-2 rounded-xl text-xs bg-gray-100 hover:bg-gray-200"
            onClick={()=>setEditing(true)}
          >
            Edit
          </button>
        ) : (
          <>
            <button
              className="px-3 py-2 rounded-xl text-xs font-medium bg-[#2f4632] hover:bg-[#243527] text-white"
              onClick={()=>{ props.onSave(val); setEditing(false); }}
            >
              Save
            </button>
            <button
              className="px-3 py-2 rounded-xl text-xs bg-gray-100 hover:bg-gray-200"
              onClick={()=>{ setVal(props.value); setEditing(false); }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
