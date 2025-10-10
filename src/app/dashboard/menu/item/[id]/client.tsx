// app/dashboard/menu/item/[id]/client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
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

/* ---------- utils ---------- */

async function uploadToCloudinary(file: File) {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;
  if (!cloud || !preset) throw new Error("Cloudinary env vars missing");

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
  if (!url) return "";
  const marker = "/upload/";
  const i = url.indexOf(marker);
  return i === -1 ? url : url.replace(marker, `/upload/${transform}/`);
}

// Show “€” nicely.
function euro(price: string) {
  const p = price?.trim();
  if (!p) return "";
  const n = Number(p.replace(",", "."));
  if (!Number.isNaN(n) && /^\s*\d+[.,]?\d*\s*$/.test(p)) {
    return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  }
  return `${p} €`;
}

// true only if BOTH long description and ingredients are present (non-empty)
function computeHasDetails(detail: string, ing: string) {
  return Boolean(detail?.trim() && ing?.trim());
}

/* ---------- types ---------- */

type Item = {
  id: string;
  group_ref: any;
  name: string;
  price: string;
  description: string;
  order: number;
  visible: boolean;
  detail_desc?: string;
  ingredients?: string;
  has_details?: boolean;
};

type ItemImage = {
  id: string;
  item_ref: any;
  image_url: string;
  order: number;
  visible: boolean;
};

/* ---------- component ---------- */

