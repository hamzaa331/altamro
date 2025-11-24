// app/dashboard/categories/page.tsx
"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { db, auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";

import {
  DashboardShell,
  type DashboardAction,
} from "@/components/dashboard-shell";
import RequireRole from "@/components/RequireRole";   // 🔹 NEW
import { useUserRole } from "@/hooks/useUserRole";    // 🔹 NEW


import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  where,
  limit,
} from "firebase/firestore";

/* ───────── types ───────── */
type Category = {
  id: string; // document id (slug)
  title: string;
  image_url: string;
  order: number;
  visible: boolean;
  page: number;
  pos: number;
};

type VisibilityFilter = "all" | "visible" | "hidden";
type SortMode = "order" | "title_az" | "title_za";

/* ───────── constants ───────── */
const PAGE_SIZE = 2; // set to 1 if you also want one category per page

/* ───────── utils ───────── */
function slugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uploadToCloudinary(file: File) {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;
  const form = new FormData();
  form.append("upload_preset", preset);
  form.append("file", file);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
    { method: "POST", body: form }
  );
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

/* ───────── outer page with dashboard ───────── */

function CategoriesAdminPageInner() { 
  const r = useRouter();
  const { uid, role, loading: roleLoading } = useUserRole();
  const [userName, setUserName] = useState("Administrateur");
  const [userEmail, setUserEmail] = useState("contact@altamaro.com");


   // 🔐 Redirection si pas connecté ou pas de rôle
  useEffect(() => {
    if (!roleLoading && (!uid || !role)) {
      r.replace("/login");
    }
  }, [roleLoading, uid, role, r]);


    // 🧾 Récupérer le nom + email depuis Auth + collection "user"
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

  // 🔥 Filtrage du menu en fonction du rôle
  let actions: DashboardAction[] = [];

  if (role === "admin") {
    actions = allActions;
  } else if (role === "chef") {
    // 🧑‍🍳 Chef : uniquement Carte & Produits + Statistiques
    const allowed = new Set<string>([
      "/dashboard/statistics",
      "/dashboard/menu",
      "/dashboard/menu/all",
      "/dashboard/categories",
    ]);
    actions = allActions.filter((a) => allowed.has(a.href));
  } else {
    actions = []; // ne devrait pas arriver grâce à RequireRole
  }

    return (
    <DashboardShell
      uid={uid}
      userName={userName}
      userEmail={userEmail}
      actions={actions}
      userRole={role || undefined}   // ✅ cohérent avec les autres pages
      onSignOut={async () => {
        await signOut(auth);
        r.replace("/login");
      }}
    >
      <Inner />
    </DashboardShell>
  );
}

export default function CategoriesAdminPage() {
  return (
    <RequireRole allow={["admin", "chef"]}>
      <CategoriesAdminPageInner />
    </RequireRole>
  );
}



/* ───────── inner logic (fonctionnalité inchangée) ───────── */

