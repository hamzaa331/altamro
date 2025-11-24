// app/admin/home/page.tsx
"use client";


import { signOut } from "firebase/auth";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { db, auth } from "@/lib/firebase";
import {
  DashboardShell,
  type DashboardAction,
} from "@/components/dashboard-shell";
import RequireRole from "@/components/RequireRole";   // 🔹 NEW
import { useUserRole } from "@/hooks/useUserRole";    // 🔹 NEW


/* ───────────── Types & defaults ───────────── */

type HomeDoc = {
  hero_bg_image: string;
  hero_overlay_title: string;

  intro_title: string;
  intro_p1: string;
  intro_p2: string;
  halal_line1: string;
  halal_line2: string;

  chefs_title: string;
  chefs_body: string;

  desserts_title: string;
  desserts_body: string;
};

const EMPTY: HomeDoc = {
  hero_bg_image: "",
  hero_overlay_title: "",

  intro_title: "",
  intro_p1: "",
  intro_p2: "",
  halal_line1: "",
  halal_line2: "",

  chefs_title: "",
  chefs_body:
    "Laissez-vous surprendre par l’inspiration du moment avec notre sélection du Chef. Des créations raffinées, élaborées avec des produits frais de saison.",

  desserts_title: "",
  desserts_body:
    "Un final en douceur signé par notre chef pâtissier. Découvrez une sélection de créations sucrées élégantes et savoureuses.",
};

/* ───────────── Cloudinary helpers ───────────── */

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
  const marker = "/upload/";
  const i = url.indexOf(marker);
  return i === -1 ? url : url.replace(marker, `/upload/${transform}/`);
}

function toPlayableVideoUrl(url: string) {
  if (!url) return url;
  if (url.includes("res.cloudinary.com")) {
    return cl(url, "f_mp4,vc_h264,q_auto");
  }
  return url;
}

/* ───────────── Entities ───────────── */

type CategoryCard = {
  id: string;
  title: string;
  image_url: string;
  order: number;
  visible: boolean;
  page: number;
  pos: number;
};

type VideoItem = {
  id: string;
  url: string;
  order: number;
  visible: boolean;
};

type ImageCard2 = {
  id: string;
  image_url: string;
  order: number;
  visible: boolean;
  page: number;
  pos: number;
};

/* Page sizes */
const CATEGORY_PAGE_SIZE = 2;
const VIDEO_PAGE_SIZE = 1;
const CHEF_PAGE_SIZE = 2;
const DESSERT_PAGE_SIZE = 2;

/* Helpers */
function slugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ───────────── Outer page with DashboardShell ───────────── */

