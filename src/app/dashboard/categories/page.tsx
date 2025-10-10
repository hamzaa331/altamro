// app/dashboard/categories/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import Link from "next/link";
import {
  collection, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  onSnapshot, query, orderBy, writeBatch, where, limit
} from "firebase/firestore";

/* ───────── types ───────── */
type Category = {
  id: string;          // document id (slug)
  title: string;
  image_url: string;
  order: number;
  visible: boolean;
  page: number;
  pos: number;
};

/* ───────── constants ───────── */
const PAGE_SIZE = 2; // set to 1 if you also want one category per page

/* ───────── utils ───────── */
function slugify(s: string) {
  return s.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uploadToCloudinary(file: File) {
  const cloud  = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;
  const form = new FormData();
  form.append("upload_preset", preset);
  form.append("file", file);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: form });
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

/* ───────── page ───────── */
export default function CategoriesAdminPage() {
  return <Inner />;
}

function Inner() {
  // collections
  const categoriesCol     = useMemo(() => collection(db, "categories"), []);
  const categoryPagesCol  = useMemo(() => collection(db, "index_categorie"), []);
  // top-level related
  const productsCol       = useMemo(() => collection(db, "products"), []);
  const productPagesCol   = useMemo(() => collection(db, "product_pages"), []);

  const [items, setItems] = useState<Category[]>([]);
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [newTitle, setNewTitle] = useState("");
  const [newImage, setNewImage] = useState<File | null>(null);

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
              pos:  x.pos  ?? (ord % PAGE_SIZE),
            };
          })
        );
        setLoading(false);
      },
      (e) => { setErr(e.message); setLoading(false); }
    );
    return () => unsub();
  }, [categoriesCol]);

  /* pagination helpers for categories (index_categorie) */
  const syncPagesByCount = async () => {
    const allSnap = await getDocs(query(categoriesCol, orderBy("order","asc")));
    const visibleCount = allSnap.docs.filter(d => (d.data() as any).visible !== false).length;
    const maxPage = visibleCount > 0 ? Math.floor((visibleCount - 1) / PAGE_SIZE) : -1;

    const pagesSnap = await getDocs(categoryPagesCol);
    const have = new Set(pagesSnap.docs.map(d => d.id));

    const batch = writeBatch(db);
    for (let i = 0; i <= maxPage; i++) {
      const id = String(i);
      if (!have.has(id)) batch.set(doc(categoryPagesCol, id), { index: i });
    }
    pagesSnap.docs.forEach(d => {
      const idx = Number(d.id);
      if (idx > maxPage) batch.delete(d.ref);
    });
    await batch.commit();
  };

  const recomputePagesForVisible = async () => {
    const snap = await getDocs(query(categoriesCol, orderBy("order", "asc")));
    const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const visible = docs.filter(d => d.visible !== false);
    const batch = writeBatch(db);
    visible.forEach((v, i) => {
      const page = Math.floor(i / PAGE_SIZE);
      const pos  = i % PAGE_SIZE;
      batch.update(doc(categoriesCol, v.id), { page, pos });
    });
    await batch.commit();
  };

  const renumberAll = async () => {
    const snap = await getDocs(query(categoriesCol, orderBy("order", "asc")));
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
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }

  async function updateInChunksToNewRef(qry: ReturnType<typeof query>, field: string, newRef: any) {
    while (true) {
      const snap = await getDocs(query(qry, limit(400)));
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.update(d.ref, { [field]: newRef }));
      await batch.commit();
    }
  }

  /** Delete category + all related top-level docs */
  async function deleteCategoryCascade(slug: string) {
    const catRef = doc(db, "categories", slug);
    await deleteInChunks(query(productsCol, where("category_ref","==",catRef)));
    await deleteInChunks(query(productPagesCol, where("category_ref","==",catRef)));
    await deleteDoc(catRef);
  }

  /* ───────── CRUD ───────── */

  const addCategory = async () => {
    if (!newTitle || !newImage) return setErr("Choose an image and enter a title.");
    try {
      setBusy(true);
      const url = await uploadToCloudinary(newImage);
      const id  = slugify(newTitle);
      const catRef = doc(categoriesCol, id);

      await setDoc(catRef, {
        title: newTitle,
        image_url: url, image: url,
        order: items.length,
        visible: true,
        page: 0, pos: 0,
      }, { merge: true });

      // product_pages are created only when products exist; nothing to seed here
      setNewTitle("");
      setNewImage(null);
      await renumberAll();
    } catch (e:any) { setErr(e.message || "Add category failed"); }
    finally { setBusy(false); }
  };

  const editTitle = async (c: Category, title: string) =>
    updateDoc(doc(categoriesCol, c.id), { title });

  const replaceImage = async (c: Category, f: File) => {
    try {
      setBusy(true);
      const url = await uploadToCloudinary(f);
      await updateDoc(doc(categoriesCol, c.id), { image_url: url, image: url });
    } catch (e:any) { setErr(e.message || "Replace image failed"); }
    finally { setBusy(false); }
  };

  const toggleVisible = async (c: Category) => {
    await updateDoc(doc(categoriesCol, c.id), { visible: !c.visible });
    await recomputePagesForVisible();
    await syncPagesByCount();
  };

  const move = async (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const a = items[from], b = items[to];
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
    } catch (e:any) {
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
      await setDoc(newRef, {
        title: x?.title ?? c.title,
        image_url: x?.image_url ?? c.image_url,
        image: x?.image_url ?? c.image_url,
        order: x?.order ?? c.order,
        visible: x?.visible ?? c.visible,
        page: x?.page ?? c.page,
        pos: x?.pos ?? c.pos,
      }, { merge: true });

      await updateInChunksToNewRef(query(productsCol, where("category_ref","==",oldRef)), "category_ref", newRef);
      await updateInChunksToNewRef(query(productPagesCol, where("category_ref","==",oldRef)), "category_ref", newRef);

      await deleteDoc(oldRef);
    } catch (e:any) { setErr(e.message || "Rename failed"); }
    finally { setBusy(false); }
  };

  /* UI */
  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <button onClick={renumberAll} className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300">
          Recompute layout
        </button>
      </header>

      {err && <div className="text-red-600">{err}</div>}

      {/* Add new */}
      <section className="border rounded p-4 space-y-3">
        <h2 className="font-medium">Add category</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">Title (ID = slug)</span>
            <input className="border p-2 rounded" value={newTitle} onChange={(e)=>setNewTitle(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">Image</span>
            <input type="file" accept="image/*" onChange={(e)=>setNewImage(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <button
          onClick={addCategory}
          disabled={busy || !newTitle || !newImage}
          className={`px-3 py-2 rounded text-white ${busy || !newTitle || !newImage ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
        >
          {busy ? "Adding…" : "Add"}
        </button>
        <p className="text-xs text-gray-500">
          Saved in <code>categories</code> • Category pages live in <code>index_categorie</code>.{" "}
          Product pages in <code>product_pages</code> are created only when products exist.
        </p>
      </section>

      {/* List */}
      <section className="grid gap-3">
        {items.length === 0 && <div className="text-sm text-gray-600">No categories yet.</div>}
        {items.map((c, idx) => (
          <div key={c.id} className="border rounded p-3 flex flex-col md:flex-row md:items-center gap-3">
            {c.image_url
              ? <img src={cl(c.image_url, "f_auto,q_auto,w_120,h_80,c_fill")} className="w-24 h-16 object-cover rounded" alt="" />
              : <div className="w-24 h-16 bg-gray-100 rounded grid place-items-center text-xs text-gray-500">No image</div>
            }

            <EditableInline
              label={`Title (order ${c.order} • page ${c.page} • pos ${c.pos})`}
              value={c.title}
              onSave={(t)=>editTitle(c, t)}
            />

            <label className="text-sm text-gray-600">
              Replace image
              <input className="block mt-1" type="file" accept="image/*"
                     onChange={(e)=>e.target.files?.[0] && replaceImage(c, e.target.files[0])} />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={c.visible} onChange={()=>toggleVisible(c)} /> Visible
            </label>

            <div className="flex items-center gap-2">
              <button onClick={()=>move(idx, idx-1)} disabled={idx===0}
                      className={`px-2 py-1 rounded ${idx===0 ? "bg-gray-300" : "bg-gray-200 hover:bg-gray-300"}`}>↑</button>
              <button onClick={()=>move(idx, idx+1)} disabled={idx===items.length-1}
                      className={`px-2 py-1 rounded ${idx===items.length-1 ? "bg-gray-300" : "bg-gray-200 hover:bg-gray-300"}`}>↓</button>
              <button onClick={()=>remove(c)} className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">Delete</button>
            </div>

            <button
              className="ml-auto px-2 py-1 rounded bg-amber-200 hover:bg-amber-300 text-sm"
              onClick={()=>renameIdToTitleSlug(c)}
              title="Change document ID to match the current title's slug"
            >
              Rename ID to slug(title)
            </button>

            <Link href={`/dashboard/categories/${c.id}`} className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300">
              Open
            </Link>
          </div>
        ))}
      </section>
    </div>
  );
}

/* ───────── small inline editor ───────── */
function EditableInline(props: { label?: string; value: string; onSave: (v: string) => void }) {
  const [val, setVal] = useState(props.value);
  const [editing, setEditing] = useState(false);
  useEffect(()=>setVal(props.value),[props.value]);

  return (
    <div className="flex flex-col gap-1 flex-1">
      {props.label && <span className="text-sm text-gray-600">{props.label}</span>}
      <div className="flex gap-2">
        <input className="border p-2 rounded w-full" value={val}
               onChange={(e)=>setVal(e.target.value)} disabled={!editing} />
        {!editing ? (
          <button className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300" onClick={()=>setEditing(true)}>Edit</button>
        ) : (
          <>
            <button className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={()=>{ props.onSave(val); setEditing(false); }}>Save</button>
            <button className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300"
                    onClick={()=>{ setVal(props.value); setEditing(false); }}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}
