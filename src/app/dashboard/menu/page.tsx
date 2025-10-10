// app/dashboard/menu/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot,
  orderBy, query, setDoc, updateDoc, where, writeBatch,
} from "firebase/firestore";

/* ───────────── utils ───────────── */

function slugify(s: string) {
  return s.trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueIdForTitle(colRef: ReturnType<typeof collection>, title: string) {
  const base = slugify(title) || `${Date.now()}`;
  let id = base, i = 2;
  while ((await getDoc(doc(colRef, id))).exists()) id = `${base}-${i++}`;
  return id;
}

async function uploadToCloudinary(file: File) {
  const cloud  = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;
  const endpoint = `https://api.cloudinary.com/v1_1/${cloud}/image/upload`;
  const form = new FormData();
  form.append("upload_preset", preset);
  form.append("file", file);
  const res = await fetch(endpoint, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Upload failed");
  return data.secure_url as string;
}
function cl(url: string, transform: string) {
  const marker = "/upload/"; const i = url.indexOf(marker);
  return i === -1 ? url : url.replace(marker, `/upload/${transform}/`);
}

/* ───────────── types ───────────── */

type Section = { id:string; title:string; description:string; order:number; visible:boolean; };
type Group   = { id:string; section_ref:any; title:string; description:string; order:number; visible:boolean; };
type Item    = { id:string; group_ref:any; name:string; price:string; description:string; order:number; visible:boolean; };
type GroupImage = { id:string; group_ref:any; image_url:string; order:number; visible:boolean;detail_desc?: string; ingredients?: string;   };

/* ───────────── page ───────────── */

export default function MenuAdminPage() { return <Inner/>; }

function Inner() {
  const sectionsCol    = useMemo(() => collection(db, "menu_sections"), []);
  const groupsCol      = useMemo(() => collection(db, "menu_groups"), []);
  const itemsCol       = useMemo(() => collection(db, "menu_items"), []);
  const groupImagesCol = useMemo(() => collection(db, "menu_group_images"), []);

  const [sections, setSections] = useState<Section[]>([]);
  const [groups, setGroups]     = useState<Group[]>([]);
  const [items, setItems]       = useState<Item[]>([]);
  const [groupImages, setGroupImages] = useState<GroupImage[]>([]);

  const [selectedSectionId, setSelectedSectionId] = useState<string|null>(null);
  const [selectedGroupId, setSelectedGroupId]     = useState<string|null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string|null>(null);
  const [loading, setLoading] = useState(true);

  // add forms
  const [newSecTitle, setNewSecTitle] = useState(""); const [newSecDesc, setNewSecDesc] = useState("");
  const [newGrpTitle, setNewGrpTitle] = useState(""); const [newGrpDesc, setNewGrpDesc] = useState("");
  const [newItemName, setNewItemName] = useState(""); const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newGrpImageFile, setNewGrpImageFile] = useState<File|null>(null);

  /* ───────────── subscriptions ───────────── */

  useEffect(() => {
    const unsub = onSnapshot(query(sectionsCol, orderBy("order", "asc")), (snap) => {
      setSections(snap.docs.map((d,i)=> {
        const x=d.data() as any, ord=x.order ?? i;
        return { id:d.id, title:x.title??"", description:x.description??"", order:ord, visible:x.visible??true };
      })); setLoading(false);
    }, e=>{ setErr(e.message); setLoading(false); });
    return () => unsub();
  }, [sectionsCol]);

  useEffect(() => {
    if (!selectedSectionId) { setGroups([]); return; }
    const sref = doc(sectionsCol, selectedSectionId);
    const unsub = onSnapshot(query(groupsCol, where("section_ref","==",sref), orderBy("order","asc")), (snap)=>{
      setGroups(snap.docs.map((d,i)=>{
        const x=d.data() as any, ord=x.order ?? i;
        return { id:d.id, section_ref:x.section_ref, title:x.title??"", description:x.description??"", order:ord, visible:x.visible??true };
      }));
    }, e=>setErr(e.message));
    return () => unsub();
  }, [groupsCol, sectionsCol, selectedSectionId]);

  useEffect(() => {
    if (!selectedGroupId) { setItems([]); return; }
    const gref = doc(groupsCol, selectedGroupId);
    const unsub = onSnapshot(query(itemsCol, where("group_ref","==",gref), orderBy("order","asc")), (snap)=>{
      setItems(snap.docs.map((d,i)=>{
        const x=d.data() as any, ord=x.order ?? i;
        return { id:d.id, group_ref:x.group_ref, name:x.name??"", price:x.price??"", description:x.description??"", order:ord, visible:x.visible??true };
      }));
    }, e=>setErr(e.message));
    return () => unsub();
  }, [itemsCol, groupsCol, selectedGroupId]);

  useEffect(() => {
    if (!selectedGroupId) { setGroupImages([]); return; }
    const gref = doc(groupsCol, selectedGroupId);
    const unsub = onSnapshot(query(groupImagesCol, where("group_ref","==",gref), orderBy("order","asc")), (snap)=>{
      setGroupImages(snap.docs.map((d,i)=>{
        const x=d.data() as any, ord=x.order ?? i;
        return { id:d.id, group_ref:x.group_ref, image_url:x.image_url??"", order:ord, visible:x.visible??true };
      }));
    }, e=>setErr(e.message));
    return () => unsub();
  }, [groupImagesCol, groupsCol, selectedGroupId]);

  /* ───────────── helpers ───────────── */

  async function renumberQuery(qry: ReturnType<typeof query>) {
    const snap = await getDocs(qry); const batch = writeBatch(db);
    snap.docs.forEach((d,i)=>batch.update(d.ref,{order:i})); await batch.commit();
  }
  async function deleteInChunks(qry: ReturnType<typeof query>) {
    while (true) { const snap = await getDocs(query(qry, limit(400)));
      if (snap.empty) break; const batch = writeBatch(db);
      snap.docs.forEach(d=>batch.delete(d.ref)); await batch.commit();
    }
  }
  async function cascadeDeleteGroup(groupId: string) {
    const gref = doc(groupsCol, groupId);
    await deleteInChunks(query(itemsCol, where("group_ref","==",gref)));
    await deleteInChunks(query(groupImagesCol, where("group_ref","==",gref)));
    await deleteDoc(gref);
  }
  async function cascadeDeleteSection(sectionId: string) {
    const sref = doc(sectionsCol, sectionId);
    const gSnap = await getDocs(query(groupsCol, where("section_ref","==",sref)));
    for (const g of gSnap.docs) await cascadeDeleteGroup(g.id);
    await deleteDoc(sref);
  }

  /* ───────────── Sections CRUD ───────────── */

  const addSection = async () => {
    if (!newSecTitle.trim()) return setErr("Big title is required.");
    try {
      setBusy(true);
      const id = await uniqueIdForTitle(sectionsCol, newSecTitle);
      await setDoc(doc(sectionsCol, id), {
        title:newSecTitle.trim(), description:newSecDesc.trim(), order:sections.length, visible:true,
      }, { merge:true });
      setNewSecTitle(""); setNewSecDesc("");
      await renumberQuery(query(sectionsCol, orderBy("order","asc")));
    } catch(e:any){ setErr(e.message||"Add section failed"); } finally { setBusy(false); }
  };
  const editSectionTitle = (s:Section, title:string)=>updateDoc(doc(sectionsCol,s.id),{title});
  const editSectionDesc  = (s:Section, description:string)=>updateDoc(doc(sectionsCol,s.id),{description});
  const toggleSection    = (s:Section)=>updateDoc(doc(sectionsCol,s.id),{visible:!s.visible});
  const moveSection = async (from:number,to:number)=>{
    if (to<0||to>=sections.length) return;
    const a=sections[from], b=sections[to]; const batch=writeBatch(db);
    batch.update(doc(sectionsCol,a.id),{order:to}); batch.update(doc(sectionsCol,b.id),{order:from});
    await batch.commit(); await renumberQuery(query(sectionsCol, orderBy("order","asc")));
  };
  const deleteSection = async (s:Section)=>{
    try{ setBusy(true); await cascadeDeleteSection(s.id);
      if (selectedSectionId===s.id){ setSelectedSectionId(null); setSelectedGroupId(null); }
      await renumberQuery(query(sectionsCol, orderBy("order","asc")));
    }catch(e:any){ setErr(e.message||"Delete section failed"); } finally{ setBusy(false); }
  };

  /* ───────────── Groups CRUD ───────────── */

  const addGroup = async ()=>{
    if (!selectedSectionId) return setErr("Choose a section first.");
    try{
      setBusy(true);
      const sref = doc(sectionsCol, selectedSectionId);
      const id = await uniqueIdForTitle(groupsCol, newGrpTitle || `group-${Date.now()}`);
      await setDoc(doc(groupsCol,id), {
        section_ref:sref, title:newGrpTitle.trim(), description:newGrpDesc.trim(),
        order:groups.length, visible:true,
      }, { merge:true });
      setNewGrpTitle(""); setNewGrpDesc("");
      await renumberQuery(query(groupsCol, where("section_ref","==",sref), orderBy("order","asc")));
    }catch(e:any){ setErr(e.message||"Add group failed"); } finally{ setBusy(false); }
  };
  const editGroupTitle = (g:Group, title:string)=>updateDoc(doc(groupsCol,g.id),{title});
  const editGroupDesc  = (g:Group, description:string)=>updateDoc(doc(groupsCol,g.id),{description});
  const toggleGroup    = (g:Group)=>updateDoc(doc(groupsCol,g.id),{visible:!g.visible});
  const moveGroup = async (from:number,to:number)=>{
    if (!selectedSectionId || to<0 || to>=groups.length) return;
    const a=groups[from], b=groups[to]; const batch=writeBatch(db);
    batch.update(doc(groupsCol,a.id),{order:to}); batch.update(doc(groupsCol,b.id),{order:from});
    await batch.commit();
    await renumberQuery(query(groupsCol, where("section_ref","==",doc(sectionsCol,selectedSectionId)), orderBy("order","asc")));
  };
  const deleteGroup = async (g:Group)=>{
    try{ setBusy(true); await cascadeDeleteGroup(g.id);
      if (selectedGroupId===g.id) setSelectedGroupId(null);
      if (selectedSectionId){
        await renumberQuery(query(groupsCol, where("section_ref","==",doc(sectionsCol,selectedSectionId)), orderBy("order","asc")));
      }
    }catch(e:any){ setErr(e.message||"Delete group failed"); } finally{ setBusy(false); }
  };

  /* ───────────── Items CRUD (NO images) ───────────── */

  const addItem = async ()=>{
    if (!selectedGroupId) return setErr("Choose a group first.");
    if (!newItemName.trim() || !newItemPrice.trim()) return setErr("Product name and price are required.");
    try{
      setBusy(true);
      const gref = doc(groupsCol, selectedGroupId);
      const id = await uniqueIdForTitle(itemsCol, newItemName);
      await setDoc(doc(itemsCol,id), {
        group_ref:gref, name:newItemName.trim(), price:newItemPrice.trim(),
        description:newItemDesc.trim(), order:items.length, visible:true,
      }, { merge:true });
      setNewItemName(""); setNewItemPrice(""); setNewItemDesc("");
      await renumberQuery(query(itemsCol, where("group_ref","==",gref), orderBy("order","asc")));
    }catch(e:any){ setErr(e.message||"Add item failed"); } finally{ setBusy(false); }
  };
  const editItemName  = (it:Item,v:string)=>updateDoc(doc(itemsCol,it.id),{name:v});
  const editItemPrice = (it:Item,v:string)=>updateDoc(doc(itemsCol,it.id),{price:v});
  const editItemDesc  = (it:Item,v:string)=>updateDoc(doc(itemsCol,it.id),{description:v});
  const toggleItem    = (it:Item)=>updateDoc(doc(itemsCol,it.id),{visible:!it.visible});
  const moveItem = async (from:number,to:number)=>{
    if (!selectedGroupId || to<0 || to>=items.length) return;
    const a=items[from], b=items[to]; const batch=writeBatch(db);
    batch.update(doc(itemsCol,a.id),{order:to}); batch.update(doc(itemsCol,b.id),{order:from});
    await batch.commit();
    await renumberQuery(query(itemsCol, where("group_ref","==",doc(groupsCol,selectedGroupId)), orderBy("order","asc")));
  };
  const deleteItem = async (it:Item)=>{
    try{ setBusy(true); await deleteDoc(doc(itemsCol,it.id));
      if (selectedGroupId){
        await renumberQuery(query(itemsCol, where("group_ref","==",doc(groupsCol,selectedGroupId)), orderBy("order","asc")));
      }
    }catch(e:any){ setErr(e.message||"Delete item failed"); } finally{ setBusy(false); }
  };

  /* ───────────── Group Images CRUD ───────────── */

  const addGroupImage = async () => {
    if (!selectedGroupId) return setErr("Choose a group first.");
    if (!newGrpImageFile)  return setErr("Pick an image to upload.");
    try{
      setBusy(true);
      const gref = doc(groupsCol, selectedGroupId);
      const url = await uploadToCloudinary(newGrpImageFile);
      const id = `${Date.now()}`;
      await setDoc(doc(groupImagesCol,id), {
        group_ref:gref, image_url:url,
        order:groupImages.length, visible:true,
      }, { merge:true });
      setNewGrpImageFile(null);
      await renumberQuery(query(groupImagesCol, where("group_ref","==",gref), orderBy("order","asc")));
    }catch(e:any){ setErr(e.message||"Add group image failed"); } finally{ setBusy(false); }
  };
  const replaceGroupImage = async (gi:GroupImage, f:File)=>{
    const url = await uploadToCloudinary(f);
    await updateDoc(doc(groupImagesCol,gi.id), { image_url:url });
  };
  
  const toggleGroupImage = (gi:GroupImage)=>updateDoc(doc(groupImagesCol,gi.id),{visible:!gi.visible});
  const moveGroupImage = async (from:number,to:number)=>{
    if (!selectedGroupId || to<0 || to>=groupImages.length) return;
    const a=groupImages[from], b=groupImages[to]; const batch=writeBatch(db);
    batch.update(doc(groupImagesCol,a.id),{order:to}); batch.update(doc(groupImagesCol,b.id),{order:from});
    await batch.commit();
    await renumberQuery(query(groupImagesCol, where("group_ref","==",doc(groupsCol,selectedGroupId)), orderBy("order","asc")));
  };
  const deleteGroupImage = async (gi:GroupImage)=>{
    try{ setBusy(true); await deleteDoc(doc(groupImagesCol,gi.id));
      if (selectedGroupId){
        await renumberQuery(query(groupImagesCol, where("group_ref","==",doc(groupsCol,selectedGroupId)), orderBy("order","asc")));
      }
    }catch(e:any){ setErr(e.message||"Delete group image failed"); } finally{ setBusy(false); }
  };

  /* ───────────── UI ───────────── */

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Menu Interfaces</h1>
        <p className="text-sm text-gray-500">Sections → Groups → Products (no images). Groups have their own image pager.</p>
      </header>

      {err && <div className="text-red-600">{err}</div>}

      {/* Sections */}
      <section className="space-y-3">
        <h2 className="text-xl font-medium">1) Sections (big title)</h2>
        <div className="border rounded p-3 grid gap-3 md:grid-cols-2">
          <LabeledInput label="Big title *" value={newSecTitle} onChange={setNewSecTitle} />
          <LabeledInput label="Optional description" value={newSecDesc} onChange={setNewSecDesc} />
          <div className="md:col-span-2">
            <button onClick={addSection} disabled={busy||!newSecTitle.trim()}
              className={`px-3 py-2 rounded text-white ${busy||!newSecTitle.trim()?"bg-gray-400":"bg-blue-600 hover:bg-blue-700"}`}>
              {busy ? "Adding…" : "Add section"}
            </button>
          </div>
        </div>
        <div className="grid gap-3">
          {sections.length===0 && <div className="text-sm text-gray-600">No sections yet.</div>}
          {sections.map((s,idx)=>(
            <div key={s.id} className={`border rounded p-3 flex flex-col md:flex-row md:items-center gap-3 ${selectedSectionId===s.id?"ring-2 ring-emerald-300":""}`}>
              <EditableInline label={`Big title (order ${s.order})`} value={s.title} onSave={(t)=>editSectionTitle(s,t)} />
              <EditableInline label="Description (optional)" value={s.description} onSave={(t)=>editSectionDesc(s,t)} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.visible} onChange={()=>toggleSection(s)} /> Visible</label>
              <div className="flex items-center gap-2">
                <button onClick={()=>moveSection(idx,idx-1)} disabled={idx===0} className={`px-2 py-1 rounded ${idx===0?"bg-gray-300":"bg-gray-200 hover:bg-gray-300"}`}>↑</button>
                <button onClick={()=>moveSection(idx,idx+1)} disabled={idx===sections.length-1} className={`px-2 py-1 rounded ${idx===sections.length-1?"bg-gray-300":"bg-gray-200 hover:bg-gray-300"}`}>↓</button>
                <button onClick={()=>deleteSection(s)} className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">Delete</button>
              </div>
              <button className="ml-auto px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm"
                onClick={()=>{ setSelectedSectionId(s.id); setSelectedGroupId(null); }}>
                {selectedSectionId===s.id ? "Selected" : "Select"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Groups */}
      <section className="space-y-3">
        <h2 className="text-xl font-medium">2) Groups (small title)</h2>
        {!selectedSectionId && <div className="text-sm text-gray-600">Select a section above to manage groups.</div>}
        {selectedSectionId && (
          <>
            <div className="border rounded p-3 grid gap-3 md:grid-cols-2">
              <LabeledInput label="Small title (optional)" value={newGrpTitle} onChange={setNewGrpTitle} />
              <LabeledInput label="Small title description (optional)" value={newGrpDesc} onChange={setNewGrpDesc} />
              <div className="md:col-span-2">
                <button onClick={addGroup} disabled={busy} className={`px-3 py-2 rounded text-white ${busy?"bg-gray-400":"bg-blue-600 hover:bg-blue-700"}`}>
                  {busy ? "Adding…" : "Add group"}
                </button>
              </div>
            </div>

            <div className="grid gap-3">
              {groups.length===0 && <div className="text-sm text-gray-600">No groups yet.</div>}
              {groups.map((g,idx)=>(
                <div key={g.id} className={`border rounded p-3 flex flex-col md:flex-row md:items-center gap-3 ${selectedGroupId===g.id?"ring-2 ring-emerald-300":""}`}>
                  <EditableInline label={`Small title (order ${g.order})`} value={g.title} onSave={(t)=>editGroupTitle(g,t)} />
                  <EditableInline label="Description (optional)" value={g.description} onSave={(t)=>editGroupDesc(g,t)} />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={g.visible} onChange={()=>toggleGroup(g)} /> Visible</label>
                  <div className="flex items-center gap-2">
                    <button onClick={()=>moveGroup(idx,idx-1)} disabled={idx===0} className={`px-2 py-1 rounded ${idx===0?"bg-gray-300":"bg-gray-200 hover:bg-gray-300"}`}>↑</button>
                    <button onClick={()=>moveGroup(idx,idx+1)} disabled={idx===groups.length-1} className={`px-2 py-1 rounded ${idx===groups.length-1?"bg-gray-300":"bg-gray-200 hover:bg-gray-300"}`}>↓</button>
                    <button onClick={()=>deleteGroup(g)} className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">Delete</button>
                  </div>
                  <button className="ml-auto px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm"
                    onClick={()=>setSelectedGroupId(g.id)}>
                    {selectedGroupId===g.id ? "Selected" : "Select"}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Group Images (pager) */}
      <section className="space-y-3">
        <h2 className="text-xl font-medium">2.5) Group Images (pager)</h2>
        {!selectedGroupId && <div className="text-sm text-gray-600">Select a group above to manage images.</div>}
        {selectedGroupId && (
          <>
            <div className="border rounded p-3 space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-gray-600">Image *</span>
                  <input type="file" accept="image/*" onChange={(e)=>setNewGrpImageFile(e.target.files?.[0] ?? null)} />
                </label>
                
              </div>
              <button onClick={addGroupImage} disabled={busy || !newGrpImageFile}
                className={`px-3 py-2 rounded text-white ${busy||!newGrpImageFile?"bg-gray-400":"bg-blue-600 hover:bg-blue-700"}`}>
                {busy ? "Adding…" : "Add group image"}
              </button>
            </div>

            <div className="grid gap-3">
              {groupImages.length===0 && <div className="text-sm text-gray-600">No images yet.</div>}
              {groupImages.map((gi,idx)=>(
                <div key={gi.id} className="border rounded p-3 flex flex-col md:flex-row md:items-center gap-3">
                  {gi.image_url
                    ? <img src={cl(gi.image_url, "f_auto,q_auto,w_160,h_100,c_fill")} className="w-40 h-24 object-cover rounded" alt="" />
                    : <div className="w-40 h-24 bg-gray-100 rounded grid place-items-center text-xs text-gray-500">No image</div>}
                 
                  <label className="text-sm text-gray-600">
                    Replace image
                    <input className="block mt-1" type="file" accept="image/*"
                      onChange={(e)=>e.target.files?.[0] && replaceGroupImage(gi, e.target.files[0])}/>
                  </label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={gi.visible} onChange={()=>toggleGroupImage(gi)} /> Visible</label>
                  <div className="flex items-center gap-2">
                    <button onClick={()=>moveGroupImage(idx,idx-1)} disabled={idx===0} className={`px-2 py-1 rounded ${idx===0?"bg-gray-300":"bg-gray-200 hover:bg-gray-300"}`}>↑</button>
                    <button onClick={()=>moveGroupImage(idx,idx+1)} disabled={idx===groupImages.length-1} className={`px-2 py-1 rounded ${idx===groupImages.length-1?"bg-gray-300":"bg-gray-200 hover:bg-gray-300"}`}>↓</button>
                    <button onClick={()=>deleteGroupImage(gi)} className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Items (no images) */}
      <section className="space-y-3">
        <h2 className="text-xl font-medium">3) Products</h2>
        {!selectedGroupId && <div className="text-sm text-gray-600">Select a group above to manage products.</div>}
        {selectedGroupId && (
          <>
            <div className="border rounded p-3 space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <LabeledInput label="Name *" value={newItemName} onChange={setNewItemName}/>
                <LabeledInput label="Price *" value={newItemPrice} onChange={setNewItemPrice} placeholder="e.g. 10 or 5 - 24"/>
              </div>
              <LabeledTextArea label="Description (optional)" rows={3} value={newItemDesc} onChange={setNewItemDesc}/>
              <button onClick={addItem} disabled={busy || !newItemName.trim() || !newItemPrice.trim()}
                className={`px-3 py-2 rounded text-white ${busy||!newItemName.trim()||!newItemPrice.trim()?"bg-gray-400":"bg-blue-600 hover:bg-blue-700"}`}>
                {busy ? "Adding…" : "Add product"}
              </button>
            </div>

            <div className="grid gap-3">
              {items.length===0 && <div className="text-sm text-gray-600">No products yet.</div>}
              {items.map((it,idx)=>(
                <div key={it.id} className="border rounded p-3 flex flex-col md:flex-row md:items-center gap-3">
                  <EditableInline label={`Name (order ${it.order})`} value={it.name} onSave={(v)=>editItemName(it,v)}/>
                  <EditableInline label="Price" value={it.price} onSave={(v)=>editItemPrice(it,v)}/>
                  <EditableInline label="Description" value={it.description} onSave={(v)=>editItemDesc(it,v)}/>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={it.visible} onChange={()=>toggleItem(it)}/> Visible</label>

                  {/* View details */}
                  <a
  href={`/dashboard/menu/item/${it.id}`}
  className="px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
>
  View
</a>

                  <div className="flex items-center gap-2">
                    <button onClick={()=>moveItem(idx,idx-1)} disabled={idx===0}
                            className={`px-2 py-1 rounded ${idx===0?"bg-gray-300":"bg-gray-200 hover:bg-gray-300"}`}>↑</button>
                    <button onClick={()=>moveItem(idx,idx+1)} disabled={idx===items.length-1}
                            className={`px-2 py-1 rounded ${idx===items.length-1?"bg-gray-300":"bg-gray-200 hover:bg-gray-300"}`}>↓</button>
                    <button onClick={()=>deleteItem(it)} className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/* ───────────── small inputs ───────────── */

function LabeledInput(props:{ label:string; value:string; onChange:(v:string)=>void; placeholder?:string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-gray-600">{props.label}</span>
      <input className="border p-2 rounded" value={props.value} placeholder={props.placeholder}
        onChange={(e)=>props.onChange(e.target.value)} />
    </label>
  );
}
function LabeledTextArea(props:{ label:string; value:string; onChange:(v:string)=>void; placeholder?:string; rows?:number }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-gray-600">{props.label}</span>
      <textarea className="border p-2 rounded" rows={props.rows ?? 3} value={props.value} placeholder={props.placeholder}
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
        <input className="border p-2 rounded w-full" value={val} onChange={(e)=>setVal(e.target.value)} disabled={!editing}/>
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
