// app/admin/interface-commun/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot,
  orderBy, query, setDoc, updateDoc, writeBatch,
} from "firebase/firestore";

/* ========== TYPES ========== */

type CommonDoc = {
  hero_bg_image: string;      // UI name, maps to common_bg_image
  hero_overlay_title: string; // UI name, maps to common_overlay_title

  // shared “chef selection” texts
  desserts_title: string;     // UI name, maps to common_chef_title
  desserts_body: string;      // UI name, maps to common_chef_description
};

type VideoItem = { id: string; url: string; order: number; visible: boolean };
type ChefCard = { id: string; image_url: string; order: number; visible: boolean; page: number; pos: number };

/* ========== CONSTANTS ========== */

// Single shared doc for scalar fields
const ROOT = { col: "pages_common", id: "category_common" };

// Top-level collections for lists
const COLS = {
  videos: "common_videos",
  video_pages: "common_videos_pages",
  chef_cards: "common_chef_cards",
  chef_pages: "common_chef_pages",
};

const VIDEO_PAGE_SIZE = 1;
const CHEF_PAGE_SIZE  = 2;

const EMPTY: CommonDoc = {
  hero_bg_image: "",
  hero_overlay_title: "",
  desserts_title: "",
  desserts_body: "",
};

/** Map UI state <-> DB field names (renamed) */
const toDB = (d: CommonDoc) => ({
  common_bg_image:        d.hero_bg_image,
  common_overlay_title:   d.hero_overlay_title,
  common_chef_title:      d.desserts_title,
  common_chef_description:d.desserts_body,
});
const fromDB = (x: any): CommonDoc => ({
  hero_bg_image:       x?.common_bg_image ?? "",
  hero_overlay_title:  x?.common_overlay_title ?? "",
  desserts_title:      x?.common_chef_title ?? "",
  desserts_body:       x?.common_chef_description ?? "",
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
  if (url.includes("res.cloudinary.com")) return cl(url, "f_mp4,vc_h264,q_auto");
  return url;
}

/* ========== PAGE ========== */

export default function CategoryDefaultsAdminPage() {
  return <Inner />;
}

function Inner() {
  // scalar fields doc
  const pageRef = useMemo(() => doc(db, ROOT.col, ROOT.id), []);

  // ***** TOP-LEVEL collections (not subcollections) *****
  const videosCol     = useMemo(() => collection(db, COLS.videos), []);
  const videoPagesCol = useMemo(() => collection(db, COLS.video_pages), []);
  const chefCol       = useMemo(() => collection(db, COLS.chef_cards), []);
  const chefPagesCol  = useMemo(() => collection(db, COLS.chef_pages), []);

  const [data, setData] = useState<CommonDoc>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [newVideoFile, setNewVideoFile] = useState<File | null>(null);
  const [newVideoUrl, setNewVideoUrl] = useState("");

  const [chefs, setChefs] = useState<ChefCard[]>([]);
  const [newChefImage, setNewChefImage] = useState<File | null>(null);

  /* ---------- live subscriptions ---------- */
  useEffect(() => {
    const unsubPage = onSnapshot(
      pageRef,
      (snap) => {
        setData(snap.exists() ? fromDB(snap.data()) : EMPTY);
        setDirty(false);
        setLoading(false);
      },
      (e) => { setErr(e.message); setLoading(false); }
    );

    const unsubVideos = onSnapshot(
      query(videosCol, orderBy("order", "asc")),
      (snap) => setVideos(
        snap.docs.map(d => {
          const x = d.data() as any;
          return { id: d.id, url: x.url ?? "", order: x.order ?? 0, visible: x.visible ?? true };
        })
      ),
      (e) => setErr(e.message)
    );

    const unsubChefs = onSnapshot(
      query(chefCol, orderBy("order", "asc")),
      (snap) => setChefs(
        snap.docs.map((d, i) => {
          const x = d.data() as any;
          const ord = x.order ?? i;
          return {
            id: d.id,
            image_url: x.image_url ?? x.image ?? "",
            order: ord,
            visible: x.visible ?? true,
            page: x.page ?? Math.floor(ord / CHEF_PAGE_SIZE),
            pos: x.pos ?? (ord % CHEF_PAGE_SIZE),
          };
        })
      ),
      (e) => setErr(e.message)
    );

    return () => { unsubPage(); unsubVideos(); unsubChefs(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- helpers: pagination + ordering ---------- */

  const syncPagesByCount = async (
    pagesColRef: ReturnType<typeof collection>,
    countVisible: number,
    pageSize: number
  ) => {
    const maxPage = countVisible > 0 ? Math.floor((countVisible - 1) / pageSize) : -1;
    const pagesSnap = await getDocs(pagesColRef);
    const have = new Set(pagesSnap.docs.map(d => Number(d.id)));
    const batch = writeBatch(db);

    for (let i = 0; i <= maxPage; i++) if (!have.has(i)) {
      batch.set(doc(pagesColRef, String(i)), { index: i });
    }
    pagesSnap.docs.forEach(d => { const idx = Number(d.id); if (idx > maxPage) batch.delete(d.ref); });
    await batch.commit();
  };

  const recomputePagesForVisible = async (
    colRef: ReturnType<typeof collection>,
    pageSize: number
  ) => {
    const snap = await getDocs(query(colRef, orderBy("order", "asc")));
    const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const visible = docs.filter(d => d.visible !== false);
    const batch = writeBatch(db);
    visible.forEach((v, i) => {
      batch.update(doc(colRef, v.id), { page: Math.floor(i / pageSize), pos: i % pageSize });
    });
    await batch.commit();
  };

  const renumberAll = async (colRef: ReturnType<typeof collection>, pageSize: number) => {
    const snap = await getDocs(query(colRef, orderBy("order", "asc")));
    const batch = writeBatch(db);
    snap.docs.forEach((d, i) => batch.update(d.ref, { order: i }));
    await batch.commit();
    await recomputePagesForVisible(colRef, pageSize);
  };

  useEffect(() => { syncPagesByCount(videoPagesCol, videos.filter(v => v.visible).length, VIDEO_PAGE_SIZE); }, [videos, videoPagesCol]);
  useEffect(() => { syncPagesByCount(chefPagesCol,  chefs.filter(c => c.visible).length,  CHEF_PAGE_SIZE);  }, [chefs,  chefPagesCol]);

  /* ---------- SAVE ---------- */

  const saveAll = async () => {
    try {
      setBusy(true);
      await setDoc(pageRef, toDB(data), { merge: true });
      setDirty(false); setErr(null);
    } catch (e:any) { setErr(e.message || "Save failed"); }
    finally { setBusy(false); }
  };

  /* ---------- VIDEOS CRUD ---------- */

  const addVideo = async () => {
    if (!newVideoFile && !newVideoUrl.trim()) return setErr("Upload a file or paste a URL.");
    try {
      setBusy(true);
      const raw = newVideoFile ? (await uploadToCloudinary(newVideoFile, "video")) : newVideoUrl.trim();
      const playable = toPlayableVideoUrl(raw);
      await addDoc(videosCol, { url: playable, order: videos.length, visible: true });
      setNewVideoFile(null); setNewVideoUrl("");
      await renumberAll(videosCol, VIDEO_PAGE_SIZE);
    } catch (e:any) { setErr(e.message || "Add video failed"); }
    finally { setBusy(false); }
  };

  const moveVideo = async (from:number, to:number) => {
    if (to<0 || to>=videos.length) return;
    const a=videos[from], b=videos[to];
    const batch = writeBatch(db);
    batch.update(doc(videosCol, a.id), { order: to });
    batch.update(doc(videosCol, b.id), { order: from });
    await batch.commit();
    await recomputePagesForVisible(videosCol, VIDEO_PAGE_SIZE);
  };

  const toggleVideo = async (v:VideoItem) => {
    await updateDoc(doc(videosCol, v.id), { visible: !v.visible });
    await recomputePagesForVisible(videosCol, VIDEO_PAGE_SIZE);
  };
  const delVideo = async (v:VideoItem) => { await deleteDoc(doc(videosCol, v.id)); await renumberAll(videosCol, VIDEO_PAGE_SIZE); };
  const editVideoUrl = async (v:VideoItem, url:string) => updateDoc(doc(videosCol, v.id), { url: toPlayableVideoUrl(url) });

  /* ---------- CHEF CARDS CRUD (images only, 2-up) ---------- */

  const addChef = async () => {
    if (!newChefImage) return setErr("Choose an image.");
    try {
      setBusy(true);
      const url = await uploadToCloudinary(newChefImage, "image");
      await addDoc(chefCol, { image_url: url, image: url, order: chefs.length, page: 0, pos: 0, visible: true });
      setNewChefImage(null);
      await renumberAll(chefCol, CHEF_PAGE_SIZE);
    } catch (e:any) { setErr(e.message || "Add image failed"); }
    finally { setBusy(false); }
  };

  const moveChef = async (from:number, to:number) => {
    if (to<0 || to>=chefs.length) return;
    const a=chefs[from], b=chefs[to];
    const batch = writeBatch(db);
    batch.update(doc(chefCol, a.id), { order: to });
    batch.update(doc(chefCol, b.id), { order: from });
    await batch.commit();
    await recomputePagesForVisible(chefCol, CHEF_PAGE_SIZE);
  };

  const toggleChef = async (c:ChefCard) => {
    await updateDoc(doc(chefCol, c.id), { visible: !c.visible });
    await recomputePagesForVisible(chefCol, CHEF_PAGE_SIZE);
  };
  const delChef = async (c:ChefCard) => { await deleteDoc(doc(chefCol, c.id)); await renumberAll(chefCol, CHEF_PAGE_SIZE); };
  const replaceChefImage = async (c:ChefCard, f:File) => {
    const url = await uploadToCloudinary(f, "image");
    await updateDoc(doc(chefCol, c.id), { image_url: url, image: url });
  };

  /* ---------- UI ---------- */

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Interface commun (catégories)</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={saveAll}
            disabled={busy || !dirty}
            className={`px-4 py-2 rounded text-white ${busy || !dirty ? "bg-gray-400" : "bg-emerald-600 hover:bg-emerald-700"}`}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button
            onClick={async () => {
              setBusy(true);
              try {
                await Promise.all([
                  renumberAll(videosCol, VIDEO_PAGE_SIZE),
                  renumberAll(chefCol,   CHEF_PAGE_SIZE),
                ]);
              } finally { setBusy(false); }
            }}
            className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300"
            title="Recompute page/pos/order now"
          >
            Recompute layout
          </button>
        </div>
      </header>

      {err && <div className="text-red-600">{err}</div>}

      {/* HERO */}
      <section className="space-y-3">
        <h2 className="text-xl font-medium">Hero (shared across category pages)</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-1 border rounded p-3 space-y-2">
            <div className="text-sm text-gray-600">Background image</div>
            {data.hero_bg_image ? (
              <img
                src={cl(data.hero_bg_image, "f_auto,q_auto,w_1200,h_640,c_fill")}
                className="w-full h-40 object-cover rounded" alt="Hero" loading="lazy"
              />
            ) : <div className="text-gray-500 text-sm">No image</div>}
            <input
              type="file" accept="image/*"
              onChange={(e) => e.target.files?.[0] && (async () => {
                setBusy(true);
                try {
                  const url = await uploadToCloudinary(e.target.files![0], "image");
                  setData(d => ({ ...d, hero_bg_image: url })); setDirty(true);
                } catch (e:any) { setErr(e.message || "Upload failed"); }
                finally { setBusy(false); }
              })()}
            />
            <input
              className="border p-2 w-full rounded" placeholder="Image URL"
              value={data.hero_bg_image || ""}
              onChange={(e) => { setData(d=>({ ...d, hero_bg_image: e.target.value })); setDirty(true); }}
            />
          </div>
          <div className="md:col-span-2 grid gap-4">
            <LabeledInput
              label="Overlay title"
              value={data.hero_overlay_title}
              onChange={(v)=>{ setData(d=>({ ...d, hero_overlay_title: v })); setDirty(true); }}
            />
          </div>
        </div>
      </section>

      {/* VIDEOS */}
      <section className="space-y-3">
        <h2 className="text-xl font-medium">Hero Videos (shared — 1 per page)</h2>
        <div className="border rounded p-3 space-y-2">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-600">Upload video</span>
              <input type="file" accept="video/*" onChange={(e)=>setNewVideoFile(e.target.files?.[0] ?? null)} />
            </label>
            <LabeledInput label="Or paste URL" value={newVideoUrl} onChange={setNewVideoUrl} placeholder="https://…" />
          </div>
          <button
            onClick={addVideo}
            disabled={busy || (!newVideoFile && !newVideoUrl)}
            className={`px-3 py-2 rounded text-white ${busy || (!newVideoFile && !newVideoUrl) ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {busy ? "Adding…" : "Add video"}
          </button>
        </div>

        <div className="grid gap-3">
          {videos.length === 0 && <div className="text-sm text-gray-600">No videos yet.</div>}
          {videos.map((v, idx) => (
            <div key={v.id} className="border rounded p-3 flex flex-col md:flex-row md:items-center gap-3">
              <video className="w-full md:w-64 rounded" src={v.url} controls />
              <EditableInline value={v.url} onSave={(u)=>editVideoUrl(v,u)} label={`Video URL (order ${v.order})`} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.visible} onChange={()=>toggleVideo(v)} /> Visible</label>
              <div className="flex items-center gap-2">
                <button onClick={()=>moveVideo(idx, idx-1)} disabled={idx===0} className={`px-2 py-1 rounded ${idx===0?"bg-gray-300":"bg-gray-200 hover:bg-gray-300"}`}>↑</button>
                <button onClick={()=>moveVideo(idx, idx+1)} disabled={idx===videos.length-1} className={`px-2 py-1 rounded ${idx===videos.length-1?"bg-gray-300":"bg-gray-200 hover:bg-gray-300"}`}>↓</button>
                <button onClick={()=>delVideo(v)} className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">Delete</button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-500">Pages stored in top-level <code>{COLS.video_pages}</code>.</p>
      </section>

      {/* CHEF TEXTS — shared */}
      <section className="space-y-3">
        <h2 className="text-xl font-medium">Sélection du chef (shared texts)</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <LabeledInput label="Title" value={data.desserts_title} onChange={(v)=>{ setData(d=>({ ...d, desserts_title: v })); setDirty(true); }} />
          <LabeledTextArea label="Description" rows={5} value={data.desserts_body} onChange={(v)=>{ setData(d=>({ ...d, desserts_body: v })); setDirty(true); }} />
        </div>
      </section>

      {/* CHEF GALLERY — shared */}
      <section className="space-y-3">
        <h2 className="text-xl font-medium">Images du chef (2 per page)</h2>

        <div className="border rounded p-3 space-y-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">Image</span>
            <input type="file" accept="image/*" onChange={(e)=>setNewChefImage(e.target.files?.[0] ?? null)} />
          </label>
          <button
            onClick={addChef}
            disabled={busy || !newChefImage}
            className={`px-3 py-2 rounded text-white ${busy || !newChefImage ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {busy ? "Adding…" : "Add image"}
          </button>
        </div>

        <div className="grid gap-3">
          {chefs.length===0 && <div className="text-sm text-gray-600">No images yet.</div>}
          {chefs.map((c, idx)=>(
            <div key={c.id} className="border rounded p-3 flex flex-col md:flex-row md:items-center gap-3">
              {c.image_url
                ? <img src={cl(c.image_url,"f_auto,q_auto,w_120,h_80,c_fill")} className="w-24 h-16 object-cover rounded" alt="" />
                : <div className="w-24 h-16 bg-gray-100 rounded grid place-items-center text-xs text-gray-500">No image</div>
              }
              <div className="flex-1 text-xs text-gray-500">order {c.order} • page {c.page} • pos {c.pos}</div>
              <label className="text-sm text-gray-600">
                Replace
                <input className="block mt-1" type="file" accept="image/*"
                  onChange={(e)=>e.target.files?.[0] && replaceChefImage(c, e.target.files[0])} />
              </label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.visible} onChange={()=>toggleChef(c)} /> Visible</label>
              <div className="flex items-center gap-2">
                <button onClick={()=>moveChef(idx, idx-1)} disabled={idx===0} className={`px-2 py-1 rounded ${idx===0?"bg-gray-300":"bg-gray-200 hover:bg-gray-300"}`}>↑</button>
                <button onClick={()=>moveChef(idx, idx+1)} disabled={idx===chefs.length-1} className={`px-2 py-1 rounded ${idx===chefs.length-1?"bg-gray-300":"bg-gray-200 hover:bg-gray-300"}`}>↓</button>
                <button onClick={()=>delChef(c)} className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">Delete</button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-500">Pages stored in top-level <code>{COLS.chef_pages}</code>.</p>
      </section>
    </div>
  );
}

/* ========== small inputs ========== */

function LabeledInput(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-gray-600">{props.label}</span>
      <input className="border p-2 rounded" value={props.value} placeholder={props.placeholder} onChange={(e)=>props.onChange(e.target.value)} />
    </label>
  );
}

function LabeledTextArea(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-gray-600">{props.label}</span>
      <textarea className="border p-2 rounded" rows={props.rows ?? 3} value={props.value} placeholder={props.placeholder} onChange={(e)=>props.onChange(e.target.value)} />
    </label>
  );
}

function EditableInline(props: { label?: string; value: string; onSave: (v: string) => void }) {
  const [val, setVal] = useState(props.value);
  const [editing, setEditing] = useState(false);
  useEffect(()=>setVal(props.value),[props.value]);

  return (
    <div className="flex flex-col gap-1 flex-1">
      {props.label && <span className="text-sm text-gray-600">{props.label}</span>}
      <div className="flex gap-2">
        <input className="border p-2 rounded w-full" value={val} onChange={(e)=>setVal(e.target.value)} disabled={!editing} />
        {!editing ? (
          <button className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300" onClick={()=>setEditing(true)}>Edit</button>
        ) : (
          <>
            <button className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white" onClick={()=>{ props.onSave(val); setEditing(false); }}>Save</button>
            <button className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300" onClick={()=>{ setVal(props.value); setEditing(false); }}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}