export default function ItemDetailsClient({ id }: { id: string }) {
  const router = useRouter();

  const itemRef = useMemo(() => doc(db, "menu_items", id), [id]);
  const itemImagesCol = useMemo(() => collection(db, "menu_item_images"), []);

  const [item, setItem] = useState<Item | null>(null);
  const [images, setImages] = useState<ItemImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // local fields
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [detailDesc, setDetailDesc] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);

  /* subscriptions */
  useEffect(() => {
    const unsubItem = onSnapshot(
      itemRef,
      async (snap) => {
        if (!snap.exists()) {
          setItem(null);
          return;
        }
        const x = snap.data() as any;
        const it: Item = {
          id: snap.id,
          group_ref: x.group_ref,
          name: x.name ?? "",
          price: x.price ?? "",
          description: x.description ?? "",
          order: x.order ?? 0,
          visible: x.visible ?? true,
          detail_desc: x.detail_desc ?? "",
          ingredients: x.ingredients ?? "",
          has_details: x.has_details ?? false,
        };

        // Keep the has_details flag correct even if someone changed fields elsewhere
        const should = computeHasDetails(it.detail_desc || "", it.ingredients || "");
        if ((x.has_details ?? false) !== should) {
          try {
            await updateDoc(itemRef, { has_details: should });
            it.has_details = should;
          } catch {
            /* ignore */
          }
        }

        setItem(it);
        setName(it.name);
        setPrice(it.price);
        setDetailDesc(it.detail_desc || "");
        setIngredients(it.ingredients || "");
      },
      (e) => setErr(e.message)
    );

    const unsubImgs = onSnapshot(
      query(itemImagesCol, where("item_ref", "==", itemRef), orderBy("order", "asc")),
      (snap) => {
        setImages(
          snap.docs.map((d, i) => {
            const x = d.data() as any;
            return {
              id: d.id,
              item_ref: x.item_ref,
              image_url: x.image_url ?? "",
              order: x.order ?? i,
              visible: x.visible ?? true,
            };
          })
        );
      },
      (e) => setErr(e.message)
    );

    return () => {
      unsubItem();
      unsubImgs();
    };
  }, [itemRef, itemImagesCol]);

  if (item === null) {
    return <div className="p-6">This product was not found (or has been deleted).</div>;
  }

  /* helpers */
  async function renumberImages() {
    const snap = await getDocs(query(itemImagesCol, where("item_ref", "==", itemRef), orderBy("order", "asc")));
    const batch = writeBatch(db);
    snap.docs.forEach((d, i) => batch.update(d.ref, { order: i }));
    await batch.commit();
  }

  async function deleteAllImages() {
    // NOTE: This deletes Firestore image records. It does NOT delete the files from Cloudinary.
    // Doing that securely requires a server-side endpoint with your Cloudinary secret.
    while (true) {
      const snap = await getDocs(query(itemImagesCol, where("item_ref", "==", itemRef), limit(400)));
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  /* save basic fields */
  async function saveBasics() {
    try {
      setBusy(true);
      const trimmedDetail = detailDesc.trim();
      const trimmedIngr = ingredients.trim();
      const detailsFlag = computeHasDetails(trimmedDetail, trimmedIngr);

      await updateDoc(itemRef, {
        name: name.trim(),
        price: price.trim(),
        // keep both keys in sync
        detail_desc: trimmedDetail,
        ingredients: trimmedIngr,
        has_details: detailsFlag,
      });
    } catch (e: any) {
      setErr(e.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  /* images */
  async function addImage() {
    if (!newFile) return;
    try {
      setBusy(true);
      const url = await uploadToCloudinary(newFile);
      const newId = `${Date.now()}`;
      await setDoc(
        doc(itemImagesCol, newId),
        { item_ref: itemRef, image_url: url, order: images.length, visible: true },
        { merge: true }
      );
      setNewFile(null);
      await renumberImages();
    } catch (e: any) {
      setErr(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function replaceImage(im: ItemImage, f: File) {
    try {
      setBusy(true);
      const url = await uploadToCloudinary(f);
      await updateDoc(doc(itemImagesCol, im.id), { image_url: url });
    } catch (e: any) {
      setErr(e.message || "Replace failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleImage(im: ItemImage) {
    await updateDoc(doc(itemImagesCol, im.id), { visible: !im.visible });
  }

  async function moveImage(from: number, to: number) {
    if (to < 0 || to >= images.length) return;
    const a = images[from],
      b = images[to];
    const batch = writeBatch(db);
    batch.update(doc(itemImagesCol, a.id), { order: to });
    batch.update(doc(itemImagesCol, b.id), { order: from });
    await batch.commit();
    await renumberImages();
  }

  async function deleteImage(im: ItemImage) {
    try {
      setBusy(true);
      await deleteDoc(doc(itemImagesCol, im.id));
      await renumberImages();
    } finally {
      setBusy(false);
    }
  }

  /* delete ONLY the details (and gallery), keep product */
  async function deleteDetailsOnly() {
    if (!window.confirm("Delete this product's details and gallery? This cannot be undone.")) return;
    try {
      setBusy(true);
      // 1) remove images
      await deleteAllImages();
      // 2) clear detail fields and reset flag
      await updateDoc(itemRef, {
        detail_desc: "",
        ingredients: "",
        has_details: false,
      });
      // 3) clear local UI
      setDetailDesc("");
      setIngredients("");
    } catch (e: any) {
      setErr(e.message || "Failed to delete details");
    } finally {
      setBusy(false);
    }
  }

  /* delete product (cascade) */
  async function deleteItemAndBack() {
    if (!window.confirm("Delete the entire product with its details and gallery? This cannot be undone.")) return;
    try {
      setBusy(true);
      await deleteAllImages();
      await deleteDoc(itemRef);
      router.push("/dashboard/menu");
    } catch (e: any) {
      setErr(e.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  /* UI */
  return (
    <div className="p-6 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Product details</h1>
        <div className="flex gap-2">
          <button
  type="button"
  onClick={() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      // go to previous page in history
      router.back();
    } else {
      // direct entry (no history): go to the list page
      router.push("/dashboard/menu");
    }
  }}
  className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300"
  aria-label="Go back"
>
  ← Back
</button>

          <button
            onClick={deleteDetailsOnly}
            className="px-3 py-2 rounded bg-amber-600 text-white hover:bg-amber-700"
            disabled={busy}
            title="Delete only the details & gallery, keep the product"
          >
            {busy ? "Working…" : "Delete details"}
          </button>
          <button
            onClick={deleteItemAndBack}
            className="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700"
            disabled={busy}
            title="Delete the entire product"
          >
            {busy ? "Deleting…" : "Delete product"}
          </button>
        </div>
      </header>

      {err && <div className="text-red-600">{err}</div>}

      {/* Basics */}
      <section className="space-y-3">
        <h2 className="text-xl font-medium">Basics</h2>
        <div className="border rounded p-3 grid gap-3 md:grid-cols-2">
          <LabeledInput label="Title (name)" value={name} onChange={setName} />
          <LabeledInput
            label='Price (will display with "€")'
            value={price}
            onChange={setPrice}
            placeholder="e.g. 10 or 5 - 24"
          />
          <div className="md:col-span-2 grid gap-3">
            <LabeledTextArea rows={5} label="Description (long)" value={detailDesc} onChange={setDetailDesc} />
            <LabeledTextArea rows={4} label="Ingrédients" value={ingredients} onChange={setIngredients} />
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <button
              onClick={saveBasics}
              disabled={busy}
              className={`px-3 py-2 rounded text-white ${
                busy ? "bg-gray-400" : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
            {item?.has_details ? (
              <span className="text-sm text-emerald-700">has_details: true</span>
            ) : (
              <span className="text-sm text-gray-500">has_details: false</span>
            )}
          </div>
        </div>
      </section>

      {/* LIVE PREVIEW */}
      <section className="space-y-3">
        <h2 className="text-xl font-medium">Preview</h2>
        <div className="border rounded p-4 bg-white">
          <div className="flex items-start justify-between">
            <h3 className="text-2xl font-semibold text-amber-800">{name || "—"}</h3>
            <div className="text-xl text-amber-800">{price ? euro(price) : "—"}</div>
          </div>

          {detailDesc?.trim() ? (
            <div className="mt-5">
              <div className="text-lg font-semibold text-amber-800">Description</div>
              <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-gray-800">{detailDesc}</p>
            </div>
          ) : null}

          {ingredients?.trim() ? (
            <div className="mt-5">
              <div className="text-lg font-semibold text-amber-800">Ingrédients</div>
              <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-gray-800">{ingredients}</p>
            </div>
          ) : null}
        </div>
      </section>

      {/* Images */}
      <section className="space-y-3">
        <h2 className="text-xl font-medium">Images (gallery)</h2>
        <div className="border rounded p-3 space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">Add image</span>
            <input type="file" accept="image/*" onChange={(e) => setNewFile(e.target.files?.[0] ?? null)} />
          </label>
          <button
            onClick={addImage}
            disabled={busy || !newFile}
            className={`px-3 py-2 rounded text-white ${
              busy || !newFile ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {busy ? "Uploading…" : "Add image"}
          </button>
        </div>

        <div className="grid gap-3">
          {images.length === 0 && <div className="text-sm text-gray-600">No images yet.</div>}
          {images.map((im, idx) => (
            <div key={im.id} className="border rounded p-3 flex flex-col md:flex-row md:items-center gap-3">
              {im.image_url ? (
                <img
                  src={cl(im.image_url, "f_auto,q_auto,w_240,h_160,c_fill")}
                  alt=""
                  className="w-60 h-40 object-cover rounded"
                />
              ) : (
                <div className="w-60 h-40 bg-gray-100 rounded grid place-items-center text-xs text-gray-500">
                  No image
                </div>
              )}

              <label className="text-sm text-gray-600">
                Replace image
                <input
                  className="block mt-1"
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && replaceImage(im, e.target.files[0])}
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={im.visible} onChange={() => toggleImage(im)} />
                Visible
              </label>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => moveImage(idx, idx - 1)}
                  disabled={idx === 0}
                  className={`px-2 py-1 rounded ${idx === 0 ? "bg-gray-300" : "bg-gray-200 hover:bg-gray-300"}`}
                >
                  ↑
                </button>
                <button
                  onClick={() => moveImage(idx, idx + 1)}
                  disabled={idx === images.length - 1}
                  className={`px-2 py-1 rounded ${
                    idx === images.length - 1 ? "bg-gray-300" : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  ↓
                </button>
                <button
                  onClick={() => deleteImage(im)}
                  className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------- small inputs ---------- */

function LabeledInput(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-gray-600">{props.label}</span>
      <input
        className="border p-2 rounded"
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
    <label className="flex flex-col gap-1">
      <span className="text-sm text-gray-600">{props.label}</span>
      <textarea
        className="border p-2 rounded"
        rows={props.rows ?? 3}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}
