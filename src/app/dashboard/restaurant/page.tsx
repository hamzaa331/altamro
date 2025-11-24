"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { signOut } from "firebase/auth";

import { db, auth } from "@/lib/firebase";
import {
  DashboardShell,
  type DashboardAction,
} from "@/components/dashboard-shell";
import RequireRole from "@/components/RequireRole";
import { useUserRole } from "@/hooks/useUserRole";


/* ------------- constants ------------- */
const COL_NAME = "Restaurant";
const MAIN_ID = "main";

// 2 per "page" for the grid like your FF page
const IMAGE_GRID_SIZE = 2;

/* ------------- types ------------- */
type RestaurantMain = {
  title1: string;
  text1: string;
  text2: string;
  text3: string;
  text4: string;
  text5: string;
  text6: string;
  title2: string;
  text7: string;
  imageA: string;
  imageB: string;
  titleimage: string;
  textimage1: string;
  textimage2: string;
  textimage3: string;
  title3: string;
  text8: string;
};

type FFVideo = {
  url: string;
  order: number;
  visible: boolean;
  page: number; // we will set = order so FF can filter "videopage == x"
};

type FFImage = {
  url: string;
  order: number;
  visible: boolean;
  page: number;
  pos: number;
};

const EMPTY_MAIN: RestaurantMain = {
  title1: "",
  text1: "",
  text2: "",
  text3: "",
  text4: "",
  text5: "",
  text6: "",
  title2: "",
  text7: "",
  imageA: "",
  imageB: "",
  titleimage: "",
  textimage1: "",
  textimage2: "",
  textimage3: "",
  title3: "",
  text8: "",
};

/* ------------- cloudinary helpers ------------- */
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

function toPlayableVideoUrl(url: string) {
  if (!url) return url;
  if (url.includes("res.cloudinary.com")) {
    const marker = "/upload/";
    const i = url.indexOf(marker);
    if (i === -1) return url;
    return url.replace(marker, `/upload/f_mp4,vc_h264,q_auto/`);
  }
  return url;
}

/* ------------- normalize helpers ------------- */

// videos: order = index, page = index  ✅
function normalizeVideos(list: FFVideo[]): FFVideo[] {
  return list.map((v, i) => ({
    ...v,
    order: i,
    page: i,
  }));
}

// images: auto page / pos
function normalizeImages(list: FFImage[]): FFImage[] {
  return list.map((img, i) => {
    const page = Math.floor(i / IMAGE_GRID_SIZE);
    const pos = i % IMAGE_GRID_SIZE;
    return {
      ...img,
      order: i,
      page,
      pos,
    };
  });
}

/* ------------- OUTER COMPONENT WITH DASHBOARD ------------- */

export default function RestaurantAdminPage() {
  const r = useRouter();
  const [userName, setUserName] = useState("Administrateur");
  const [userEmail, setUserEmail] = useState("contact@altamaro.com");
  const { uid, role, loading: roleLoading } = useUserRole();


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


    if (!uid || roleLoading || !role) {
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
  } else if (role === "responsable_pages") {
    // responsable_pages : Pages + Marque + Statistiques
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
        <RestaurantInner />
      </DashboardShell>
    </RequireRole>
  );


}

/* ------------- INNER CONTENT (ALL YOUR LOGIC) ------------- */

