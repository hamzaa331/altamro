// app/admin/interface-commun/page.tsx
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
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { signOut } from "firebase/auth";   // 🔹 ENLEVER onAuthStateChanged

import { db, auth } from "@/lib/firebase";
import {
  DashboardShell,
  type DashboardAction,
} from "@/components/dashboard-shell";

import RequireRole from "@/components/RequireRole";
import { useUserRole } from "@/hooks/useUserRole";

/* ========== TYPES ========== */

type CommonDoc = {
  hero_bg_image: string;
  hero_overlay_title: string;

  desserts_title: string;
  desserts_body: string;
};

type VideoItem = { id: string; url: string; order: number; visible: boolean };
type ChefCard = {
  id: string;
  image_url: string;
  order: number;
  visible: boolean;
  page: number;
  pos: number;
};

/* ========== CONSTANTES ========== */

// Document unique pour les champs scalaires
const ROOT = { col: "pages_common", id: "category_common" };

// Collections pour les listes
const COLS = {
  videos: "common_videos",
  video_pages: "common_videos_pages",
  chef_cards: "common_chef_cards",
  chef_pages: "common_chef_pages",
};

const VIDEO_PAGE_SIZE = 1;
const CHEF_PAGE_SIZE = 2;

const EMPTY: CommonDoc = {
  hero_bg_image: "",
  hero_overlay_title: "",
  desserts_title: "",
  desserts_body: "",
};

/** Map UI <-> Firestore */
const toDB = (d: CommonDoc) => ({
  common_bg_image: d.hero_bg_image,
  common_overlay_title: d.hero_overlay_title,
  common_chef_title: d.desserts_title,
  common_chef_description: d.desserts_body,
});
const fromDB = (x: any): CommonDoc => ({
  hero_bg_image: x?.common_bg_image ?? "",
  hero_overlay_title: x?.common_overlay_title ?? "",
  desserts_title: x?.common_chef_title ?? "",
  desserts_body: x?.common_chef_description ?? "",
});

/* ========== CLOUDINARY HELPERS ========== */

async function uploadToCloudinary(file: File, kind: "image" | "video") {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;
  if (!cloud || !preset) throw new Error("Cloudinary env vars missing");

  const endpoint =
    kind === "image"
      ? `https://api.cloudinary.com/v1_1/${cloud}/image/upload`
      : `https://api.cloudinary.com/v1_1/${cloud}/video/upload`;

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
  const mark = "/upload/";
  const i = url.indexOf(mark);
  return i === -1 ? url : url.replace(mark, `/upload/${transform}/`);
}
function toPlayableVideoUrl(url: string) {
  if (!url) return url;
  if (url.includes("res.cloudinary.com"))
    return cl(url, "f_mp4,vc_h264,q_auto");
  return url;
}

/* ========== PAGE AVEC DASHBOARD ========== */

