"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

/* ───────── Cloudinary helpers ───────── */

async function uploadToCloudinary(file: File) {
  const cloud  = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
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

/* ───────── Page ───────── */

export default function CardVideosPage() {
  return <Inner />;
}

function Inner() {
  // top-level collections
  const videosCol     = useMemo(() => collection(db, "card_videos"), []);
  const videoPagesCol = useMemo(() => collection(db, "card_video_pages"), []);

  const [items, setItems] = useState<VideoItem[]>([]);
  const [newVideoFile, setNewVideoFile] = useState<File | null>(null);
  const [newVideoUrl,  setNewVideoUrl]  = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  /* ───────── paging helpers (now computed from fresh snapshots) ───────── */

  // Create missing page docs (0..maxPage) and remove extras,
  // based on the CURRENT Firestore contents (not stale UI state).
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

  // Writes page/pos to visible videos (pos always 0), then syncs page docs.
  const recomputePagesForVisible = async () => {
    const snap = await getDocs(query(videosCol, orderBy("order","asc")));
    const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const visible = docs.filter(d => d.visible !== false);

    const batch = writeBatch(db);
    visible.forEach((v, i) => {
      const page = Math.floor(i / VIDEO_PAGE_SIZE); // with size 1, page === i
      const pos  = i % VIDEO_PAGE_SIZE;             // with size 1, pos  === 0
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

  // Also keep pages synced whenever the list changes
  useEffect(() => { syncPagesByCount(); }, [items]);

  /* ───────── CRUD ───────── */

  const addVideo = async () => {
    if (!newVideoFile && !newVideoUrl.trim()) return setErr("Upload a file or paste a URL.");
    try {
      setBusy(true); setErr(null);
      const raw = newVideoFile ? (await uploadToCloudinary(newVideoFile)) : newVideoUrl.trim();
      const playable = toPlayableVideoUrl(raw);

      // Create the video
      await addDoc(videosCol, {
        url: playable,
        order: items.length,
        visible: true,
        page: 0,
        pos: 0,
      });

      setNewVideoFile(null); setNewVideoUrl("");

      // Immediately recompute page/pos and ensure page docs exist
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
    // Recompute order + page/pos and remove any now-unused page docs
    await renumberAll();
  };

  const editUrl = async (v:VideoItem, url:string) => {
    await updateDoc(doc(videosCol, v.id), { url: toPlayableVideoUrl(url) });
  };

  /* ───────── UI ───────── */

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Card — Videos (1 per page)</h1>
        <button
          onClick={renumberAll}
          className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300"
          title="Recompute order and page/pos"
        >
          Recompute layout
        </button>
      </header>

      {err && <div className="text-red-600">{err}</div>}

      {/* Add new */}
      <section className="border rounded p-4 space-y-3">
        <h2 className="text-lg font-medium">Add video</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">Upload file</span>
            <input type="file" accept="video/*" onChange={(e)=>setNewVideoFile(e.target.files?.[0] ?? null)} />
          </label>
          <LabeledInput label="Or paste URL" value={newVideoUrl} onChange={setNewVideoUrl} placeholder="https://…" />
        </div>
        <button
          onClick={addVideo}
          disabled={busy || (!newVideoFile && !newVideoUrl.trim())}
          className={`px-3 py-2 rounded text-white ${busy || (!newVideoFile && !newVideoUrl.trim()) ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
        >
          {busy ? "Adding…" : "Add video"}
        </button>
        <p className="text-xs text-gray-500">
          Docs in <code>card_videos</code> include <code>page</code> and <code>pos</code> (pos = 0).  
          Pages tracked in <code>card_video_pages</code> are created/removed automatically.
        </p>
      </section>

      {/* List */}
      <section className="grid gap-3">
        {items.length === 0 && <div className="text-sm text-gray-600">No videos yet.</div>}
        {items.map((v, idx)=>(
          <div key={v.id} className="border rounded p-3 flex flex-col md:flex-row md:items-center gap-3">
            <video className="w-full md:w-64 rounded" src={v.url} controls />
            <EditableInline value={v.url} onSave={(u)=>editUrl(v,u)}
              label={`Video URL (order ${v.order} • page ${v.page ?? "-"} • pos ${v.pos ?? "-"})`} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v.visible} onChange={()=>toggleVideo(v)} /> Visible
            </label>
            <div className="flex items-center gap-2">
              <button onClick={()=>moveVideo(idx, idx-1)} disabled={idx===0}
                      className={`px-2 py-1 rounded ${idx===0?"bg-gray-300":"bg-gray-200 hover:bg-gray-300"}`}>↑</button>
              <button onClick={()=>moveVideo(idx, idx+1)} disabled={idx===items.length-1}
                      className={`px-2 py-1 rounded ${idx===items.length-1?"bg-gray-300":"bg-gray-200 hover:bg-gray-300"}`}>↓</button>
              <button onClick={()=>delVideo(v)} className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

/* Small inputs */

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
        <input className="border p-2 rounded w-full" value={val} onChange={(e)=>setVal(e.target.value)} disabled={!editing} />
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
