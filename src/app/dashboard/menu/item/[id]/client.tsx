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
    return `${n.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} €`;
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

type TabKey = "basics" | "preview" | "images";
type ImageFilter = "all" | "visible" | "hidden";

export default function ItemDetailsClient({ id }: { id: string }) {
  const router = useRouter();

  const itemRef = useMemo(() => doc(db, "menu_items", id), [id]);
  const itemImagesCol = useMemo(
    () => collection(db, "menu_item_images"),
    []
  );

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

  // onglets
  const [tab, setTab] = useState<TabKey>("basics");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");

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
        const should = computeHasDetails(
          it.detail_desc || "",
          it.ingredients || ""
        );
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
      query(
        itemImagesCol,
        where("item_ref", "==", itemRef),
        orderBy("order", "asc")
      ),
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
    return (
      <div className="p-6 max-w-3xl mx-auto">
        Ce produit n’existe plus (ou a été supprimé).
      </div>
    );
  }

  /* helpers */
  async function renumberImages() {
    const snap = await getDocs(
      query(
        itemImagesCol,
        where("item_ref", "==", itemRef),
        orderBy("order", "asc")
      )
    );
    const batch = writeBatch(db);
    snap.docs.forEach((d, i) => batch.update(d.ref, { order: i }));
    await batch.commit();
  }

  async function deleteAllImages() {
    // NOTE: This deletes Firestore image records. It does NOT delete the files from Cloudinary.
    // Doing that securely requires a server-side endpoint with your Cloudinary secret.
    while (true) {
      const snap = await getDocs(
        query(
          itemImagesCol,
          where("item_ref", "==", itemRef),
          limit(400)
        )
      );
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
        {
          item_ref: itemRef,
          image_url: url,
          order: images.length,
          visible: true,
        },
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
    if (
      !window.confirm(
        "Delete this product's details and gallery? This cannot be undone."
      )
    )
      return;
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
    if (
      !window.confirm(
        "Delete the entire product with its details and gallery? This cannot be undone."
      )
    )
      return;
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

  const filteredImages = images.filter((im) => {
    if (imageFilter === "visible") return im.visible;
    if (imageFilter === "hidden") return !im.visible;
    return true;
  });

  /* UI */
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* HEADER */}
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1
            className="text-3xl font-extrabold"
            style={{ color: "#2f4632" }}
          >
            Détails du produit
          </h1>
          <p className="text-sm" style={{ color: "#43484f" }}>
            Gérez la description longue, les ingrédients et la galerie
            d’images pour ce produit.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                window.history.length > 1
              ) {
                router.back();
              } else {
                router.push("/dashboard/menu");
              }
            }}
            className="px-3 py-2 rounded-xl text-sm font-medium border border-[#e4ded1] bg-white hover:bg-[#faf9f6]"
            aria-label="Go back"
          >
            ← Retour
          </button>

          <button
            onClick={deleteDetailsOnly}
            className="px-3 py-2 rounded-xl text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700"
            disabled={busy}
            title="Delete only the details & gallery, keep the product"
          >
            {busy ? "Working…" : "Supprimer les détails"}
          </button>
          <button
            onClick={deleteItemAndBack}
            className="px-3 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700"
            disabled={busy}
            title="Delete the entire product"
          >
            {busy ? "Deleting…" : "Supprimer le produit"}
          </button>
        </div>
      </header>

      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl px-4 py-2">
          {err}
        </div>
      )}

      {/* TABS NAV comme page menu */}
      <div className="flex flex-wrap gap-2 rounded-2xl p-1 bg-white shadow-sm border border-[#e4ded1]">
        {[
          { key: "basics", label: "Infos principales" },
          { key: "preview", label: "Aperçu" },
          { key: "images", label: "Images du produit" },
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

      {/* ========== PANEL BASICS ========== */}
      {tab === "basics" && (
        <section className="bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2
                className="text-lg font-semibold"
                style={{ color: "#2f4632" }}
              >
                Informations principales
              </h2>
              <p className="text-xs" style={{ color: "#43484f" }}>
                Titre, prix, description longue et ingrédients. Le champ{" "}
                <code>has_details</code> se met à jour automatiquement.
              </p>
            </div>
            <span className="text-xs rounded-full px-3 py-1 bg-[#faf9f6] border border-[#e4ded1]">
              has_details :{" "}
              <strong>{item?.has_details ? "true" : "false"}</strong>
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <LabeledInput
              label="Titre du produit"
              value={name}
              onChange={setName}
            />
            <LabeledInput
              label='Prix (affiché avec "€")'
              value={price}
              onChange={setPrice}
              placeholder="e.g. 10 ou 5 - 24"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <LabeledTextArea
              rows={5}
              label="Description longue"
              value={detailDesc}
              onChange={setDetailDesc}
            />
            <LabeledTextArea
              rows={5}
              label="Ingrédients"
              value={ingredients}
              onChange={setIngredients}
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={saveBasics}
              disabled={busy}
              className="px-4 py-2 rounded-xl text-sm font-semibold shadow"
              style={{
                backgroundColor: busy ? "#9aa3a1" : "#2f4632",
                color: "#ffffff",
              }}
            >
              {busy ? "Saving…" : "Enregistrer les modifications"}
            </button>
          </div>
        </section>
      )}

      {/* ========== PANEL PREVIEW ========== */}
      {tab === "preview" && (
        <section className="bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-6 space-y-3">
          <h2
            className="text-lg font-semibold"
            style={{ color: "#2f4632" }}
          >
            Aperçu (côté client)
          </h2>
          <p className="text-xs" style={{ color: "#43484f" }}>
            Cet aperçu reproduit la carte vue par le client : titre, prix,
            description et ingrédients.
          </p>

          <div className="mt-3 rounded-2xl border border-[#e4ded1] bg-[#faf9f6] p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-2xl font-semibold text-amber-800">
                {name || "Nom du produit"}
              </h3>
              <div className="text-xl font-semibold text-amber-800">
                {price ? euro(price) : "—"}
              </div>
            </div>

            {detailDesc?.trim() ? (
              <div className="mt-2">
                <div className="text-sm font-semibold text-amber-800">
                  Description
                </div>
                <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-gray-800">
                  {detailDesc}
                </p>
              </div>
            ) : null}

            {ingredients?.trim() ? (
              <div className="mt-3">
                <div className="text-sm font-semibold text-amber-800">
                  Ingrédients
                </div>
                <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-gray-800">
                  {ingredients}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      )}

      {/* ========== PANEL IMAGES ========== */}
      {tab === "images" && (
        <section className="bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-6 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2
                className="text-lg font-semibold"
                style={{ color: "#2f4632" }}
              >
                Images du produit
              </h2>
              <p className="text-xs" style={{ color: "#43484f" }}>
                Ces images s’affichent en carrousel sur la page détail du
                produit.
              </p>
            </div>

            {/* petit "filter" sur les images */}
            <div className="flex items-center gap-2 text-xs">
              <span style={{ color: "#43484f" }}>Filtrer :</span>
              <select
                className="border border-[#e4ded1] rounded-xl px-3 py-1 bg-white text-xs"
                value={imageFilter}
                onChange={(e) =>
                  setImageFilter(e.target.value as ImageFilter)
                }
              >
                <option value="all">Toutes</option>
                <option value="visible">Visibles</option>
                <option value="hidden">Masquées</option>
              </select>
              <span className="text-[11px] text-gray-500">
                {filteredImages.length} / {images.length} image(s)
              </span>
            </div>
          </div>

          <div className="border border-[#e4ded1] rounded-2xl p-4 space-y-3 bg-[#faf9f6]">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-700">Ajouter une image</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setNewFile(e.target.files?.[0] ?? null)
                }
              />
            </label>
            <button
              onClick={addImage}
              disabled={busy || !newFile}
              className="px-4 py-2 rounded-xl text-sm font-semibold shadow"
              style={{
                backgroundColor: busy || !newFile ? "#9aa3a1" : "#2f4632",
                color: "#ffffff",
              }}
            >
              {busy ? "Uploading…" : "Ajouter l’image"}
            </button>
          </div>

          <div className="space-y-3 max-h-[520px] overflow-auto pr-1">
            {filteredImages.length === 0 && (
              <div className="text-sm text-gray-600">
                Aucune image selon ce filtre.
              </div>
            )}
            {filteredImages.map((im, idx) => {
              const realIndex = images.findIndex((x) => x.id === im.id);
              return (
                <div
                  key={im.id}
                  className="border border-[#e4ded1] rounded-2xl p-3 flex flex-col md:flex-row md:items-center gap-3 bg-[#faf9f6]"
                >
                  {im.image_url ? (
                    <img
                      src={cl(
                        im.image_url,
                        "f_auto,q_auto,w_240,h_160,c_fill"
                      )}
                      alt=""
                      className="w-60 h-40 object-cover rounded-xl"
                    />
                  ) : (
                    <div className="w-60 h-40 bg-[#f4f4f2] rounded-xl grid place-items-center text-xs text-gray-500">
                      No image
                    </div>
                  )}

                  <div className="flex-1 flex flex-col gap-3 text-xs">
                    <label className="text-xs flex flex-col gap-1">
                      <span className="text-gray-700">
                        Remplacer l’image
                      </span>
                      <input
                        className="block"
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          e.target.files?.[0] &&
                          replaceImage(im, e.target.files[0])
                        }
                      />
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={im.visible}
                        onChange={() => toggleImage(im)}
                      />
                      Visible
                    </label>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => moveImage(realIndex, realIndex - 1)}
                        disabled={realIndex === 0}
                        className="px-2 py-1 rounded-lg border border-[#d4cec2] bg-white disabled:bg-[#e0e0dd]"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveImage(realIndex, realIndex + 1)}
                        disabled={realIndex === images.length - 1}
                        className="px-2 py-1 rounded-lg border border-[#d4cec2] bg-white disabled:bg-[#e0e0dd]"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => deleteImage(im)}
                        className="px-3 py-1 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
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

/* ---------- small inputs ---------- */

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
        className="border border-[#e4ded1] bg-[#faf9f6] p-2 rounded-xl text-sm"
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
      <span className="text-gray-700">{props.label}</span>
      <textarea
        className="border border-[#e4ded1] bg-[#faf9f6] p-2 rounded-xl text-sm"
        rows={props.rows ?? 3}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}