function RestaurantInner() {
  const [main, setMain] = useState<RestaurantMain>(EMPTY_MAIN);
  const [videos, setVideos] = useState<FFVideo[]>([]);
  const [images, setImages] = useState<FFImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // add fields
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [newVideoFile, setNewVideoFile] = useState<File | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const [newImageUrl, setNewImageUrl] = useState("");
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [uploadingImageA, setUploadingImageA] = useState(false);
  const [uploadingImageB, setUploadingImageB] = useState(false);

  // UI helpers: onglets + recherche / filtres / tri
  type TabKey = "texts" | "imagesAB" | "videos" | "gallery";
  const [tab, setTab] = useState<TabKey>("texts");

  const [videoSearch, setVideoSearch] = useState("");
  const [videoFilter, setVideoFilter] = useState<"all" | "visible" | "hidden">(
    "all"
  );
  const [videoSort, setVideoSort] = useState<"order" | "visibleFirst">(
    "order"
  );

  const [imageFilter, setImageFilter] = useState<"all" | "visible" | "hidden">(
    "all"
  );

  /* -------- load once ---------- */
  useEffect(() => {
    (async () => {
      const mainRef = doc(db, COL_NAME, MAIN_ID);
      const mainSnap = await getDoc(mainRef);

      const colSnap = await getDocs(collection(db, COL_NAME));

      const vids: FFVideo[] = [];
      const imgs: FFImage[] = [];

      colSnap.forEach((d) => {
        const id = d.id;
        const x = d.data() as any;
        if (id === MAIN_ID) return;

        if (x.videosUrl) {
  vids.push({
    url: toPlayableVideoUrl(x.videosUrl),
    order: x.videoorder ?? 0,
    visible: x.videovisible ?? true,
    page: x.videopage ?? 0,
  });
}

        if (x.image_url) {
          imgs.push({
            url: x.image_url,
            order: x.imageorder ?? 0,
            visible: x.imagevisible ?? true,
            page: x.imagepage ?? 0,
            pos: x.imagepos ?? 0,
          });
        }
      });

      const normV = normalizeVideos(vids);
      const normI = normalizeImages(imgs);

      if (mainSnap.exists()) {
        setMain({ ...EMPTY_MAIN, ...(mainSnap.data() as any) });
      } else {
        setMain(EMPTY_MAIN);
      }

      setVideos(normV);
      setImages(normI);
      setLoading(false);
    })();
  }, []);

  /* -------- save ---------- */
  async function saveAll() {
    if (saving) return;
    setSaving(true);
    setErr(null);
    try {
      // 1) save main
      const mainRef = doc(db, COL_NAME, MAIN_ID);
      await setDoc(mainRef, main, { merge: true });

      // 2) rewrite media docs with z_* ids
      const colRef = collection(db, COL_NAME);
      const snap = await getDocs(colRef);
      const batch = writeBatch(db);

      snap.docs.forEach((d) => {
        const id = d.id;
        if (id === MAIN_ID) return;
        if (id.startsWith("z_video_") || id.startsWith("z_image_")) {
          batch.delete(d.ref);
        }
      });

      const normV = normalizeVideos(videos);
      normV.forEach((v, i) => {
        const vRef = doc(db, COL_NAME, `z_video_${i}`);
        batch.set(vRef, {
          videosUrl: v.url,
          videovisible: v.visible,
          videoorder: v.order,
          videopage: v.page,
        });
      });

      const normI = normalizeImages(images);
      normI.forEach((img, i) => {
        const iRef = doc(db, COL_NAME, `z_image_${i}`);
        batch.set(iRef, {
          image_url: img.url,
          imagevisible: img.visible,
          imageorder: img.order,
          imagepage: img.page,
          imagepos: img.pos,
        });
      });

      await batch.commit();

      // 3) backup inside main
      await setDoc(
        mainRef,
        {
          videos: normV,
          images: normI,
        },
        { merge: true }
      );
    } catch (e: any) {
      setErr(e.message || "Échec de l’enregistrement");
    } finally {
      setSaving(false);
    }
  }

  /* -------- uploads for A/B ---------- */
  async function handleImageAFile(file: File) {
    setUploadingImageA(true);
    try {
      const url = await uploadToCloudinary(file, "image");
      setMain((m) => ({ ...m, imageA: url }));
    } finally {
      setUploadingImageA(false);
    }
  }

  async function handleImageBFile(file: File) {
    setUploadingImageB(true);
    try {
      const url = await uploadToCloudinary(file, "image");
      setMain((m) => ({ ...m, imageB: url }));
    } finally {
      setUploadingImageB(false);
    }
  }

  /* -------- video ops ---------- */
  async function addVideo() {
  let url = newVideoUrl.trim();

  if (!url && newVideoFile) {
    setUploadingVideo(true);
    try {
      const uploaded = await uploadToCloudinary(newVideoFile, "video");
      url = uploaded;
    } finally {
      setUploadingVideo(false);
    }
  }

  if (!url) return;

  // 🔹 Toujours normaliser avant d’enregistrer / afficher
  url = toPlayableVideoUrl(url);

  setVideos((old) =>
    normalizeVideos([...old, { url, order: 0, visible: true, page: 0 }])
  );
  setNewVideoUrl("");
  setNewVideoFile(null);
}


  function toggleVideo(idx: number) {
    setVideos((old) => {
      const arr = [...old];
      arr[idx] = { ...arr[idx], visible: !arr[idx].visible };
      return arr;
    });
  }

  function deleteVideo(idx: number) {
    setVideos((old) => normalizeVideos(old.filter((_, i) => i !== idx)));
  }

  /* -------- image ops ---------- */
  async function addImage() {
    let url = newImageUrl.trim();
    if (!url && newImageFile) {
      setUploadingImage(true);
      try {
        url = await uploadToCloudinary(newImageFile, "image");
      } finally {
        setUploadingImage(false);
      }
    }
    if (!url) return;
    setImages((old) =>
      normalizeImages([
        ...old,
        { url, order: 0, visible: true, page: 0, pos: 0 },
      ])
    );
    setNewImageUrl("");
    setNewImageFile(null);
  }

  function updateImage(idx: number, patch: Partial<FFImage>) {
    setImages((old) => {
      const arr = [...old];
      arr[idx] = { ...arr[idx], ...patch };
      return normalizeImages(arr);
    });
  }

  function deleteImage(idx: number) {
    setImages((old) => normalizeImages(old.filter((_, i) => i !== idx)));
  }

  /* ----- derived lists for recherche / filtres, en gardant les index réels ----- */

  const videoIndexList = useMemo(() => {
    let idxs = videos.map((_, i) => i);

    if (videoSearch.trim()) {
      const q = videoSearch.toLowerCase();
      idxs = idxs.filter((i) => videos[i].url.toLowerCase().includes(q));
    }

    if (videoFilter === "visible") {
      idxs = idxs.filter((i) => videos[i].visible);
    } else if (videoFilter === "hidden") {
      idxs = idxs.filter((i) => !videos[i].visible);
    }

    if (videoSort === "visibleFirst") {
      idxs.sort(
        (a, b) =>
          Number(videos[b].visible) - Number(videos[a].visible) ||
          videos[a].order - videos[b].order
      );
    } else {
      idxs.sort((a, b) => videos[a].order - videos[b].order);
    }

    return idxs;
  }, [videos, videoSearch, videoFilter, videoSort]);

  const imageIndexList = useMemo(() => {
    let idxs = images.map((_, i) => i);
    if (imageFilter === "visible") {
      idxs = idxs.filter((i) => images[i].visible);
    } else if (imageFilter === "hidden") {
      idxs = idxs.filter((i) => !images[i].visible);
    }
    // ordre naturel (order déjà normalisé)
    return idxs;
  }, [images, imageFilter]);

  /* ---------- UI ---------- */

  if (loading) return <div>Chargement…</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* HEADER */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1
            className="text-3xl font-extrabold"
            style={{ color: "#2f4632" }}
          >
            Page Restaurant
          </h1>
          <p className="text-sm" style={{ color: "#43484f" }}>
            Gérez tous les textes, images et vidéos de l’écran restaurant
            (collection <code>{COL_NAME}</code>, document <code>{MAIN_ID}</code>
            ).
          </p>
        </div>
        <button
          onClick={saveAll}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold shadow"
          style={{
            backgroundColor: saving ? "#9aa3a1" : "#2f4632",
            color: "#ffffff",
          }}
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>

      {err && (
        <div className="p-3 rounded-2xl bg-red-100 text-red-700 text-sm">
          {err}
        </div>
      )}

      {/* ONGLET NAV */}
      <div className="flex flex-wrap gap-2 rounded-2xl p-1 bg-white shadow-sm border border-[#e4ded1]">
        {[
          { key: "texts", label: "Textes principaux" },
          { key: "imagesAB", label: "Images A/B & textes" },
          { key: "videos", label: "Vidéos" },
          { key: "gallery", label: "Galerie d’images" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as TabKey)}
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

      {/* PANEL TEXTES PRINCIPAUX */}
      {tab === "texts" && (
        <section className="space-y-6">
          <div className="bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-6 space-y-4">
            <h2
              className="text-lg font-semibold"
              style={{ color: "#2f4632" }}
            >
              Bloc principal
            </h2>
            <p className="text-xs" style={{ color: "#43484f" }}>
              Textes affichés en haut de la page restaurant.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Titre 1"
                value={main.title1}
                onChange={(v) => setMain((m) => ({ ...m, title1: v }))}
              />
              <Input
                label="Texte 1"
                value={main.text1}
                onChange={(v) => setMain((m) => ({ ...m, text1: v }))}
              />
              <Input
                label="Texte 2"
                value={main.text2}
                onChange={(v) => setMain((m) => ({ ...m, text2: v }))}
              />
              <Input
                label="Texte 3"
                value={main.text3}
                onChange={(v) => setMain((m) => ({ ...m, text3: v }))}
              />
              <Input
                label="Texte 4"
                value={main.text4}
                onChange={(v) => setMain((m) => ({ ...m, text4: v }))}
              />
              <Input
                label="Texte 5"
                value={main.text5}
                onChange={(v) => setMain((m) => ({ ...m, text5: v }))}
              />
              <Input
                label="Texte 6"
                value={main.text6}
                onChange={(v) => setMain((m) => ({ ...m, text6: v }))}
              />
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-6 space-y-4">
            <h2
              className="text-lg font-semibold"
              style={{ color: "#2f4632" }}
            >
              Deuxième bloc
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Titre 2"
                value={main.title2}
                onChange={(v) => setMain((m) => ({ ...m, title2: v }))}
              />
              <Input
                label="Texte 7"
                value={main.text7}
                onChange={(v) => setMain((m) => ({ ...m, text7: v }))}
              />
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-6 space-y-4">
            <h2
              className="text-lg font-semibold"
              style={{ color: "#2f4632" }}
            >
              Dernier bloc
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Titre 3"
                value={main.title3}
                onChange={(v) => setMain((m) => ({ ...m, title3: v }))}
              />
              <Input
                label="Texte 8"
                value={main.text8}
                onChange={(v) => setMain((m) => ({ ...m, text8: v }))}
              />
            </div>
          </div>
        </section>
      )}

      {/* PANEL IMAGES A/B */}
      {tab === "imagesAB" && (
        <section className="bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-6 space-y-6">
          <h2 className="text-lg font-semibold" style={{ color: "#2f4632" }}>
            Bloc images A / B & textes associés
          </h2>
          <p className="text-xs" style={{ color: "#43484f" }}>
            Ces images sont utilisées dans la section centrale de la page
            restaurant.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Image A */}
            <label className="flex flex-col gap-2 text-sm">
              <span style={{ color: "#43484f" }}>Image A</span>
              {main.imageA && (
                <img
                  src={main.imageA}
                  className="w-full h-40 object-cover rounded-2xl"
                  alt=""
                />
              )}
              <input
                className="border rounded p-2 text-sm"
                value={main.imageA}
                onChange={(e) =>
                  setMain((m) => ({ ...m, imageA: e.target.value }))
                }
                placeholder="URL de l’image A"
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImageAFile(f);
                }}
                disabled={uploadingImageA}
                className="text-xs"
              />
              {uploadingImageA && (
                <span className="text-xs text-gray-400">
                  Téléversement...
                </span>
              )}
            </label>

            {/* Image B */}
            <label className="flex flex-col gap-2 text-sm">
              <span style={{ color: "#43484f" }}>Image B</span>
              {main.imageB && (
                <img
                  src={main.imageB}
                  className="w-full h-40 object-cover rounded-2xl"
                  alt=""
                />
              )}
              <input
                className="border rounded p-2 text-sm"
                value={main.imageB}
                onChange={(e) =>
                  setMain((m) => ({ ...m, imageB: e.target.value }))
                }
                placeholder="URL de l’image B"
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImageBFile(f);
                }}
                disabled={uploadingImageB}
                className="text-xs"
              />
              {uploadingImageB && (
                <span className="text-xs text-gray-400">
                  Téléversement...
                </span>
              )}
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Titre bloc image"
              value={main.titleimage}
              onChange={(v) => setMain((m) => ({ ...m, titleimage: v }))}
            />
            <Input
              label="Texte image 1"
              value={main.textimage1}
              onChange={(v) => setMain((m) => ({ ...m, textimage1: v }))}
            />
            <Input
              label="Texte image 2"
              value={main.textimage2}
              onChange={(v) => setMain((m) => ({ ...m, textimage2: v }))}
            />
            <Input
              label="Texte image 3"
              value={main.textimage3}
              onChange={(v) => setMain((m) => ({ ...m, textimage3: v }))}
            />
          </div>
        </section>
      )}

      {/* PANEL VIDEOS */}
      {tab === "videos" && (
        <section className="bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-6 space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2
                className="text-lg font-semibold"
                style={{ color: "#2f4632" }}
              >
                Vidéos du restaurant
              </h2>
              <p className="text-xs" style={{ color: "#43484f" }}>
                Ces vidéos sont utilisées pour la page restaurant (FlutterFlow
                lit les pages via <code>videopage</code>).
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                label="Rechercher"
                value={videoSearch}
                onChange={setVideoSearch}
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
                  <option value="visibleFirst">Visibles d’abord</option>
                </select>
              </label>
            </div>
          </div>

          {/* Ajout vidéo */}
          <div className="border border-[#e4ded1] rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <input
                className="border rounded p-2 flex-1 min-w-[200px] text-sm"
                placeholder="URL vidéo (https://...)"
                value={newVideoUrl}
                onChange={(e) => setNewVideoUrl(e.target.value)}
              />
              <input
                type="file"
                accept="video/*"
                onChange={(e) => setNewVideoFile(e.target.files?.[0] ?? null)}
                className="text-xs"
              />
              <button
                onClick={addVideo}
                className="px-3 py-2 rounded-lg text-sm font-semibold"
                style={{
                  backgroundColor: uploadingVideo ? "#9aa3a1" : "#2f4632",
                  color: "#ffffff",
                }}
                disabled={uploadingVideo}
              >
                {uploadingVideo ? "Téléversement..." : "Ajouter la vidéo"}
              </button>
            </div>
          </div>

          {/* Liste vidéos */}
          <div className="grid gap-4 lg:grid-cols-2">
            {videoIndexList.length === 0 && (
              <p className="text-sm text-gray-500">
                Aucune vidéo ne correspond au filtre.
              </p>
            )}

            {videoIndexList.map((idx) => {
  const v = videos[idx];
  const playableUrl = toPlayableVideoUrl(v.url);

  return (
    <div
      key={idx}
      className="rounded-2xl border border-[#e4ded1] p-4 bg-[#faf9f6] flex flex-col gap-3"
    >
      <div className="text-xs text-gray-500">
        ordre {v.order} • page {v.page}
      </div>

      {/* 🔹 Aperçu vidéo */}
      {playableUrl && (
        <video
          src={playableUrl}
          controls
          className="w-full rounded-2xl max-h-56 object-cover bg-black"
        />
      )}

      {/* 🔹 URL brute (toujours utile pour copier/coller) */}
      <p className="text-xs font-mono break-all bg-white rounded p-2 border border-[#e4ded1]">
        {v.url}
      </p>

      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={v.visible}
            onChange={() => toggleVideo(idx)}
          />
          Visible
        </label>
        <button
          onClick={() => deleteVideo(idx)}
          className="px-3 py-1 rounded bg-red-600 text-white font-semibold"
        >
          Supprimer
        </button>
      </div>
    </div>
  );
})}

          </div>
        </section>
      )}

      {/* PANEL GALERIE D’IMAGES */}
      {tab === "gallery" && (
        <section className="bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-6 space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2
                className="text-lg font-semibold"
                style={{ color: "#2f4632" }}
              >
                Galerie d’images (grille / PageView)
              </h2>
              <p className="text-xs" style={{ color: "#43484f" }}>
                Ces images sont affichées en grille, 2 par page (page / pos).
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col text-xs gap-1">
                <span style={{ color: "#43484f" }}>Filtre visibilité</span>
                <select
                  className="border rounded px-2 py-2 text-sm"
                  value={imageFilter}
                  onChange={(e) =>
                    setImageFilter(e.target.value as typeof imageFilter)
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
            <div className="flex flex-wrap gap-2 items-center">
              <input
                className="border rounded p-2 flex-1 min-w-[200px] text-sm"
                placeholder="URL de l’image (https://...)"
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setNewImageFile(e.target.files?.[0] ?? null)
                }
                className="text-xs"
              />
              <button
                onClick={addImage}
                className="px-3 py-2 rounded-lg text-sm font-semibold"
                style={{
                  backgroundColor: uploadingImage ? "#9aa3a1" : "#2f4632",
                  color: "#ffffff",
                }}
                disabled={uploadingImage}
              >
                {uploadingImage ? "Téléversement..." : "Ajouter l’image"}
              </button>
            </div>
          </div>

          {/* Liste images */}
          <div className="grid gap-4 lg:grid-cols-2">
            {imageIndexList.length === 0 && (
              <p className="text-sm text-gray-500">
                Aucune image ne correspond au filtre.
              </p>
            )}

            {imageIndexList.map((idx) => {
              const img = images[idx];
              return (
                <div
                  key={idx}
                  className="flex flex-col gap-3 rounded-2xl border border-[#e4ded1] p-4 bg-[#faf9f6]"
                >
                  <div className="flex items-center gap-4">
                    {img.url ? (
                      <img
                        src={img.url}
                        className="w-24 h-16 object-cover rounded-xl"
                        alt=""
                      />
                    ) : (
                      <div className="w-24 h-16 rounded-xl bg-[#f4f4f2]" />
                    )}
                    <div className="text-xs text-gray-500">
                      ordre {img.order} • page {img.page} • pos {img.pos}
                    </div>
                  </div>

                  <p className="text-xs font-mono break-all bg-white rounded p-2 border border-[#e4ded1]">
                    {img.url}
                  </p>

                  <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={img.visible}
                        onChange={() =>
                          updateImage(idx, { visible: !img.visible })
                        }
                      />
                      Visible
                    </label>
                    <button
                      onClick={() => deleteImage(idx)}
                      className="px-3 py-1 rounded bg-red-600 text-white font-semibold"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/* small input */
function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span style={{ color: "#43484f" }}>{label}</span>
      <input
        className="border rounded p-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