function HomeEditorPageInner() {
  const r = useRouter();
  const { uid, role, loading: roleLoading } = useUserRole();

  const [userName, setUserName] = useState("Utilisateur");
  const [userEmail, setUserEmail] = useState("contact@altamaro.com");

  // redirection si pas connecté
  useEffect(() => {
    if (!roleLoading && !uid) {
      r.replace("/login");
    }
  }, [roleLoading, uid, r]);

  // récupérer nom + email depuis Auth puis Firestore (/user/{uid})
  useEffect(() => {
    if (!roleLoading && uid) {
      const authUser = auth.currentUser;

      // valeurs par défaut depuis Auth
      if (authUser) {
        if (authUser.displayName) setUserName(authUser.displayName);
        if (authUser.email) setUserEmail(authUser.email);
      }

      // compléter/écraser avec le doc Firestore
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
      desc: "Structure de la page d’accueil.",
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
  // 🔥 Filtrage du menu en fonction du rôle
    // 🔥 Filtrage du menu en fonction du rôle
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
  } else if (role === "chef") {
    // (optionnel : si un jour tu redonnes accès au chef)
    const allowed = new Set<string>([
      "/dashboard/statistics",
      "/dashboard/menu",
      "/dashboard/menu/all",
      "/dashboard/categories",
    ]);
    actions = allActions.filter((a) => allowed.has(a.href));
  } else {
    actions = [];
  }

  return (
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
      <Inner />
    </DashboardShell>
  );
}

export default function HomeEditorPage() {
  return (
    <RequireRole allow={["admin", "responsable_pages"]}>
      <HomeEditorPageInner />
    </RequireRole>
  );
}



/* ───────────── Inner (Firestore + UI) ───────────── */

function Inner() {
  const pageRef = useMemo(() => doc(db, "home", "home"), []);

  const categoriesCol = useMemo(() => collection(db, "categories"), []);
  const categoryPagesCol = useMemo(
    () => collection(db, "index_categorie"),
    []
  );
  const productsCol = useMemo(() => collection(db, "products"), []);
  const productPagesCol = useMemo(
    () => collection(db, "product_pages"),
    []
  );

  const videosCol = useMemo(() => collection(db, "hero_videos"), []);
  const videoPagesCol = useMemo(() => collection(db, "hero_pages"), []);

  const chefCol = useMemo(() => collection(db, "chef_cards"), []);
  const chefPagesCol = useMemo(() => collection(db, "chef_pages"), []);

  const dessertCol = useMemo(
    () => collection(db, "dessert_cards"),
    []
  );
  const dessertPagesCol = useMemo(
    () => collection(db, "dessert_pages"),
    []
  );

  const [data, setData] = useState<HomeDoc>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [categories, setCategories] = useState<CategoryCard[]>([]);
  const [newCatTitle, setNewCatTitle] = useState("");
  const [newCatImage, setNewCatImage] = useState<File | null>(null);

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [newVideoFile, setNewVideoFile] = useState<File | null>(null);
  const [newVideoUrl, setNewVideoUrl] = useState("");

  const [chefs, setChefs] = useState<ImageCard2[]>([]);
  const [newChefImage, setNewChefImage] = useState<File | null>(null);

  const [desserts, setDesserts] = useState<ImageCard2[]>([]);
  const [newDessertImage, setNewDessertImage] =
    useState<File | null>(null);

  /* Tabs to reduce scroll */
  type Tab = "hero" | "intro" | "chef" | "desserts";
  const [activeTab, setActiveTab] = useState<Tab>("hero");

  /* ───────────── Subscriptions ───────────── */

  useEffect(() => {
    const unsubPage = onSnapshot(
      pageRef,
      (snap) => {
        setData(snap.exists() ? { ...EMPTY, ...(snap.data() as any) } : EMPTY);
        setDirty(false);
        setLoading(false);
      },
      (e) => {
        setErr(e.message);
        setLoading(false);
      }
    );

    const unsubCategories = onSnapshot(
      query(categoriesCol, orderBy("order", "asc")),
      (snap) =>
        setCategories(
          snap.docs.map((d, i) => {
            const x = d.data() as any;
            const ord = x.order ?? i;
            return {
              id: d.id,
              title: x.title ?? "",
              image_url: x.image_url ?? x.image ?? "",
              order: ord,
              visible: x.visible ?? true,
              page: x.page ?? Math.floor(ord / CATEGORY_PAGE_SIZE),
              pos: x.pos ?? ord % CATEGORY_PAGE_SIZE,
            };
          })
        ),
      (e) => setErr(e.message)
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

    const unsubDesserts = onSnapshot(
      query(dessertCol, orderBy("order", "asc")),
      (snap) =>
        setDesserts(
          snap.docs.map((d, i) => {
            const x = d.data() as any;
            const ord = x.order ?? i;
            return {
              id: d.id,
              image_url: x.image_url ?? x.image ?? "",
              order: ord,
              visible: x.visible ?? true,
              page: x.page ?? Math.floor(ord / DESSERT_PAGE_SIZE),
              pos: x.pos ?? ord % DESSERT_PAGE_SIZE,
            };
          })
        ),
      (e) => setErr(e.message)
    );

    return () => {
      unsubPage();
      unsubCategories();
      unsubVideos();
      unsubChefs();
      unsubDesserts();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ───────────── Page helpers (generic) ───────────── */

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
      const page = Math.floor(i / pageSize);
      const pos = i % pageSize;
      batch.update(doc(colRef, v.id), { page, pos });
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

  /* keep page docs synced (non-categories) */
  useEffect(() => {
    syncPagesByCount(
      videoPagesCol,
      videos.filter((v) => v.visible).length,
      VIDEO_PAGE_SIZE
    );
  }, [videos]);
  useEffect(() => {
    syncPagesByCount(
      chefPagesCol,
      chefs.filter((c) => c.visible).length,
      CHEF_PAGE_SIZE
    );
  }, [chefs]);
  useEffect(() => {
    syncPagesByCount(
      dessertPagesCol,
      desserts.filter((d) => d.visible).length,
      DESSERT_PAGE_SIZE
    );
  }, [desserts]);

  /* ───────────── Save / upload ───────────── */

  const saveAll = async () => {
    try {
      setBusy(true);
      await setDoc(pageRef, { ...EMPTY, ...data }, { merge: true });
      setDirty(false);
      setErr(null);
    } catch (e: any) {
      setErr(e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const upload = (f: File, kind: "image" | "video") =>
    uploadToCloudinary(f, kind);

  /* ───────────── Categories helpers ───────────── */

  async function deleteInChunks(qry: ReturnType<typeof query>) {
    while (true) {
      const snap = await getDocs(query(qry, limit(400)));
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  async function updateInChunksToNewRef(
    qry: ReturnType<typeof query>,
    field: string,
    newRef: any
  ) {
    while (true) {
      const snap = await getDocs(query(qry, limit(400)));
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach((d) =>
        batch.update(d.ref, {
          [field]: newRef,
        })
      );
      await batch.commit();
    }
  }

  const syncCategoryPagesByCount = async () => {
    const all = await getDocs(query(categoriesCol, orderBy("order", "asc")));
    const visibleCount = all.docs.filter(
      (d) => (d.data() as any).visible !== false
    ).length;
    await syncPagesByCount(categoryPagesCol, visibleCount, CATEGORY_PAGE_SIZE);
  };

  const recomputeCategoryPagesForVisible = async () =>
    recomputePagesForVisible(categoriesCol, CATEGORY_PAGE_SIZE);

  const renumberAllCategories = async () => {
    const snap = await getDocs(query(categoriesCol, orderBy("order", "asc")));
    const batch = writeBatch(db);
    snap.docs.forEach((d, i) => batch.update(d.ref, { order: i }));
    await batch.commit();
    await recomputeCategoryPagesForVisible();
    await syncCategoryPagesByCount();
  };

  const addCategory = async () => {
    if (!newCatTitle || !newCatImage)
      return setErr("Choose an image and enter a title.");
    try {
      setBusy(true);
      const url = await upload(newCatImage, "image");
      const id = slugify(newCatTitle);
      const catRef = doc(categoriesCol, id);

      await setDoc(
        catRef,
        {
          title: newCatTitle,
          image_url: url,
          image: url,
          order: categories.length,
          visible: true,
          page: 0,
          pos: 0,
        },
        { merge: true }
      );

      setNewCatTitle("");
      setNewCatImage(null);
      await renumberAllCategories();
    } catch (e: any) {
      setErr(e.message || "Add failed");
    } finally {
      setBusy(false);
    }
  };

  const moveCategory = async (from: number, to: number) => {
    if (to < 0 || to >= categories.length) return;
    const a = categories[from],
      b = categories[to];
    const batch = writeBatch(db);
    batch.update(doc(categoriesCol, a.id), { order: to });
    batch.update(doc(categoriesCol, b.id), { order: from });
    await batch.commit();
    await recomputeCategoryPagesForVisible();
    await syncCategoryPagesByCount();
  };

  const toggleCategory = async (c: CategoryCard) => {
    await updateDoc(doc(categoriesCol, c.id), {
      visible: !c.visible,
    });
    await recomputeCategoryPagesForVisible();
    await syncCategoryPagesByCount();
  };

  const delCategory = async (c: CategoryCard) => {
    const catRef = doc(categoriesCol, c.id);
    await deleteInChunks(
      query(productsCol, where("category_ref", "==", catRef))
    );
    await deleteInChunks(
      query(productPagesCol, where("category_ref", "==", catRef))
    );
    await deleteDoc(catRef);
    await renumberAllCategories();
  };

  const editCategory = (c: CategoryCard, t: string) =>
    updateDoc(doc(categoriesCol, c.id), { title: t });

  const replaceCategoryImage = async (c: CategoryCard, f: File) => {
    const url = await upload(f, "image");
    await updateDoc(doc(categoriesCol, c.id), {
      image_url: url,
      image: url,
    });
  };

  const renameIdToTitleSlug = async (c: CategoryCard) => {
    const newId = slugify(c.title);
    if (!newId || newId === c.id) return;
    setBusy(true);
    try {
      const oldRef = doc(categoriesCol, c.id);
      const snap = await getDoc(oldRef);
      const x = snap.data() as any;

      const newRef = doc(categoriesCol, newId);
      await setDoc(
        newRef,
        {
          title: x?.title ?? c.title,
          image_url: x?.image_url ?? c.image_url,
          image: x?.image_url ?? c.image_url,
          order: x?.order ?? c.order,
          visible: x?.visible ?? c.visible,
          page: x?.page ?? c.page,
          pos: x?.pos ?? c.pos,
        },
        { merge: true }
      );

      await updateInChunksToNewRef(
        query(productsCol, where("category_ref", "==", oldRef)),
        "category_ref",
        newRef
      );
      await updateInChunksToNewRef(
        query(productPagesCol, where("category_ref", "==", oldRef)),
        "category_ref",
        newRef
      );

      await deleteDoc(oldRef);
    } catch (e: any) {
      setErr(e.message || "Rename failed");
    } finally {
      setBusy(false);
    }
  };

  /* ───────────── CRUD: Hero videos ───────────── */

  const addVideo = async () => {
    if (!newVideoFile && !newVideoUrl.trim())
      return setErr("Upload a file or paste a URL.");
    try {
      setBusy(true);
      const raw = newVideoFile
        ? await upload(newVideoFile, "video")
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
      setErr(e.message || "Add video failed");
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
    await updateDoc(doc(videosCol, v.id), {
      visible: !v.visible,
    });
    await recomputePagesForVisible(videosCol, VIDEO_PAGE_SIZE);
  };
  const delVideo = async (v: VideoItem) => {
    await deleteDoc(doc(videosCol, v.id));
    await renumberAll(videosCol, VIDEO_PAGE_SIZE);
  };
  const editVideo = async (v: VideoItem, url: string) =>
    updateDoc(doc(videosCol, v.id), {
      url: toPlayableVideoUrl(url),
    });

  /* ───────────── CRUD: Chef cards ───────────── */

  const addChef = async () => {
    if (!newChefImage) return setErr("Choose an image.");
    try {
      setBusy(true);
      const url = await upload(newChefImage, "image");
      await addDoc(chefCol, {
        image_url: url,
        image: url,
        order: chefs.length,
        visible: true,
        page: 0,
        pos: 0,
      });
      setNewChefImage(null);
      await renumberAll(chefCol, CHEF_PAGE_SIZE);
    } catch (e: any) {
      setErr(e.message || "Add chef failed");
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

  const toggleChef = async (c: ImageCard2) => {
    await updateDoc(doc(chefCol, c.id), {
      visible: !c.visible,
    });
    await recomputePagesForVisible(chefCol, CHEF_PAGE_SIZE);
  };
  const delChef = async (c: ImageCard2) => {
    await deleteDoc(doc(chefCol, c.id));
    await renumberAll(chefCol, CHEF_PAGE_SIZE);
  };
  const replaceChefImage = async (c: ImageCard2, f: File) => {
    const url = await upload(f, "image");
    await updateDoc(doc(chefCol, c.id), {
      image_url: url,
      image: url,
    });
  };

  /* ───────────── CRUD: Dessert cards ───────────── */

  const addDessert = async () => {
    if (!newDessertImage) return setErr("Choose an image.");
    try {
      setBusy(true);
      const url = await upload(newDessertImage, "image");
      await addDoc(dessertCol, {
        image_url: url,
        image: url,
        order: desserts.length,
        visible: true,
        page: 0,
        pos: 0,
      });
      setNewDessertImage(null);
      await renumberAll(dessertCol, DESSERT_PAGE_SIZE);
    } catch (e: any) {
      setErr(e.message || "Add dessert failed");
    } finally {
      setBusy(false);
    }
  };

  const moveDessert = async (from: number, to: number) => {
    if (to < 0 || to >= desserts.length) return;
    const a = desserts[from],
      b = desserts[to];
    const batch = writeBatch(db);
    batch.update(doc(dessertCol, a.id), { order: to });
    batch.update(doc(dessertCol, b.id), { order: from });
    await batch.commit();
    await recomputePagesForVisible(dessertCol, DESSERT_PAGE_SIZE);
  };

  const toggleDessert = async (c: ImageCard2) => {
    await updateDoc(doc(dessertCol, c.id), {
      visible: !c.visible,
    });
    await recomputePagesForVisible(dessertCol, DESSERT_PAGE_SIZE);
  };
  const delDessert = async (c: ImageCard2) => {
    await deleteDoc(doc(dessertCol, c.id));
    await renumberAll(dessertCol, DESSERT_PAGE_SIZE);
  };
  const replaceDessertImage = async (c: ImageCard2, f: File) => {
    const url = await upload(f, "image");
    await updateDoc(doc(dessertCol, c.id), {
      image_url: url,
      image: url,
    });
  };

  /* ───────────── UI ───────────── */

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {/* Top header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#2f4632]">
            Page d’accueil
          </h1>
          <p className="text-sm text-[#43484f]">
            Gère le hero, les textes, les catégories et les sections Chef &
            Desserts.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={saveAll}
            disabled={busy || !dirty}
            className={`px-4 py-2 rounded-2xl text-sm font-semibold text-white ${
              busy || !dirty
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-[#2f4632] hover:bg-[#243527]"
            }`}
          >
            {busy ? "Saving…" : "Enregistrer"}
          </button>

          <button
            onClick={async () => {
              setBusy(true);
              try {
                await Promise.all([
                  renumberAllCategories(),
                  renumberAll(chefCol, CHEF_PAGE_SIZE),
                  renumberAll(dessertCol, DESSERT_PAGE_SIZE),
                  renumberAll(videosCol, VIDEO_PAGE_SIZE),
                ]);
              } finally {
                setBusy(false);
              }
            }}
            className="px-3 py-2 rounded-2xl text-sm bg-gray-100 hover:bg-gray-200"
          >
            Recompute layout
          </button>
        </div>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      {/* Tabs (to reduce scroll) */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        <TabButton
          label="Hero & Vidéos"
          active={activeTab === "hero"}
          onClick={() => setActiveTab("hero")}
        />
        <TabButton
          label="Intro & Catégories"
          active={activeTab === "intro"}
          onClick={() => setActiveTab("intro")}
        />
        <TabButton
          label="Sélection du chef"
          active={activeTab === "chef"}
          onClick={() => setActiveTab("chef")}
        />
        <TabButton
          label="Desserts"
          active={activeTab === "desserts"}
          onClick={() => setActiveTab("desserts")}
        />
      </div>

      {/* HERO TAB */}
      {activeTab === "hero" && (
        <div className="space-y-6">
          {/* Hero */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-[#2f4632]">
              0) Hero
            </h2>
            <div className="grid gap-4 md:grid-cols-3 border border-gray-200 rounded-2xl p-4 bg-white shadow-sm">
              <div className="space-y-2">
                <div className="text-sm text-gray-600">Background image</div>
                {data.hero_bg_image ? (
                  <img
                    src={cl(
                      data.hero_bg_image,
                      "f_auto,q_auto,w_1200,h_640,c_fill"
                    )}
                    className="w-full h-40 object-cover rounded-xl border border-gray-200"
                    alt=""
                  />
                ) : (
                  <div className="w-full h-40 rounded-xl border border-dashed border-gray-300 grid place-items-center text-xs text-gray-500">
                    No image
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    e.target.files?.[0] &&
                    (async () => {
                      setBusy(true);
                      try {
                        const url = await upload(
                          e.target.files![0],
                          "image"
                        );
                        setData((d) => ({
                          ...d,
                          hero_bg_image: url,
                        }));
                        setDirty(true);
                      } catch (e: any) {
                        setErr(e.message || "Upload failed");
                      } finally {
                        setBusy(false);
                      }
                    })()
                  }
                  className="text-xs"
                />
                <input
                  className="border border-gray-200 p-2 rounded-2xl w-full text-sm mt-1 focus:outline-none focus:ring-1 focus:ring-[#b1853c]"
                  placeholder="Image URL"
                  value={data.hero_bg_image}
                  onChange={(e) => {
                    setData((d) => ({
                      ...d,
                      hero_bg_image: e.target.value,
                    }));
                    setDirty(true);
                  }}
                />
              </div>

              <div className="md:col-span-2 grid gap-4">
                <LabeledInput
                  label="Overlay title (grand titre)"
                  value={data.hero_overlay_title}
                  onChange={(v) => {
                    setData((d) => ({ ...d, hero_overlay_title: v }));
                    setDirty(true);
                  }}
                  placeholder="Ex: Une expérience culinaire unique à Gammarth"
                />
              </div>
            </div>
          </section>

          {/* Hero videos */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-[#2f4632]">
              1) Hero vidéos (1 par page)
            </h2>

            <div className="border border-gray-200 rounded-2xl p-4 space-y-3 bg-white shadow-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-gray-600">
                    Upload vidéo
                  </span>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) =>
                      setNewVideoFile(e.target.files?.[0] ?? null)
                    }
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
              <button
                onClick={addVideo}
                disabled={busy || (!newVideoFile && !newVideoUrl.trim())}
                className={`px-4 py-2 rounded-2xl text-sm font-medium text-white ${
                  busy || (!newVideoFile && !newVideoUrl.trim())
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-[#2f4632] hover:bg-[#243527]"
                }`}
              >
                {busy ? "Adding…" : "Ajouter une vidéo"}
              </button>
            </div>

            <VideoList
              items={videos}
              onMove={moveVideo}
              onToggle={toggleVideo}
              onDelete={delVideo}
              onEditUrl={editVideo}
            />
            <p className="text-xs text-gray-500">
              Pages suivies dans la collection <code>hero_pages</code>.
            </p>
          </section>
        </div>
      )}

      {/* INTRO + CATEGORIES TAB */}
      {activeTab === "intro" && (
        <div className="space-y-6">
          {/* Intro */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-[#2f4632]">
              2) Intro (texte)
            </h2>
            <div className="grid gap-4 md:grid-cols-2 border border-gray-200 rounded-2xl p-4 bg-white shadow-sm">
              <LabeledInput
                label="Titre"
                value={data.intro_title}
                onChange={(v) => {
                  setData((d) => ({ ...d, intro_title: v }));
                  setDirty(true);
                }}
              />
              <LabeledInput
                label="Halal — Ligne 1"
                value={data.halal_line1}
                onChange={(v) => {
                  setData((d) => ({ ...d, halal_line1: v }));
                  setDirty(true);
                }}
              />
              <LabeledTextArea
                label="Paragraphe 1"
                rows={3}
                value={data.intro_p1}
                onChange={(v) => {
                  setData((d) => ({ ...d, intro_p1: v }));
                  setDirty(true);
                }}
              />
              <LabeledInput
                label="Halal — Ligne 2"
                value={data.halal_line2}
                onChange={(v) => {
                  setData((d) => ({ ...d, halal_line2: v }));
                  setDirty(true);
                }}
              />
              <LabeledTextArea
                label="Paragraphe 2"
                rows={2}
                value={data.intro_p2}
                onChange={(v) => {
                  setData((d) => ({ ...d, intro_p2: v }));
                  setDirty(true);
                }}
              />
            </div>
          </section>

          {/* Categories */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-[#2f4632]">
              2.1) Catégories (2 par page)
            </h2>

            <div className="border border-gray-200 rounded-2xl p-4 space-y-3 bg-white shadow-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <LabeledInput
                  label="Titre de catégorie (ID = slug)"
                  value={newCatTitle}
                  onChange={setNewCatTitle}
                />
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-gray-600">
                    Image
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      setNewCatImage(e.target.files?.[0] ?? null)
                    }
                    className="text-xs"
                  />
                </label>
              </div>
              <button
                onClick={addCategory}
                disabled={busy || !newCatTitle || !newCatImage}
                className={`px-4 py-2 rounded-2xl text-sm font-medium text-white ${
                  busy || !newCatTitle || !newCatImage
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-[#2f4632] hover:bg-[#243527]"
                }`}
              >
                {busy ? "Adding…" : "Ajouter une catégorie"}
              </button>
            </div>

            <div className="grid gap-3 max-h-[450px] overflow-y-auto pr-1">
              {categories.length === 0 && (
                <div className="text-sm text-gray-500">
                  Aucune catégorie.
                </div>
              )}
              {categories.map((c, idx) => (
                <div
                  key={c.id}
                  className="border border-gray-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3 bg-white shadow-sm"
                >
                  {c.image_url ? (
                    <img
                      src={cl(
                        c.image_url,
                        "f_auto,q_auto,w_120,h_80,c_fill"
                      )}
                      className="w-24 h-16 object-cover rounded-xl border border-gray-200"
                      alt=""
                    />
                  ) : (
                    <div className="w-24 h-16 bg-gray-50 rounded-xl border border-dashed border-gray-300 grid place-items-center text-xs text-gray-500">
                      No image
                    </div>
                  )}

                  <EditableInline
                    value={c.title || ""}
                    onSave={(t) => editCategory(c, t)}
                    label={`Titre (ordre ${c.order} • page ${c.page} • pos ${c.pos})`}
                  />

                  <label className="text-xs text-gray-600">
                    Image
                    <input
                      className="block mt-1 text-xs"
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        e.target.files?.[0] &&
                        replaceCategoryImage(c, e.target.files[0])
                      }
                    />
                  </label>

                  <label className="flex items-center gap-2 text-xs text-[#43484f]">
                    <input
                      type="checkbox"
                      checked={c.visible}
                      onChange={() => toggleCategory(c)}
                    />
                    Visible
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => moveCategory(idx, idx - 1)}
                      disabled={idx === 0}
                      className={`px-2 py-1 rounded-2xl text-xs ${
                        idx === 0
                          ? "bg-gray-200 cursor-not-allowed"
                          : "bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveCategory(idx, idx + 1)}
                      disabled={idx === categories.length - 1}
                      className={`px-2 py-1 rounded-2xl text-xs ${
                        idx === categories.length - 1
                          ? "bg-gray-200 cursor-not-allowed"
                          : "bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => delCategory(c)}
                      className="px-3 py-1 rounded-2xl text-xs font-medium bg-red-600 text-white hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>

                  <button
                    className="ml-auto px-3 py-1 rounded-2xl text-xs bg-amber-100 hover:bg-amber-200 text-amber-800"
                    onClick={() => renameIdToTitleSlug(c)}
                  >
                    ID = slug(titre)
                  </button>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-500">
              Enregistré dans <code>categories</code> • pages dans{" "}
              <code>index_categorie</code> • <code>product_pages</code>{" "}
              créées seulement s’il y a des produits.
            </p>
          </section>
        </div>
      )}

      {/* CHEF TAB */}
      {activeTab === "chef" && (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-[#2f4632]">
              3) Sélection du chef (2 par page)
            </h2>
            <div className="grid gap-4 md:grid-cols-2 border border-gray-200 rounded-2xl p-4 bg-white shadow-sm">
              <LabeledInput
                label="Titre"
                value={data.chefs_title}
                onChange={(v) => {
                  setData((d) => ({ ...d, chefs_title: v }));
                  setDirty(true);
                }}
              />
              <LabeledTextArea
                label="Texte"
                rows={5}
                value={data.chefs_body}
                onChange={(v) => {
                  setData((d) => ({ ...d, chefs_body: v }));
                  setDirty(true);
                }}
              />
            </div>

            <div className="border border-gray-200 rounded-2xl p-4 space-y-3 bg-white shadow-sm">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-gray-600">
                  Image
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    setNewChefImage(e.target.files?.[0] ?? null)
                  }
                  className="text-xs"
                />
              </label>
              <button
                onClick={addChef}
                disabled={busy || !newChefImage}
                className={`px-4 py-2 rounded-2xl text-sm font-medium text-white ${
                  busy || !newChefImage
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-[#2f4632] hover:bg-[#243527]"
                }`}
              >
                {busy ? "Adding…" : "Ajouter une image"}
              </button>
            </div>

            <ImageCardsList
              items={chefs}
              onMove={moveChef}
              onToggle={toggleChef}
              onDelete={delChef}
              onReplaceImage={replaceChefImage}
            />

            <p className="text-xs text-gray-500">
              Pages dans la collection <code>chef_pages</code>.
            </p>
          </section>
        </div>
      )}

      {/* DESSERTS TAB */}
      {activeTab === "desserts" && (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-[#2f4632]">
              4) Desserts (2 par page)
            </h2>

            <div className="grid gap-4 md:grid-cols-2 border border-gray-200 rounded-2xl p-4 bg-white shadow-sm">
              <LabeledInput
                label="Titre"
                value={data.desserts_title}
                onChange={(v) => {
                  setData((d) => ({ ...d, desserts_title: v }));
                  setDirty(true);
                }}
              />
              <LabeledTextArea
                label="Texte"
                rows={5}
                value={data.desserts_body}
                onChange={(v) => {
                  setData((d) => ({ ...d, desserts_body: v }));
                  setDirty(true);
                }}
              />
            </div>

            <div className="border border-gray-200 rounded-2xl p-4 space-y-3 bg-white shadow-sm">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-gray-600">
                  Image
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    setNewDessertImage(e.target.files?.[0] ?? null)
                  }
                  className="text-xs"
                />
              </label>
              <button
                onClick={addDessert}
                disabled={busy || !newDessertImage}
                className={`px-4 py-2 rounded-2xl text-sm font-medium text-white ${
                  busy || !newDessertImage
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-[#2f4632] hover:bg-[#243527]"
                }`}
              >
                {busy ? "Adding…" : "Ajouter une image"}
              </button>
            </div>

            <ImageCardsList
              items={desserts}
              onMove={moveDessert}
              onToggle={toggleDessert}
              onDelete={delDessert}
              onReplaceImage={replaceDessertImage}
            />

            <p className="text-xs text-gray-500">
              Pages dans la collection <code>dessert_pages</code>.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

/* ───────────── Small components ───────────── */

function TabButton(props: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={props.onClick}
      className={`px-4 py-2 rounded-2xl text-sm font-medium ${
        props.active
          ? "bg-[#2f4632] text-white"
          : "bg-gray-100 text-[#43484f] hover:bg-gray-200"
      }`}
    >
      {props.label}
    </button>
  );
}

function LabeledInput(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-gray-600">
        {props.label}
      </span>
      <input
        className="border border-gray-200 p-2 rounded-2xl text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#b1853c]"
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
      <span className="text-xs font-medium text-gray-600">
        {props.label}
      </span>
      <textarea
        className="border border-gray-200 p-2 rounded-2xl text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#b1853c]"
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
        <span className="text-xs font-medium text-gray-600">
          {props.label}
        </span>
      )}
      <div className="flex gap-2">
        <input
          className="border border-gray-200 p-2 rounded-2xl w-full text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#b1853c]"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={!editing}
        />
        {!editing ? (
          <button
            className="px-3 py-2 rounded-2xl text-xs bg-gray-100 hover:bg-gray-200"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        ) : (
          <>
            <button
              className="px-3 py-2 rounded-2xl text-xs font-medium bg-[#2f4632] hover:bg-[#243527] text-white"
              onClick={() => {
                props.onSave(val);
                setEditing(false);
              }}
            >
              Save
            </button>
            <button
              className="px-3 py-2 rounded-2xl text-xs bg-gray-100 hover:bg-gray-200"
              onClick={() => {
                setVal(props.value);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function VideoList(props: {
  items: VideoItem[];
  onMove: (from: number, to: number) => any;
  onToggle: (v: VideoItem) => any;
  onDelete: (v: VideoItem) => any;
  onEditUrl: (v: VideoItem, url: string) => any;
}) {
  return (
    <div className="grid gap-3 max-h-[450px] overflow-y-auto pr-1">
      {props.items.length === 0 && (
        <div className="text-sm text-gray-500">Aucune vidéo.</div>
      )}
      {props.items.map((v, idx) => (
        <div
          key={v.id}
          className="border border-gray-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3 bg-white shadow-sm"
        >
          <div className="w-full md:w-64">
            <video
              className="w-full rounded-xl border border-gray-200"
              src={v.url}
              controls
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Ordre {v.order}
            </p>
          </div>
          <EditableInline
            value={v.url}
            onSave={(u) => props.onEditUrl(v, u)}
            label="URL vidéo"
          />
          <div className="flex flex-col gap-2 items-start">
            <label className="flex items-center gap-2 text-xs text-[#43484f]">
              <input
                type="checkbox"
                checked={v.visible}
                onChange={() => props.onToggle(v)}
              />
              Visible
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => props.onMove(idx, idx - 1)}
                disabled={idx === 0}
                className={`px-2 py-1 rounded-2xl text-xs ${
                  idx === 0
                    ? "bg-gray-200 cursor-not-allowed"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                ↑
              </button>
              <button
                onClick={() => props.onMove(idx, idx + 1)}
                disabled={idx === props.items.length - 1}
                className={`px-2 py-1 rounded-2xl text-xs ${
                  idx === props.items.length - 1
                    ? "bg-gray-200 cursor-not-allowed"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                ↓
              </button>
              <button
                onClick={() => props.onDelete(v)}
                className="px-3 py-1 rounded-2xl text-xs font-medium bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ImageCardsList(props: {
  items: ImageCard2[];
  onMove: (from: number, to: number) => any;
  onToggle: (c: ImageCard2) => any;
  onDelete: (c: ImageCard2) => any;
  onReplaceImage: (c: ImageCard2, f: File) => any;
}) {
  return (
    <div className="grid gap-3 max-h-[450px] overflow-y-auto pr-1">
      {props.items.length === 0 && (
        <div className="text-sm text-gray-500">Aucun élément.</div>
      )}
      {props.items.map((c, idx) => (
        <div
          key={c.id}
          className="border border-gray-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3 bg-white shadow-sm"
        >
          {c.image_url ? (
            <img
              src={cl(
                c.image_url,
                "f_auto,q_auto,w_120,h_80,c_fill"
              )}
              className="w-24 h-16 object-cover rounded-xl border border-gray-200"
              alt=""
            />
          ) : (
            <div className="w-24 h-16 bg-gray-50 rounded-xl border border-dashed border-gray-300 grid place-items-center text-xs text-gray-500">
              No image
            </div>
          )}
          <div className="flex-1 text-[11px] text-gray-500">
            ordre {c.order} • page {c.page} • pos {c.pos}
          </div>
          <label className="text-xs text-gray-600">
            Image
            <input
              className="block mt-1 text-xs"
              type="file"
              accept="image/*"
              onChange={(e) =>
                e.target.files?.[0] &&
                props.onReplaceImage(c, e.target.files[0])
              }
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-[#43484f]">
            <input
              type="checkbox"
              checked={c.visible}
              onChange={() => props.onToggle(c)}
            />
            Visible
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => props.onMove(idx, idx - 1)}
              disabled={idx === 0}
              className={`px-2 py-1 rounded-2xl text-xs ${
                idx === 0
                  ? "bg-gray-200 cursor-not-allowed"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              ↑
            </button>
            <button
              onClick={() => props.onMove(idx, idx + 1)}
              disabled={idx === props.items.length - 1}
              className={`px-2 py-1 rounded-2xl text-xs ${
                idx === props.items.length - 1
                  ? "bg-gray-200 cursor-not-allowed"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              ↓
            </button>
            <button
              onClick={() => props.onDelete(c)}
              className="px-3 py-1 rounded-2xl text-xs font-medium bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