function Inner() {
  // collections
  const categoriesCol = useMemo(() => collection(db, "categories"), []);
  const categoryPagesCol = useMemo(
    () => collection(db, "index_categorie"),
    []
  );
  // top-level related
  const productsCol = useMemo(() => collection(db, "products"), []);
  const productPagesCol = useMemo(
    () => collection(db, "product_pages"),
    []
  );

  const [items, setItems] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [newTitle, setNewTitle] = useState("");
  const [newImage, setNewImage] = useState<File | null>(null);

  // UI uniquement (search / filter / sort)
  const [search, setSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] =
    useState<VisibilityFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("order");

  /* live list */
  useEffect(() => {
    const unsub = onSnapshot(
      query(categoriesCol, orderBy("order", "asc")),
      (snap) => {
        setItems(
          snap.docs.map((d, idx) => {
            const x = d.data() as any;
            const ord = x.order ?? idx;
            return {
              id: d.id,
              title: x.title ?? "",
              image_url: x.image_url ?? x.image ?? "",
              order: ord,
              visible: x.visible ?? true,
              page: x.page ?? Math.floor(ord / PAGE_SIZE),
              pos: x.pos ?? ord % PAGE_SIZE,
            };
          })
        );
        setLoading(false);
      },
      (e) => {
        setErr(e.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [categoriesCol]);

  /* pagination helpers for categories (index_categorie) */
  const syncPagesByCount = async () => {
    const allSnap = await getDocs(
      query(categoriesCol, orderBy("order", "asc"))
    );
    const visibleCount = allSnap.docs.filter(
      (d) => (d.data() as any).visible !== false
    ).length;
    const maxPage =
      visibleCount > 0 ? Math.floor((visibleCount - 1) / PAGE_SIZE) : -1;

    const pagesSnap = await getDocs(categoryPagesCol);
    const have = new Set(pagesSnap.docs.map((d) => d.id));

    const batch = writeBatch(db);
    for (let i = 0; i <= maxPage; i++) {
      const id = String(i);
      if (!have.has(id)) batch.set(doc(categoryPagesCol, id), { index: i });
    }
    pagesSnap.docs.forEach((d) => {
      const idx = Number(d.id);
      if (idx > maxPage) batch.delete(d.ref);
    });
    await batch.commit();
  };

  const recomputePagesForVisible = async () => {
    const snap = await getDocs(
      query(categoriesCol, orderBy("order", "asc"))
    );
    const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const visible = docs.filter((d) => d.visible !== false);
    const batch = writeBatch(db);
    visible.forEach((v, i) => {
      const page = Math.floor(i / PAGE_SIZE);
      const pos = i % PAGE_SIZE;
      batch.update(doc(categoriesCol, v.id), { page, pos });
    });
    await batch.commit();
  };

  const renumberAll = async () => {
    const snap = await getDocs(
      query(categoriesCol, orderBy("order", "asc"))
    );
    const batch = writeBatch(db);
    snap.docs.forEach((d, i) => batch.update(d.ref, { order: i }));
    await batch.commit();
    await recomputePagesForVisible();
    await syncPagesByCount();
  };

  /* ---------- helpers for top-level cascade ---------- */

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
      snap.docs.forEach((d) => batch.update(d.ref, { [field]: newRef }));
      await batch.commit();
    }
  }

  /** Delete category + all related top-level docs */
  async function deleteCategoryCascade(slug: string) {
    const catRef = doc(db, "categories", slug);
    await deleteInChunks(
      query(productsCol, where("category_ref", "==", catRef))
    );
    await deleteInChunks(
      query(productPagesCol, where("category_ref", "==", catRef))
    );
    await deleteDoc(catRef);
  }

  /* ───────── CRUD (inchangé) ───────── */

  const addCategory = async () => {
    if (!newTitle || !newImage)
      return setErr("Choose an image and enter a title.");
    try {
      setBusy(true);
      const url = await uploadToCloudinary(newImage);
      const id = slugify(newTitle);
      const catRef = doc(categoriesCol, id);

      await setDoc(
        catRef,
        {
          title: newTitle,
          image_url: url,
          image: url,
          order: items.length,
          visible: true,
          page: 0,
          pos: 0,
        },
        { merge: true }
      );

      setNewTitle("");
      setNewImage(null);
      await renumberAll();
    } catch (e: any) {
      setErr(e.message || "Add category failed");
    } finally {
      setBusy(false);
    }
  };

  const editTitle = async (c: Category, title: string) =>
    updateDoc(doc(categoriesCol, c.id), { title });

  const replaceImage = async (c: Category, f: File) => {
    try {
      setBusy(true);
      const url = await uploadToCloudinary(f);
      await updateDoc(doc(categoriesCol, c.id), {
        image_url: url,
        image: url,
      });
    } catch (e: any) {
      setErr(e.message || "Replace image failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleVisible = async (c: Category) => {
    await updateDoc(doc(categoriesCol, c.id), { visible: !c.visible });
    await recomputePagesForVisible();
    await syncPagesByCount();
  };

  const move = async (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const a = items[from],
      b = items[to];
    const batch = writeBatch(db);
    batch.update(doc(categoriesCol, a.id), { order: to });
    batch.update(doc(categoriesCol, b.id), { order: from });
    await batch.commit();
    await recomputePagesForVisible();
    await syncPagesByCount();
  };

  const remove = async (c: Category) => {
    try {
      setBusy(true);
      await deleteCategoryCascade(c.id);
      await renumberAll();
    } catch (e: any) {
      setErr(e.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const renameIdToTitleSlug = async (c: Category) => {
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

  /* ───────── UI helpers: search / filter / sort (uniquement visuel) ───────── */

  if (loading) return <div className="p-6">Loading…</div>;

  const lowerSearch = search.trim().toLowerCase();

  let visibleList = items.filter((c) => {
    const matchesSearch =
      !lowerSearch ||
      c.title.toLowerCase().includes(lowerSearch) ||
      c.id.toLowerCase().includes(lowerSearch);
    const matchesVisibility =
      visibilityFilter === "all"
        ? true
        : visibilityFilter === "visible"
        ? c.visible
        : !c.visible;
    return matchesSearch && matchesVisibility;
  });

  const sortedList = [...visibleList].sort((a, b) => {
    if (sortMode === "title_az") {
      return a.title.localeCompare(b.title);
    }
    if (sortMode === "title_za") {
      return b.title.localeCompare(a.title);
    }
    // default: order (from Firestore)
    return a.order - b.order;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* HEADER */}
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1
            className="text-3xl font-extrabold"
            style={{ color: "#2f4632" }}
          >
            Catégories
          </h1>
          <p className="text-sm" style={{ color: "#43484f" }}>
            Gère les grandes familles de produits (entrées, plats, desserts,
            boissons…). L’ordre est utilisé pour la carte.
          </p>
        </div>

        <button
          onClick={renumberAll}
          className="px-4 py-2 rounded-xl text-sm font-semibold border border-[#e4ded1] bg-white hover:bg-[#faf9f6]"
        >
          Recalculer l’ordre & pages
        </button>
      </header>

      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl px-4 py-2">
          {err}
        </div>
      )}

      {/* BARRE search / filters / sort */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-white border border-[#e4ded1] rounded-2xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 flex-1">
          <input
            className="w-full border border-[#e4ded1] rounded-xl px-3 py-2 text-sm bg-[#faf9f6]"
            placeholder="Rechercher par titre ou ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm">
          <div className="flex items-center gap-1">
            <span className="text-[#43484f]">Filtrer :</span>
            <select
              className="border border-[#e4ded1] rounded-xl px-2 py-1 bg-white"
              value={visibilityFilter}
              onChange={(e) =>
                setVisibilityFilter(e.target.value as VisibilityFilter)
              }
            >
              <option value="all">Toutes</option>
              <option value="visible">Visibles</option>
              <option value="hidden">Masquées</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-[#43484f]">Trier par :</span>
            <select
              className="border border-[#e4ded1] rounded-xl px-2 py-1 bg-white"
              value={sortMode}
              onChange={(e) =>
                setSortMode(e.target.value as SortMode)
              }
            >
              <option value="order">Ordre (carte)</option>
              <option value="title_az">Titre A → Z</option>
              <option value="title_za">Titre Z → A</option>
            </select>
          </div>

          <span className="text-[11px] text-gray-500">
            {sortedList.length} / {items.length} catégorie(s)
          </span>
        </div>
      </div>

      {/* Add new */}
      <section className="bg-white border border-[#e4ded1] rounded-3xl p-5 space-y-3 shadow-sm">
        <h2
          className="text-lg font-semibold"
          style={{ color: "#2f4632" }}
        >
          Ajouter une catégorie
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-700">
              Titre (l’ID = slug automatique)
            </span>
            <input
              className="border border-[#e4ded1] bg-[#faf9f6] p-2 rounded-xl"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-700">Image</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                setNewImage(e.target.files?.[0] ?? null)
              }
            />
          </label>
        </div>
        <button
          onClick={addCategory}
          disabled={busy || !newTitle || !newImage}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white shadow"
          style={{
            backgroundColor:
              busy || !newTitle || !newImage ? "#9aa3a1" : "#2f4632",
          }}
        >
          {busy ? "Adding…" : "Ajouter la catégorie"}
        </button>
        <p className="text-xs text-gray-500">
          Enregistré dans <code>categories</code>. Les pages de catégories
          vivent dans <code>index_categorie</code>. Les{" "}
          <code>product_pages</code> sont créées seulement quand des
          produits existent.
        </p>
      </section>

      {/* List */}
      <section className="bg-white border border-[#e4ded1] rounded-3xl p-4 shadow-sm">
        {sortedList.length === 0 && (
          <div className="text-sm text-gray-600">
            Aucune catégorie pour ces critères.
          </div>
        )}

        <div className="space-y-3 max-h-[600px] overflow-auto pr-1">
          {sortedList.map((c) => {
            const originalIndex = items.findIndex((x) => x.id === c.id);
            const isFirst = originalIndex === 0;
            const isLast = originalIndex === items.length - 1;

            return (
              <div
                key={c.id}
                className="border border-[#e4ded1] rounded-2xl p-3 flex flex-col md:flex-row md:items-center gap-3 bg-[#faf9f6]"
              >
                {c.image_url ? (
                  <img
                    src={cl(
                      c.image_url,
                      "f_auto,q_auto,w_120,h_80,c_fill"
                    )}
                    className="w-24 h-16 object-cover rounded-xl"
                    alt=""
                  />
                ) : (
                  <div className="w-24 h-16 bg-[#f4f4f2] rounded-xl grid place-items-center text-xs text-gray-500">
                    No image
                  </div>
                )}

                <EditableInline
                  label={`Titre (ordre ${c.order} • page ${c.page} • pos ${c.pos})`}
                  value={c.title}
                  onSave={(t) => editTitle(c, t)}
                />

                <label className="text-xs md:text-sm text-gray-700">
                  Remplacer l’image
                  <input
                    className="block mt-1 text-xs"
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      e.target.files?.[0] &&
                      replaceImage(c, e.target.files[0])
                    }
                  />
                </label>

                <label className="flex items-center gap-2 text-xs md:text-sm">
                  <input
                    type="checkbox"
                    checked={c.visible}
                    onChange={() => toggleVisible(c)}
                  />{" "}
                  Visible
                </label>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => move(originalIndex, originalIndex - 1)}
                    disabled={isFirst}
                    className="px-2 py-1 rounded-lg border border-[#d4cec2] bg-white disabled:bg-[#e0e0dd]"
                    title="Monter (ordre réel)"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(originalIndex, originalIndex + 1)}
                    disabled={isLast}
                    className="px-2 py-1 rounded-lg border border-[#d4cec2] bg-white disabled:bg-[#e0e0dd]"
                    title="Descendre (ordre réel)"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => remove(c)}
                    className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs md:text-sm font-semibold hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>

                <button
                  className="ml-auto px-3 py-1 rounded-lg bg-amber-200 hover:bg-amber-300 text-xs md:text-sm"
                  onClick={() => renameIdToTitleSlug(c)}
                  title="Changer l’ID du document pour correspondre au slug du titre"
                >
                  ID = slug(titre)
                </button>

                <Link
                  href={`/dashboard/categories/${c.id}`}
                  className="px-3 py-1 rounded-lg bg-white border border-[#d4cec2] text-xs md:text-sm hover:bg-[#faf9f6]"
                >
                  Ouvrir
                </Link>
              </div>
            );
          })}
        </div>

        <p className="mt-2 text-[11px] text-gray-500">
          Tip : le tri (A→Z / Z→A) est purement visuel. Les flèches ↑/↓
          modifient l’ordre réel utilisé pour la carte et la pagination.
        </p>
      </section>
    </div>
  );
}

/* ───────── small inline editor ───────── */

function EditableInline(props: {
  label?: string;
  value: string;
  onSave: (v: string) => void;
}) {
  const [val, setVal] = useState(props.value);
  const [editing, setEditing] = useState(false);
  useEffect(() => setVal(props.value), [props.value]);

  return (
    <div className="flex flex-col gap-1 flex-1 text-sm">
      {props.label && (
        <span className="text-xs md:text-sm text-gray-600">
          {props.label}
        </span>
      )}
      <div className="flex gap-2">
        <input
          className="border border-[#e4ded1] bg-white p-2 rounded-xl w-full"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={!editing}
        />
        {!editing ? (
          <button
            className="px-3 py-2 rounded-xl bg-white border border-[#d4cec2] hover:bg-[#faf9f6] text-xs md:text-sm"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        ) : (
          <>
            <button
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs md:text-sm"
              onClick={() => {
                props.onSave(val);
                setEditing(false);
              }}
            >
              Save
            </button>
            <button
              className="px-3 py-2 rounded-xl bg-white border border-[#d4cec2] hover:bg-[#faf9f6] text-xs md:text-sm"
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