export default function InterfaceCommunPage() {
  const r = useRouter();

  const { uid, role, loading: roleLoading } = useUserRole();

  const [userName, setUserName] = useState("Utilisateur");
  const [userEmail, setUserEmail] = useState("contact@altamaro.com");

  // 🔁 Redirection si pas connecté
  useEffect(() => {
    if (!roleLoading && !uid) {
      r.replace("/login");
    }
  }, [roleLoading, uid, r]);

  // 👤 Charger nom + email depuis Auth puis Firestore (/user/{uid})
  useEffect(() => {
    if (!roleLoading && uid) {
      const authUser = auth.currentUser;

      // Valeurs par défaut depuis Firebase Auth
      if (authUser) {
        if (authUser.displayName) setUserName(authUser.displayName);
        if (authUser.email) setUserEmail(authUser.email);
      }

      // Compléter depuis le document Firestore /user/{uid}
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
      desc: "Éléments partagés entre les pages.",
      icon: "🧩",
      section: "Pages",
    },
    {
      href: "/dashboard/restaurant",
      title: "Page Restaurant",
      desc: "Images & vidéos du restaurant.",
      icon: "🏨",
      section: "Pages",
    },

    {
      href: "/dashboard/menu",
      title: "Menus",
      desc: "Sections & produits.",
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
      desc: "Logos & liens sociaux.",
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
    actions = [];
  }



        return (
    <RequireRole allow={["admin", "responsable_pages"]}>
      <DashboardShell
        uid={uid}
      userName={userName}
      userEmail={userEmail}
      actions={actions}
      userRole={role || undefined}   // 🔸 ADD THIS LINE
      onSignOut={async () => {
        await signOut(auth);
        r.replace("/login");
      }}
      >
        <InnerInterfaceCommun />
      </DashboardShell>
    </RequireRole>
  );

}

/* ========== CONTENU INTERNE ========== */

function InnerInterfaceCommun() {
  // Références Firestore
  const pageRef = useMemo(() => doc(db, ROOT.col, ROOT.id), []);
  const videosCol = useMemo(() => collection(db, COLS.videos), []);
  const videoPagesCol = useMemo(() => collection(db, COLS.video_pages), []);
  const chefCol = useMemo(() => collection(db, COLS.chef_cards), []);
  const chefPagesCol = useMemo(() => collection(db, COLS.chef_pages), []);

  // États généraux
  const [data, setData] = useState<CommonDoc>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Vidéos
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [newVideoFile, setNewVideoFile] = useState<File | null>(null);
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [videoSearch, setVideoSearch] = useState("");
  const [videoFilter, setVideoFilter] = useState<"all" | "visible" | "hidden">(
    "all"
  );
  const [videoSort, setVideoSort] = useState<"order" | "visibleFirst">("order");

  // Cartes “chef”
  const [chefs, setChefs] = useState<ChefCard[]>([]);
  const [newChefImage, setNewChefImage] = useState<File | null>(null);
  const [chefFilter, setChefFilter] = useState<"all" | "visible" | "hidden">(
    "all"
  );

  // Onglets
  type TabKey = "hero" | "videos" | "chefText" | "chefImages";
  const [tab, setTab] = useState<TabKey>("hero");

  /* ---------- SUBSCRIPTIONS LIVE ---------- */
  useEffect(() => {
    const unsubPage = onSnapshot(
      pageRef,
      (snap) => {
        setData(snap.exists() ? fromDB(snap.data()) : EMPTY);
        setDirty(false);
        setLoading(false);
      },
      (e) => {
        setErr(e.message);
        setLoading(false);
      }
    );

    const unsubVideos = onSnapshot(
      query(videosCol, orderBy("order", "asc")),
      (snap) =>
        setVideos(
          snap.docs.map((d) => {
            const x = d.data() as any;
            return {
              id: d.id,
              url: x.url ?? "",
              order: x.order ?? 0,
              visible: x.visible ?? true,
            };
          })
        ),
      (e) => setErr(e.message)
    );

    const unsubChefs = onSnapshot(
      query(chefCol, orderBy("order", "asc")),
      (snap) =>
        setChefs(
          snap.docs.map((d, i) => {
            const x = d.data() as any;
            const ord = x.order ?? i;
            return {
              id: d.id,
              image_url: x.image_url ?? x.image ?? "",
              order: ord,
              visible: x.visible ?? true,
              page: x.page ?? Math.floor(ord / CHEF_PAGE_SIZE),
              pos: x.pos ?? ord % CHEF_PAGE_SIZE,
            };
          })
        ),
      (e) => setErr(e.message)
    );

    return () => {
      unsubPage();
      unsubVideos();
      unsubChefs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- HELPERS PAGINATION ---------- */

  const syncPagesByCount = async (
    pagesColRef: ReturnType<typeof collection>,
    countVisible: number,
    pageSize: number
  ) => {
    const maxPage =
      countVisible > 0 ? Math.floor((countVisible - 1) / pageSize) : -1;
    const pagesSnap = await getDocs(pagesColRef);
    const have = new Set(pagesSnap.docs.map((d) => Number(d.id)));
    const batch = writeBatch(db);

    for (let i = 0; i <= maxPage; i++)
      if (!have.has(i)) {
        batch.set(doc(pagesColRef, String(i)), { index: i });
      }
    pagesSnap.docs.forEach((d) => {
      const idx = Number(d.id);
      if (idx > maxPage) batch.delete(d.ref);
    });
    await batch.commit();
  };

  const recomputePagesForVisible = async (
    colRef: ReturnType<typeof collection>,
    pageSize: number
  ) => {
    const snap = await getDocs(query(colRef, orderBy("order", "asc")));
    const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const visible = docs.filter((d) => d.visible !== false);
    const batch = writeBatch(db);
    visible.forEach((v, i) => {
      batch.update(doc(colRef, v.id), {
        page: Math.floor(i / pageSize),
        pos: i % pageSize,
      });
    });
    await batch.commit();
  };

  const renumberAll = async (
    colRef: ReturnType<typeof collection>,
    pageSize: number
  ) => {
    const snap = await getDocs(query(colRef, orderBy("order", "asc")));
    const batch = writeBatch(db);
    snap.docs.forEach((d, i) => batch.update(d.ref, { order: i }));
    await batch.commit();
    await recomputePagesForVisible(colRef, pageSize);
  };

  useEffect(() => {
    syncPagesByCount(
      videoPagesCol,
      videos.filter((v) => v.visible).length,
      VIDEO_PAGE_SIZE
    );
  }, [videos, videoPagesCol]);

  useEffect(() => {
    syncPagesByCount(
      chefPagesCol,
      chefs.filter((c) => c.visible).length,
      CHEF_PAGE_SIZE
    );
  }, [chefs, chefPagesCol]);

  /* ---------- ENREGISTREMENT ---------- */

  const saveAll = async () => {
    try {
      setBusy(true);
      await setDoc(pageRef, toDB(data), { merge: true });
      setDirty(false);
      setErr(null);
    } catch (e: any) {
      setErr(e.message || "Échec de l’enregistrement");
    } finally {
      setBusy(false);
    }
  };

  /* ---------- VIDÉOS CRUD ---------- */

  const addVideo = async () => {
    if (!newVideoFile && !newVideoUrl.trim())
      return setErr("Ajoutez un fichier ou une URL vidéo.");
    try {
      setBusy(true);
      const raw = newVideoFile
        ? await uploadToCloudinary(newVideoFile, "video")
        : newVideoUrl.trim();
      const playable = toPlayableVideoUrl(raw);
      await addDoc(videosCol, {
        url: playable,
        order: videos.length,
        visible: true,
      });
      setNewVideoFile(null);
      setNewVideoUrl("");
      await renumberAll(videosCol, VIDEO_PAGE_SIZE);
    } catch (e: any) {
      setErr(e.message || "Erreur lors de l’ajout de la vidéo");
    } finally {
      setBusy(false);
    }
  };

  const moveVideo = async (from: number, to: number) => {
    if (to < 0 || to >= videos.length) return;
    const a = videos[from],
      b = videos[to];
    const batch = writeBatch(db);
    batch.update(doc(videosCol, a.id), { order: to });
    batch.update(doc(videosCol, b.id), { order: from });
    await batch.commit();
    await recomputePagesForVisible(videosCol, VIDEO_PAGE_SIZE);
  };

  const toggleVideo = async (v: VideoItem) => {
    await updateDoc(doc(videosCol, v.id), { visible: !v.visible });
    await recomputePagesForVisible(videosCol, VIDEO_PAGE_SIZE);
  };
  const delVideo = async (v: VideoItem) => {
    await deleteDoc(doc(videosCol, v.id));
    await renumberAll(videosCol, VIDEO_PAGE_SIZE);
  };
  const editVideoUrl = async (v: VideoItem, url: string) =>
    updateDoc(doc(videosCol, v.id), { url: toPlayableVideoUrl(url) });

  /* ---------- CHEF CARDS CRUD ---------- */

  const addChef = async () => {
    if (!newChefImage) return setErr("Choisissez une image.");
    try {
      setBusy(true);
      const url = await uploadToCloudinary(newChefImage, "image");
      await addDoc(chefCol, {
        image_url: url,
        image: url,
        order: chefs.length,
        page: 0,
        pos: 0,
        visible: true,
      });
      setNewChefImage(null);
      await renumberAll(chefCol, CHEF_PAGE_SIZE);
    } catch (e: any) {
      setErr(e.message || "Erreur lors de l’ajout de l’image");
    } finally {
      setBusy(false);
    }
  };

  const moveChef = async (from: number, to: number) => {
    if (to < 0 || to >= chefs.length) return;
    const a = chefs[from],
      b = chefs[to];
    const batch = writeBatch(db);
    batch.update(doc(chefCol, a.id), { order: to });
    batch.update(doc(chefCol, b.id), { order: from });
    await batch.commit();
    await recomputePagesForVisible(chefCol, CHEF_PAGE_SIZE);
  };

  const toggleChef = async (c: ChefCard) => {
    await updateDoc(doc(chefCol, c.id), { visible: !c.visible });
    await recomputePagesForVisible(chefCol, CHEF_PAGE_SIZE);
  };
  const delChef = async (c: ChefCard) => {
    await deleteDoc(doc(chefCol, c.id));
    await renumberAll(chefCol, CHEF_PAGE_SIZE);
  };
  const replaceChefImage = async (c: ChefCard, f: File) => {
    const url = await uploadToCloudinary(f, "image");
    await updateDoc(doc(chefCol, c.id), { image_url: url, image: url });
  };

  /* ---------- LISTES AVEC RECHERCHE / FILTRES ---------- */

  const filteredVideos = useMemo(() => {
    let v = [...videos];

    if (videoSearch.trim()) {
      const q = videoSearch.toLowerCase();
      v = v.filter((x) => x.url.toLowerCase().includes(q));
    }

    if (videoFilter === "visible") v = v.filter((x) => x.visible);
    if (videoFilter === "hidden") v = v.filter((x) => !x.visible);

    if (videoSort === "visibleFirst") {
      v.sort((a, b) => Number(b.visible) - Number(a.visible) || a.order - b.order);
    } else {
      v.sort((a, b) => a.order - b.order);
    }

    return v;
  }, [videos, videoSearch, videoFilter, videoSort]);

  const filteredChefs = useMemo(() => {
    let c = [...chefs];
    if (chefFilter === "visible") c = c.filter((x) => x.visible);
    if (chefFilter === "hidden") c = c.filter((x) => !x.visible);
    c.sort((a, b) => a.order - b.order);
    return c;
  }, [chefs, chefFilter]);

  /* ---------- UI ---------- */

  if (loading) return <div>Chargement des données…</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* HEADER */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1
            className="text-3xl font-extrabold"
            style={{ color: "#2f4632" }}
          >
            Interface Commune
          </h1>
          <p className="text-sm" style={{ color: "#43484f" }}>
            Contenu partagé entre toutes les pages de catégories.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={saveAll}
            disabled={busy || !dirty}
            className="px-4 py-2 rounded-lg text-sm font-semibold shadow"
            style={{
              backgroundColor: busy || !dirty ? "#9aa3a1" : "#2f4632",
              color: "#ffffff",
            }}
          >
            {busy ? "Enregistrement..." : "Enregistrer les modifications"}
          </button>

          <button
            onClick={async () => {
              setBusy(true);
              try {
                await Promise.all([
                  renumberAll(videosCol, VIDEO_PAGE_SIZE),
                  renumberAll(chefCol, CHEF_PAGE_SIZE),
                ]);
              } finally {
                setBusy(false);
              }
            }}
            className="px-4 py-2 rounded-lg text-sm font-semibold border"
            style={{
              backgroundColor: "#ffffff",
              borderColor: "#b1853c66",
              color: "#43484f",
            }}
          >
            Recalculer l’ordre
          </button>
        </div>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      {/* ONGLET NAV */}
      <div className="flex flex-wrap gap-2 rounded-2xl p-1 bg-white shadow-sm border border-[#e4ded1]">
        {[
          { key: "hero", label: "Hero & Image de fond" },
          { key: "videos", label: "Vidéos communes" },
          { key: "chefText", label: "Texte sélection du chef" },
          { key: "chefImages", label: "Images du chef" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={
              tab === t.key
                ? {
                    background:
                      "linear-gradient(135deg,#2f4632,#435f47)",
                    color: "#ffffff",
                    boxShadow: "0 3px 10px rgba(47,70,50,0.3)",
                  }
                : {
                    backgroundColor: "transparent",
                    color: "#43484f",
                  }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* PANELS */}
      {tab === "hero" && (
        <section className="grid gap-6 md:grid-cols-3 bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-6">
          <div className="md:col-span-1 space-y-3">
            <h2 className="text-lg font-semibold" style={{ color: "#2f4632" }}>
              Image de fond
            </h2>
            <p className="text-xs" style={{ color: "#43484f" }}>
              Cette image est utilisée comme fond pour les pages de catégories.
            </p>

            {data.hero_bg_image ? (
              <img
                src={cl(
                  data.hero_bg_image,
                  "f_auto,q_auto,w_1200,h_640,c_fill"
                )}
                className="w-full h-40 object-cover rounded-xl"
                alt="Hero"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-40 rounded-xl bg-[#f4f4f2] grid place-items-center text-xs text-gray-500">
                Aucune image sélectionnée
              </div>
            )}

            <input
              type="file"
              accept="image/*"
              className="text-xs"
              onChange={(e) =>
                e.target.files?.[0] &&
                (async () => {
                  setBusy(true);
                  try {
                    const url = await uploadToCloudinary(
                      e.target.files![0],
                      "image"
                    );
                    setData((d) => ({ ...d, hero_bg_image: url }));
                    setDirty(true);
                  } catch (e: any) {
                    setErr(e.message || "Erreur upload image");
                  } finally {
                    setBusy(false);
                  }
                })()
              }
            />
            <input
              className="border p-2 w-full rounded text-sm"
              placeholder="URL de l’image"
              value={data.hero_bg_image || ""}
              onChange={(e) => {
                setData((d) => ({ ...d, hero_bg_image: e.target.value }));
                setDirty(true);
              }}
            />
          </div>

          <div className="md:col-span-2 space-y-4">
            <LabeledInput
              label="Titre superposé (overlay)"
              value={data.hero_overlay_title}
              onChange={(v) => {
                setData((d) => ({ ...d, hero_overlay_title: v }));
                setDirty(true);
              }}
              placeholder="Ex : Découvrez notre sélection"
            />
          </div>
        </section>
      )}

      {tab === "videos" && (
        <section className="space-y-6 bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <h2
                className="text-lg font-semibold"
                style={{ color: "#2f4632" }}
              >
                Vidéos communes
              </h2>
              <p className="text-xs" style={{ color: "#43484f" }}>
                Ces vidéos sont utilisées dans l’interface commune des pages
                catégories (1 vidéo par page).
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <LabeledInput
                label="Rechercher"
                value={videoSearch}
                onChange={setVideoSearch}
                placeholder="Filtrer par URL..."
              />
              <label className="flex flex-col text-xs gap-1">
                <span style={{ color: "#43484f" }}>Filtre visibilité</span>
                <select
                  className="border rounded px-2 py-2 text-sm"
                  value={videoFilter}
                  onChange={(e) =>
                    setVideoFilter(e.target.value as typeof videoFilter)
                  }
                >
                  <option value="all">Toutes</option>
                  <option value="visible">Seulement visibles</option>
                  <option value="hidden">Masquées</option>
                </select>
              </label>
              <label className="flex flex-col text-xs gap-1">
                <span style={{ color: "#43484f" }}>Tri</span>
                <select
                  className="border rounded px-2 py-2 text-sm"
                  value={videoSort}
                  onChange={(e) =>
                    setVideoSort(e.target.value as typeof videoSort)
                  }
                >
                  <option value="order">Par ordre</option>
                  <option value="visibleFirst">
                    Visibles d’abord, puis ordre
                  </option>
                </select>
              </label>
            </div>
          </div>

          {/* Ajout vidéo */}
          <div className="border border-[#e4ded1] rounded-2xl p-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                <span style={{ color: "#43484f" }}>Télécharger une vidéo</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) =>
                    setNewVideoFile(e.target.files?.[0] ?? null)
                  }
                />
              </label>
              <LabeledInput
                label="Ou coller une URL"
                value={newVideoUrl}
                onChange={setNewVideoUrl}
                placeholder="https://..."
              />
            </div>
            <button
              onClick={addVideo}
              disabled={busy || (!newVideoFile && !newVideoUrl)}
              className="px-4 py-2 rounded-lg text-sm font-semibold shadow"
              style={{
                backgroundColor:
                  busy || (!newVideoFile && !newVideoUrl)
                    ? "#9aa3a1"
                    : "#2f4632",
                color: "#ffffff",
              }}
            >
              {busy ? "Ajout en cours..." : "Ajouter la vidéo"}
            </button>
          </div>

          {/* Liste vidéos */}
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredVideos.length === 0 && (
              <div className="text-sm text-gray-500">
                Aucune vidéo pour le moment.
              </div>
            )}

            {filteredVideos.map((v, idx) => (
              <div
                key={v.id}
                className="rounded-2xl border border-[#e4ded1] p-4 flex flex-col gap-3 bg-[#faf9f6]"
              >
                <video
                  className="w-full rounded-xl max-h-48"
                  src={v.url}
                  controls
                />

                <EditableInline
                  value={v.url}
                  onSave={(u) => editVideoUrl(v, u)}
                  label={`URL de la vidéo (ordre ${v.order})`}
                />

                <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={v.visible}
                      onChange={() => toggleVideo(v)}
                    />
                    Visible
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => moveVideo(idx, idx - 1)}
                      disabled={idx === 0}
                      className="px-2 py-1 rounded border text-xs"
                      style={{
                        backgroundColor:
                          idx === 0 ? "#e0e0dd" : "#ffffff",
                        borderColor: "#d4cec2",
                      }}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveVideo(idx, idx + 1)}
                      disabled={idx === filteredVideos.length - 1}
                      className="px-2 py-1 rounded border text-xs"
                      style={{
                        backgroundColor:
                          idx === filteredVideos.length - 1
                            ? "#e0e0dd"
                            : "#ffffff",
                        borderColor: "#d4cec2",
                      }}
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => delVideo(v)}
                      className="px-2 py-1 rounded text-xs font-semibold bg-red-600 text-white hover:bg-red-700"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-gray-500">
            Pagination vidéo stockée dans la collection{" "}
            <code>{COLS.video_pages}</code>.
          </p>
        </section>
      )}

      {tab === "chefText" && (
        <section className="bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-6 space-y-4">
          <h2 className="text-lg font-semibold" style={{ color: "#2f4632" }}>
            Texte “Sélection du chef”
          </h2>
          <p className="text-xs" style={{ color: "#43484f" }}>
            Ce texte est affiché sur toutes les pages qui montrent la sélection
            du chef.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <LabeledInput
              label="Titre"
              value={data.desserts_title}
              onChange={(v) => {
                setData((d) => ({ ...d, desserts_title: v }));
                setDirty(true);
              }}
              placeholder="Ex : La sélection du chef"
            />
            <LabeledTextArea
              label="Description"
              rows={5}
              value={data.desserts_body}
              onChange={(v) => {
                setData((d) => ({ ...d, desserts_body: v }));
                setDirty(true);
              }}
              placeholder="Texte d’introduction pour expliquer la sélection du chef..."
            />
          </div>
        </section>
      )}

      {tab === "chefImages" && (
        <section className="space-y-6 bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2
                className="text-lg font-semibold"
                style={{ color: "#2f4632" }}
              >
                Images du chef (2 par page)
              </h2>
              <p className="text-xs" style={{ color: "#43484f" }}>
                Ces cartes s’affichent par paires sur les pages avec la
                sélection du chef.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col text-xs gap-1">
                <span style={{ color: "#43484f" }}>Filtre visibilité</span>
                <select
                  className="border rounded px-2 py-2 text-sm"
                  value={chefFilter}
                  onChange={(e) =>
                    setChefFilter(e.target.value as typeof chefFilter)
                  }
                >
                  <option value="all">Toutes</option>
                  <option value="visible">Seulement visibles</option>
                  <option value="hidden">Masquées</option>
                </select>
              </label>
            </div>
          </div>

          {/* Ajout image */}
          <div className="border border-[#e4ded1] rounded-2xl p-4 space-y-3">
            <label className="flex flex-col gap-1 text-xs">
              <span style={{ color: "#43484f" }}>Nouvelle image</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setNewChefImage(e.target.files?.[0] ?? null)
                }
              />
            </label>
            <button
              onClick={addChef}
              disabled={busy || !newChefImage}
              className="px-4 py-2 rounded-lg text-sm font-semibold shadow"
              style={{
                backgroundColor: busy || !newChefImage ? "#9aa3a1" : "#2f4632",
                color: "#ffffff",
              }}
            >
              {busy ? "Ajout en cours..." : "Ajouter l’image"}
            </button>
          </div>

          {/* Liste images */}
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredChefs.length === 0 && (
              <div className="text-sm text-gray-500">
                Aucune image pour le moment.
              </div>
            )}

            {filteredChefs.map((c, idx) => (
              <div
                key={c.id}
                className="rounded-2xl border border-[#e4ded1] p-4 flex flex-col gap-3 bg-[#faf9f6]"
              >
                <div className="flex items-center gap-4">
                  {c.image_url ? (
                    <img
                      src={cl(
                        c.image_url,
                        "f_auto,q_auto,w_160,h_110,c_fill"
                      )}
                      className="w-32 h-20 object-cover rounded-xl"
                      alt=""
                    />
                  ) : (
                    <div className="w-32 h-20 bg-[#f4f4f2] rounded-xl grid place-items-center text-[11px] text-gray-500">
                      Aucune image
                    </div>
                  )}

                  <div className="text-xs text-gray-500">
                    Ordre {c.order} • Page {c.page} • Position {c.pos}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs flex flex-col gap-1">
                    <span>Remplacer l’image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        e.target.files?.[0] &&
                        replaceChefImage(c, e.target.files[0])
                      }
                    />
                  </label>

                  <div className="flex flex-col gap-2 text-xs">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={c.visible}
                        onChange={() => toggleChef(c)}
                      />
                      Visible
                    </label>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => moveChef(idx, idx - 1)}
                        disabled={idx === 0}
                        className="px-2 py-1 rounded border"
                        style={{
                          backgroundColor:
                            idx === 0 ? "#e0e0dd" : "#ffffff",
                          borderColor: "#d4cec2",
                        }}
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveChef(idx, idx + 1)}
                        disabled={idx === filteredChefs.length - 1}
                        className="px-2 py-1 rounded border"
                        style={{
                          backgroundColor:
                            idx === filteredChefs.length - 1
                              ? "#e0e0dd"
                              : "#ffffff",
                          borderColor: "#d4cec2",
                        }}
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => delChef(c)}
                        className="px-2 py-1 rounded bg-red-600 text-white font-semibold"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-gray-500">
            Pagination des cartes chef stockée dans{" "}
            <code>{COLS.chef_pages}</code>.
          </p>
        </section>
      )}
    </div>
  );
}

/* ========== INPUTS RÉUTILISABLES ========== */

function LabeledInput(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span style={{ color: "#43484f" }}>{props.label}</span>
      <input
        className="border p-2 rounded text-sm"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

function LabeledTextArea(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span style={{ color: "#43484f" }}>{props.label}</span>
      <textarea
        className="border p-2 rounded text-sm"
        rows={props.rows ?? 3}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

function EditableInline(props: {
  label?: string;
  value: string;
  onSave: (v: string) => void;
}) {
  const [val, setVal] = useState(props.value);
  const [editing, setEditing] = useState(false);

  useEffect(() => setVal(props.value), [props.value]);

  return (
    <div className="flex flex-col gap-1 flex-1">
      {props.label && (
        <span className="text-xs" style={{ color: "#43484f" }}>
          {props.label}
        </span>
      )}
      <div className="flex gap-2">
        <input
          className="border p-2 rounded w-full text-sm"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={!editing}
        />
        {!editing ? (
          <button
            className="px-3 py-2 rounded bg-[#e4ded1] text-xs font-semibold hover:bg-[#d8cfbd]"
            onClick={() => setEditing(true)}
          >
            Modifier
          </button>
        ) : (
          <>
            <button
              className="px-3 py-2 rounded text-xs font-semibold"
              style={{ backgroundColor: "#2f4632", color: "#ffffff" }}
              onClick={() => {
                props.onSave(val);
                setEditing(false);
              }}
            >
              Enregistrer
            </button>
            <button
              className="px-3 py-2 rounded bg-[#e4ded1] text-xs font-semibold hover:bg-[#d8cfbd]"
              onClick={() => {
                setVal(props.value);
                setEditing(false);
              }}
            >
              Annuler
            </button>
          </>
        )}
      </div>
    </div>
  );
}
