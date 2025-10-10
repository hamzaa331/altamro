// app/dashboard/categories/[slug]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
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

function normalizeSlug(s: string) {
  return s.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

async function uniqueDocIdForTitle(colRef: ReturnType<typeof collection>, title: string) {
  const base = normalizeSlug(title) || `${Date.now()}`;
  let id = base, n = 2;
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

/* ---------- page ---------- */

export default function CategoryDetailPage() {
  const p = useParams<{ slug: string | string[] }>();
  const slug = Array.isArray(p?.slug) ? p!.slug[0] : (p?.slug || "");
  return <Inner slug={decodeURIComponent(slug)} />;
}

function Inner({ slug }: { slug: string }) {
  const norm = normalizeSlug(slug);

  // ONE item per page in the PageView
  const PAGE_SIZE = 1;

  const catRef = useMemo(() => doc(db, "categories", norm), [norm]);

  // TOP-LEVEL collections
  const productsCol     = useMemo(() => collection(db, "products"), []);
  const productPagesCol = useMemo(() => collection(db, "product_pages"), []);

  const [category, setCategory] = useState<Category | null>(null);
  const [items, setItems] = useState<Product[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [newTitle, setNewTitle] = useState("");
  const [newImage, setNewImage] = useState<File | null>(null);

  // Live subscriptions
  useEffect(() => {
    const unsubCat = onSnapshot(catRef, snap => setCategory((snap.data() as any) ?? {}));

    const q = query(productsCol, where("category_ref", "==", catRef), orderBy("order", "asc"));
    const unsubProd = onSnapshot(
      q,
      async snap => {
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
            pos:  x.pos  ?? (ord % PAGE_SIZE),
          };
        });
        setItems(list);
        setLoading(false);

        // create/delete product_pages based on the current snapshot
        await syncPagesByCount(list);
      },
      e => { setErr(e.message); setLoading(false); }
    );

    return () => { unsubCat(); unsubProd(); };
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
      visibleCount = currentItems.filter(i => i.visible).length;
    } else {
      const snap = await getDocs(query(productsCol, where("category_ref","==",catRef)));
      visibleCount = snap.docs.filter(d => (d.data() as any).visible !== false).length;
    }

    const maxPage = visibleCount > 0 ? Math.floor((visibleCount - 1) / PAGE_SIZE) : -1;

    const pagesSnap = await getDocs(query(productPagesCol, where("category_ref","==",catRef)));
    const have = new Set<number>(pagesSnap.docs.map(d => (d.data() as any).index));
    const batch = writeBatch(db);

    for (let i = 0; i <= maxPage; i++) {
      if (!have.has(i)) {
        batch.set(doc(productPagesCol, `${norm}_${i}`), { index: i, category_ref: catRef });
      }
    }

    pagesSnap.docs.forEach(d => {
      const idx = (d.data() as any).index;
      if (idx > maxPage) batch.delete(d.ref);
    });

    await batch.commit();
  };

  const recomputePagesForVisible = async () => {
    const snap = await getDocs(query(productsCol, where("category_ref","==",catRef), orderBy("order","asc")));
    const visible = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).filter(d => d.visible !== false);
    const batch = writeBatch(db);
    visible.forEach((v, i) => {
      batch.update(doc(productsCol, v.id), { page: Math.floor(i / PAGE_SIZE), pos: i % PAGE_SIZE });
    });
    await batch.commit();
  };

  const renumberAll = async () => {
    const snap = await getDocs(query(productsCol, where("category_ref","==",catRef), orderBy("order","asc")));
    const batch = writeBatch(db);
    snap.docs.forEach((d, i) => batch.update(d.ref, { order: i }));
    await batch.commit();
    await recomputePagesForVisible();
    await syncPagesByCount(); // uses Firestore directly to compute visible count
  };

  // ----- CRUD (top-level products) -----

  const addItem = async () => {
    if (!newTitle || !newImage) return setErr("Enter a title and choose an image.");
    try {
      setBusy(true);
      const url = await uploadToCloudinary(newImage);
      const newId = await uniqueDocIdForTitle(productsCol, newTitle);

      await setDoc(doc(productsCol, newId), {
        category_ref: catRef,
        title: newTitle,
        image_url: url, image: url,
        order: items.length,
        visible: true,
        page: 0, pos: 0,
      }, { merge: true });

      setNewTitle(""); setNewImage(null);

      // Immediately recompute layout and pages
      await renumberAll();
      await syncPagesByCount(); // defensive extra call to ensure product_pages is created on the spot
    } catch (e:any) {
      setErr(e.message || "Add failed");
    } finally {
      setBusy(false);
    }
  };

  const editTitle = async (it: Product, title: string) =>
    updateDoc(doc(productsCol, it.id), { title });

  const replaceImage = async (it: Product, f: File) => {
    const url = await uploadToCloudinary(f);
    await updateDoc(doc(productsCol, it.id), { image_url: url, image: url });
  };

  const toggleVisible = async (it: Product) => {
    await updateDoc(doc(productsCol, it.id), { visible: !it.visible });
    await recomputePagesForVisible();
    await syncPagesByCount();
  };

  const moveItem = async (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const a = items[from], b = items[to];
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

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center gap-4">
        {category?.image_url
          ? <img src={cl(category.image_url, "f_auto,q_auto,w_160,h_120,c_fill")} alt="" className="w-40 h-28 object-cover rounded" />
          : <div className="w-40 h-28 rounded bg-gray-100 grid place-items-center text-xs text-gray-500">No image</div>
        }
        <div>
          <h1 className="text-2xl font-semibold capitalize">{category?.title || norm}</h1>
          <p className="text-xs text-gray-500">Manage products for this category.</p>
        </div>
      </header>

      {err && <div className="text-red-600">{err}</div>}

      {/* Add new product */}
      <section className="border rounded p-4 space-y-3">
        <h2 className="text-lg font-medium capitalize">{norm} — products</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <LabeledInput label="Title" value={newTitle} onChange={setNewTitle} />
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">Image</span>
            <input type="file" accept="image/*" onChange={(e)=>setNewImage(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <button
          onClick={addItem}
          disabled={busy || !newTitle || !newImage}
          className={`px-3 py-2 rounded text-white ${busy || !newTitle || !newImage ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
        >
          {busy ? "Adding…" : "Add product"}
        </button>
        <button onClick={renumberAll} className="ml-2 px-3 py-2 rounded bg-gray-200 hover:bg-gray-300">
          Recompute layout
        </button>
      </section>

      {/* List */}
      <section className="grid gap-3">
        {items.length === 0 && <div className="text-sm text-gray-600">No products yet.</div>}
        {items.map((c, idx)=>(
          <div key={c.id} className="border rounded p-3 flex flex-col md:flex-row md:items-center gap-3">
            {c.image_url
              ? <img src={cl(c.image_url,"f_auto,q_auto,w_120,h_80,c_fill")} className="w-24 h-16 object-cover rounded" alt="" />
              : <div className="w-24 h-16 bg-gray-100 rounded grid place-items-center text-xs text-gray-500">No image</div>
            }
            <EditableInline value={c.title} onSave={(t)=>editTitle(c,t)}
              label={`Title (order ${c.order} • page ${c.page} • pos ${c.pos})`} />
            <label className="text-sm text-gray-600">
              Replace image
              <input className="block mt-1" type="file" accept="image/*"
                     onChange={(e)=>e.target.files?.[0] && replaceImage(c, e.target.files[0])} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={c.visible} onChange={()=>toggleVisible(c)} /> Visible
            </label>
            <div className="flex items-center gap-2">
              <button onClick={()=>moveItem(idx, idx-1)} disabled={idx===0}
                      className={`px-2 py-1 rounded ${idx===0?"bg-gray-300":"bg-gray-200 hover:bg-gray-300"}`}>↑</button>
              <button onClick={()=>moveItem(idx, idx+1)} disabled={idx===items.length-1}
                      className={`px-2 py-1 rounded ${idx===items.length-1?"bg-gray-300":"bg-gray-200 hover:bg-gray-300"}`}>↓</button>
              <button onClick={()=>delItem(c)} className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

/* small input components */
function LabeledInput(props:{ label:string; value:string; onChange:(v:string)=>void; placeholder?:string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-gray-600">{props.label}</span>
      <input className="border p-2 rounded" value={props.value} placeholder={props.placeholder}
             onChange={(e)=>props.onChange(e.target.value)} />
    </label>
  );
}
function EditableInline(props:{ label?:string; value:string; onSave:(v:string)=>void }) {
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
