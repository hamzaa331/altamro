// app/dashboard/categories/[slug]/page.tsx
"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  deleteDoc,
} from "firebase/firestore";

/* ---------- utils ---------- */

function cl(url: string, transform: string) {
  if (!url) return "";
  const marker = "/upload/";
  const i = url.indexOf(marker);
  return i === -1 ? url : url.replace(marker, `/upload/${transform}/`);
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

function normalizeSlug(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueDocIdForTitle(
  colRef: ReturnType<typeof collection>,
  title: string
) {
  const base = normalizeSlug(title) || `${Date.now()}`;
  let id = base,
    n = 2;
  while ((await getDoc(doc(colRef, id))).exists()) id = `${base}-${n++}`;
  return id;
}

/* ---------- types ---------- */

type Category = { title?: string; image_url?: string };
type Product = {
  id: string;
  title: string;
  image_url: string;
  order: number;
  visible: boolean;
  page: number;
  pos: number;
};

type VisibilityFilter = "all" | "visible" | "hidden";
type SortMode = "order" | "title_az" | "title_za";

/* ---------- outer page with dashboard ---------- */

function CategoryDetailPageInner() {
  const params = useParams<{ slug: string | string[] }>();
  const slugRaw = Array.isArray(params?.slug)
    ? params.slug[0]
    : params?.slug || "";
  const slug = decodeURIComponent(slugRaw);

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

  // 👤 Récupérer le nom + email depuis Auth + Firestore
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
    const allowed = new Set<string>([
      "/dashboard/statistics",
      "/dashboard/menu",
      "/dashboard/menu/all",
      "/dashboard/categories",
    ]);
    actions = allActions.filter((a) => allowed.has(a.href));
  }

  // ✅ NOW we can conditionally return
  if (roleLoading || !uid || !role) {
    return <div className="p-6">Chargement…</div>;
  }

  return (
    <RequireRole allow={["admin", "chef"]}>
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
        <Inner slug={slug} />
      </DashboardShell>
    </RequireRole>
  );
}


/* ---------- inner logic (Firestore logic unchanged) ---------- */

function Inner({ slug }: { slug: string }) {
  const norm = normalizeSlug(slug);

  // ONE item per page in the PageView
  const PAGE_SIZE = 1;

  const catRef = useMemo(() => doc(db, "categories", norm), [norm]);

  // TOP-LEVEL collections
  const productsCol = useMemo(() => collection(db, "products"), []);
  const productPagesCol = useMemo(
    () => collection(db, "product_pages"),
    []
  );

  const [category, setCategory] = useState<Category | null>(null);
  const [items, setItems] = useState<Product[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [newTitle, setNewTitle] = useState("");
  const [newImage, setNewImage] = useState<File | null>(null);

  // UI only: search / filter / sort
  const [search, setSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] =
    useState<VisibilityFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("order");

  // Live subscriptions
  useEffect(() => {
    const unsubCat = onSnapshot(catRef, (snap) =>
      setCategory((snap.data() as any) ?? {})
    );

    const q = query(
      productsCol,
      where("category_ref", "==", catRef),
      orderBy("order", "asc")
    );
    const unsubProd = onSnapshot(
      q,
      async (snap) => {
        const list = snap.docs.map((d, i) => {
          const x = d.data() as any;
          const ord = x.order ?? i;
          return {
            id: d.id,
            title: x.title ?? "",
            image_url: x.image_url ?? x.image ?? "",
            order: ord,
            visible: x.visible ?? true,
            page: x.page ?? Math.floor(ord / PAGE_SIZE),
            pos: x.pos ?? ord % PAGE_SIZE,
          };
        });
        setItems(list);
        setLoading(false);

        // create/delete product_pages based on the current snapshot
        await syncPagesByCount(list);
      },
      (e) => {
        setErr(e.message);
        setLoading(false);
      }
    );

    return () => {
      unsubCat();
      unsubProd();
    };
  }, [catRef, productsCol]);

  // ----- paging helpers -----

  /**
   * Create/delete docs in product_pages so that:
   *   - When there are N visible products, there are ceil(N / PAGE_SIZE) pages.
   *   - If no products, no pages.
   * Reads Firestore if currentItems is not provided, so it never depends on stale UI state.
   */
  const syncPagesByCount = async (currentItems?: Product[]) => {
    let visibleCount: number;

    if (currentItems) {
      visibleCount = currentItems.filter((i) => i.visible).length;
    } else {
      const snap = await getDocs(
        query(productsCol, where("category_ref", "==", catRef))
      );
      visibleCount = snap.docs.filter(
        (d) => (d.data() as any).visible !== false
      ).length;
    }

    const maxPage =
      visibleCount > 0 ? Math.floor((visibleCount - 1) / PAGE_SIZE) : -1;

    const pagesSnap = await getDocs(
      query(productPagesCol, where("category_ref", "==", catRef))
    );
    const have = new Set<number>(
      pagesSnap.docs.map((d) => (d.data() as any).index)
    );
    const batch = writeBatch(db);

    for (let i = 0; i <= maxPage; i++) {
      if (!have.has(i)) {
        batch.set(doc(productPagesCol, `${norm}_${i}`), {
          index: i,
          category_ref: catRef,
        });
      }
    }

    pagesSnap.docs.forEach((d) => {
      const idx = (d.data() as any).index;
      if (idx > maxPage) batch.delete(d.ref);
    });

    await batch.commit();
  };

  const recomputePagesForVisible = async () => {
    const snap = await getDocs(
      query(
        productsCol,
        where("category_ref", "==", catRef),
        orderBy("order", "asc")
      )
    );
    const visible = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((d) => d.visible !== false);
    const batch = writeBatch(db);
    visible.forEach((v, i) => {
      batch.update(doc(productsCol, v.id), {
        page: Math.floor(i / PAGE_SIZE),
        pos: i % PAGE_SIZE,
      });
    });
    await batch.commit();
  };

  const renumberAll = async () => {
    const snap = await getDocs(
      query(
        productsCol,
        where("category_ref", "==", catRef),
        orderBy("order", "asc")
      )
    );
    const batch = writeBatch(db);
    snap.docs.forEach((d, i) => batch.update(d.ref, { order: i }));
    await batch.commit();
    await recomputePagesForVisible();
    await syncPagesByCount(); // uses Firestore directly to compute visible count
  };

  // ----- CRUD (top-level products) -----

  const addItem = async () => {
    if (!newTitle || !newImage)
      return setErr("Enter a title and choose an image.");
    try {
      setBusy(true);
      const url = await uploadToCloudinary(newImage);
      const newId = await uniqueDocIdForTitle(productsCol, newTitle);

      await setDoc(
        doc(productsCol, newId),
        {
          category_ref: catRef,
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

      // Immediately recompute layout and pages
      await renumberAll();
      await syncPagesByCount(); // defensive extra call to ensure product_pages is created on the spot
    } catch (e: any) {
      setErr(e.message || "Add failed");
    } finally {
      setBusy(false);
    }
  };

  const editTitle = async (it: Product, title: string) =>
    updateDoc(doc(productsCol, it.id), { title });

  const replaceImage = async (it: Product, f: File) => {
    const url = await uploadToCloudinary(f);
    await updateDoc(doc(productsCol, it.id), {
      image_url: url,
      image: url,
    });
  };

  const toggleVisible = async (it: Product) => {
    await updateDoc(doc(productsCol, it.id), { visible: !it.visible });
    await recomputePagesForVisible();
    await syncPagesByCount();
  };

  const moveItem = async (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const a = items[from],
      b = items[to];
    const batch = writeBatch(db);
    batch.update(doc(productsCol, a.id), { order: to });
    batch.update(doc(productsCol, b.id), { order: from });
    await batch.commit();
    await recomputePagesForVisible();
    await syncPagesByCount();
  };

  const delItem = async (it: Product) => {
    await deleteDoc(doc(productsCol, it.id));
    await renumberAll();
  };

  if (loading) return <div className="p-6">Loading…</div>;

  /* ---- UI-only filtering / sorting ---- */
  const lowerSearch = search.trim().toLowerCase();

  let filtered = items.filter((p) => {
    const matchesSearch =
      !lowerSearch ||
      p.title.toLowerCase().includes(lowerSearch) ||
      p.id.toLowerCase().includes(lowerSearch);
    const matchesVisibility =
      visibilityFilter === "all"
        ? true
        : visibilityFilter === "visible"
        ? p.visible
        : !p.visible;
    return matchesSearch && matchesVisibility;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === "title_az") {
      return a.title.localeCompare(b.title);
    }
    if (sortMode === "title_za") {
      return b.title.localeCompare(a.title);
    }
    // default: by order (real order used for page layout)
    return a.order - b.order;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* HEADER : catégorie */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          {category?.image_url ? (
            <img
              src={cl(
                category.image_url,
                "f_auto,q_auto,w_160,h_120,c_fill"
              )}
              alt=""
              className="w-40 h-28 object-cover rounded-2xl"
            />
          ) : (
            <div className="w-40 h-28 rounded-2xl bg-[#f4f4f2] grid place-items-center text-xs text-gray-500">
              No image
            </div>
          )}
          <div>
            <h1
              className="text-3xl font-extrabold capitalize"
              style={{ color: "#2f4632" }}
            >
              {category?.title || norm}
            </h1>
            <p className="text-sm" style={{ color: "#43484f" }}>
              Produits de cette catégorie. L’ordre est utilisé pour la
              pagination de la carte.
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
              <span>{items.length} produit(s)</span>
              <span className="h-1 w-1 rounded-full bg-gray-400" />
              <Link
                href="/dashboard/categories"
                className="underline-offset-2 hover:underline"
              >
                ← Retour aux catégories
              </Link>
            </div>
          </div>
        </div>
      </header>

      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl px-4 py-2">
          {err}
        </div>
      )}

      {/* BARRE search / filter / sort */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-white border border-[#e4ded1] rounded-2xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 flex-1">
          <input
            className="w-full border border-[#e4ded1] rounded-xl px-3 py-2 text-sm bg-[#faf9f6]"
            placeholder="Rechercher un produit par titre ou ID…"
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
              <option value="all">Tous</option>
              <option value="visible">Visibles</option>
              <option value="hidden">Masqués</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-[#43484f]">Trier par :</span>
            <select
              className="border border-[#e4ded1] rounded-xl px-2 py-1 bg-white"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
            >
              <option value="order">Ordre (carte)</option>
              <option value="title_az">Titre A → Z</option>
              <option value="title_za">Titre Z → A</option>
            </select>
          </div>

          <span className="text-[11px] text-gray-500">
            {sorted.length} / {items.length} produit(s)
          </span>
        </div>
      </div>

      {/* Add new product */}
      <section className="bg-white border border-[#e4ded1] rounded-3xl p-5 space-y-3 shadow-sm">
        <h2
          className="text-lg font-semibold"
          style={{ color: "#2f4632" }}
        >
          Ajouter un produit
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <LabeledInput
            label="Titre"
            value={newTitle}
            onChange={setNewTitle}
          />
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={addItem}
            disabled={busy || !newTitle || !newImage}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white shadow"
            style={{
              backgroundColor:
                busy || !newTitle || !newImage ? "#9aa3a1" : "#2f4632",
            }}
          >
            {busy ? "Adding…" : "Ajouter le produit"}
          </button>
          <button
            onClick={renumberAll}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-[#e4ded1] bg-white hover:bg-[#faf9f6]"
          >
            Recalculer l’ordre & pages
          </button>
        </div>
        <p className="text-[11px] text-gray-500">
          Les pages sont enregistrées dans <code>product_pages</code> pour
          cette catégorie. Le champ <code>order</code> contrôle l’ordre
          réel sur la carte.
        </p>
      </section>

      {/* List */}
      <section className="bg-white border border-[#e4ded1] rounded-3xl p-4 shadow-sm">
        {sorted.length === 0 && (
          <div className="text-sm text-gray-600">
            Aucun produit pour ces critères.
          </div>
        )}

        <div className="space-y-3 max-h-[600px] overflow-auto pr-1">
          {sorted.map((c) => {
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
                  value={c.title}
                  onSave={(t) => editTitle(c, t)}
                  label={`Titre (ordre ${c.order} • page ${c.page} • pos ${c.pos})`}
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
                    onClick={() =>
                      moveItem(originalIndex, originalIndex - 1)
                    }
                    disabled={isFirst}
                    className="px-2 py-1 rounded-lg border border-[#d4cec2] bg-white disabled:bg-[#e0e0dd]"
                    title="Monter (ordre réel)"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() =>
                      moveItem(originalIndex, originalIndex + 1)
                    }
                    disabled={isLast}
                    className="px-2 py-1 rounded-lg border border-[#d4cec2] bg-white disabled:bg-[#e0e0dd]"
                    title="Descendre (ordre réel)"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => delItem(c)}
                    className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs md:text-sm font-semibold hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-2 text-[11px] text-gray-500">
          Tip : le tri (A→Z / Z→A) est purement visuel. Les flèches ↑/↓
          modifient l’ordre réel utilisé pour la pagination et
          l’affichage dans l’app.
        </p>
      </section>
    </div>
  );
}

/* small input components */

function LabeledInput(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-gray-700">{props.label}</span>
      <input
        className="border border-[#e4ded1] bg-[#faf9f6] p-2 rounded-xl"
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



export default function CategoryDetailPage() {
  return <CategoryDetailPageInner />;
}
