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
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

/* ---------- types ---------- */
type Item = {
  id: string;
  group_ref: any; // DocumentReference (group)
  name: string;
  price: string;
  description: string; // short desc (not the long details)
  order: number; // order within the group
  visible: boolean;
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

export default function AllProductsClient() {
  const r = useRouter();
  const itemsCol = useMemo(() => collection(db, "menu_items"), []);
  const itemImagesCol = useMemo(
    () => collection(db, "menu_item_images"),
    []
  );

  const [items, setItems] = useState<Item[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // search + filtre visibilité + pagination
  const [filter, setFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<
    "all" | "visible" | "hidden"
  >("all");
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState<number>(1);

  // live list of all items (grouped then ordered)
  useEffect(() => {
    // NOTE: requires composite index: orderBy(group_ref) + orderBy(order)
    const q = query(itemsCol, orderBy("group_ref"), orderBy("order", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr: Item[] = snap.docs.map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            group_ref: x.group_ref,
            name: x.name ?? "",
            price: x.price ?? "",
            description: x.description ?? "",
            order: x.order ?? 0,
            visible: x.visible ?? true,
            has_details: x.has_details ?? false,
          };
        });
        setItems(arr);
      },
      (e) => setErr(e.message)
    );
    return () => unsub();
  }, [itemsCol]);

  async function deleteAllImages(itemId: string) {
    const thisItemRef = doc(db, "menu_items", itemId);
    while (true) {
      const snap = await getDocs(
        query(
          itemImagesCol,
          where("item_ref", "==", thisItemRef),
          limit(400)
        )
      );
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  async function renumberGroup(groupRef: any) {
    const snap = await getDocs(
      query(
        itemsCol,
        where("group_ref", "==", groupRef),
        orderBy("order", "asc")
      )
    );
    const batch = writeBatch(db);
    snap.docs.forEach((d, i) => batch.update(d.ref, { order: i }));
    await batch.commit();
  }

  async function saveField(it: Item, patch: Partial<Item>) {
    try {
      setBusyId(it.id);
      await updateDoc(doc(db, "menu_items", it.id), patch as any);
    } catch (e: any) {
      setErr(e.message || "Save failed");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleVisible(it: Item) {
    await saveField(it, { visible: !it.visible });
  }

  async function move(it: Item, dir: "up" | "down") {
    try {
      setBusyId(it.id);
      // load siblings in the same group, ordered
      const snap = await getDocs(
        query(
          itemsCol,
          where("group_ref", "==", it.group_ref),
          orderBy("order", "asc")
        )
      );
      const siblings = snap.docs.map((d) => ({
        id: d.id,
        order: (d.data() as any).order ?? 0,
      }));
      const idx = siblings.findIndex((s) => s.id === it.id);
      if (idx === -1) return;

      const to = dir === "up" ? idx - 1 : idx + 1;
      if (to < 0 || to >= siblings.length) return;

      const a = siblings[idx];
      const b = siblings[to];
      const batch = writeBatch(db);
      batch.update(doc(db, "menu_items", a.id), { order: to });
      batch.update(doc(db, "menu_items", b.id), { order: idx });
      await batch.commit();

      await renumberGroup(it.group_ref);
    } catch (e: any) {
      setErr(e.message || "Reorder failed");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteItem(it: Item) {
    if (
      !confirm(
        `Delete “${it.name}”? This removes details and gallery too.`
      )
    )
      return;
    try {
      setBusyId(it.id);
      await deleteAllImages(it.id);
      await deleteDoc(doc(db, "menu_items", it.id));
    } catch (e: any) {
      setErr(e.message || "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  /* --------- filtering + pagination --------- */
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return items.filter((it) => {
      const matchText =
        !q ||
        it.name.toLowerCase().includes(q) ||
        it.description.toLowerCase().includes(q) ||
        it.price.toLowerCase().includes(q);

      const matchVisibility =
        visibilityFilter === "all"
          ? true
          : visibilityFilter === "visible"
          ? it.visible
          : !it.visible;

      return matchText && matchVisibility;
    });
  }, [items, filter, visibilityFilter]);

  // on change filtre / taille page -> reset page à 1
  useEffect(() => {
    setPage(1);
  }, [filter, visibilityFilter, pageSize]);

  const allSorted = useMemo(() => {
    const w = filtered.filter((i) => i.has_details);
    const wo = filtered.filter((i) => !i.has_details);
    return [...w, ...wo]; // garde "avec détails" en premier
  }, [filtered]);

  const totalItems = allSorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);

  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = allSorted.slice(start, end);

  const pageWithDetails = pageItems.filter((i) => i.has_details);
  const pageWithoutDetails = pageItems.filter((i) => !i.has_details);

  const withDetailsCount = filtered.filter((i) => i.has_details).length;
  const withoutDetailsCount = filtered.filter(
    (i) => !i.has_details
  ).length;

  /* ---------- UI ---------- */

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1
            className="text-3xl font-extrabold"
            style={{ color: "#2f4632" }}
          >
            Tous les produits
          </h1>
          <p className="text-sm" style={{ color: "#43484f" }}>
            Vue globale des produits, avec{" "}
            <strong>recherche</strong>,{" "}
            <strong>filtres</strong> et{" "}
            <strong>pagination</strong>. L’ordre réel reste
            géré par le champ <code>order</code> dans chaque
            groupe.
          </p>
        </div>
      </div>

      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl px-4 py-2">
          {err}
        </div>
      )}

      {/* BARRE DE CONTROLES */}
      <div className="bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Search */}
        <div className="flex-1 flex items-center gap-2">
          <input
            className="border border-[#e4ded1] rounded-2xl px-4 py-2 text-sm w-full bg-[#faf9f6]"
            placeholder="Rechercher par nom, description ou prix…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {/* Filters + page size */}
        <div className="flex flex-wrap gap-3 items-center justify-end text-xs">
          {/* Visibility filter */}
          <div className="flex items-center gap-2">
            <span className="text-gray-600">Visibilité :</span>
            <select
              className="border border-[#e4ded1] rounded-xl px-2 py-1 bg-[#faf9f6]"
              value={visibilityFilter}
              onChange={(e) =>
                setVisibilityFilter(
                  e.target.value as "all" | "visible" | "hidden"
                )
              }
            >
              <option value="all">Tous</option>
              <option value="visible">Visibles</option>
              <option value="hidden">Masqués</option>
            </select>
          </div>

          {/* Page size */}
          <div className="flex items-center gap-2">
            <span className="text-gray-600">Par page :</span>
            <select
              className="border border-[#e4ded1] rounded-xl px-2 py-1 bg-[#faf9f6]"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </div>
        </div>
      </div>

      {/* PANELS PRODUITS */}
      <section className="space-y-6 bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-5">
        {/* Produits avec détails */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2
                className="text-lg font-semibold"
                style={{ color: "#2f4632" }}
              >
                Produits avec détails
              </h2>
              <p className="text-xs" style={{ color: "#43484f" }}>
                Produits ayant une page détail (images, description
                longue…).
              </p>
            </div>
            <span className="text-xs rounded-full px-3 py-1 bg-[#faf9f6] border border-[#e4ded1]">
              {withDetailsCount} produit(s)
            </span>
          </div>

          {pageWithDetails.length === 0 ? (
            <div className="text-sm text-gray-500">
              Aucun produit avec détails sur cette page.
            </div>
          ) : (
            <div className="space-y-3">
              {pageWithDetails.map((it) => (
                <Row
                  key={it.id}
                  it={it}
                  busyId={busyId}
                  onSave={saveField}
                  onToggle={toggleVisible}
                  onMove={move}
                  onDelete={deleteItem}
                  onView={() =>
                    r.push(`/dashboard/menu/item/${it.id}`)
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Autres produits */}
        <div className="space-y-3 border-t border-[#e4ded1] pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2
                className="text-lg font-semibold"
                style={{ color: "#2f4632" }}
              >
                Autres produits
              </h2>
              <p className="text-xs" style={{ color: "#43484f" }}>
                Produits sans page détail (nom, prix, description
                courte uniquement).
              </p>
            </div>
            <span className="text-xs rounded-full px-3 py-1 bg-[#faf9f6] border border-[#e4ded1]">
              {withoutDetailsCount} produit(s)
            </span>
          </div>

          {pageWithoutDetails.length === 0 ? (
            <div className="text-sm text-gray-500">
              Aucun autre produit sur cette page.
            </div>
          ) : (
            <div className="space-y-3">
              {pageWithoutDetails.map((it) => (
                <Row
                  key={it.id}
                  it={it}
                  busyId={busyId}
                  onSave={saveField}
                  onToggle={toggleVisible}
                  onMove={move}
                  onDelete={deleteItem}
                  onView={() =>
                    r.push(`/dashboard/menu/item/${it.id}`)
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* PAGINATION FOOTER */}
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>
          {totalItems === 0 ? (
            "Aucun produit."
          ) : (
            <>
              Produits{" "}
              <strong>
                {start + 1}–{Math.min(end, totalItems)}
              </strong>{" "}
              sur <strong>{totalItems}</strong>.
            </>
          )}
        </span>

        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 rounded-xl border border-[#e4ded1] bg-white disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
          >
            ← Précédent
          </button>
          <span>
            Page <strong>{currentPage}</strong> / {totalPages}
          </span>
          <button
            className="px-3 py-1 rounded-xl border border-[#e4ded1] bg-white disabled:opacity-50"
            onClick={() =>
              setPage((p) => Math.min(totalPages, p + 1))
            }
            disabled={currentPage >= totalPages}
          >
            Suivant →
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Tip : le déplacement ↑ / ↓ continue de modifier l’ordre réel
        dans chaque groupe via le champ <code>order</code>.
      </p>
    </div>
  );
}

/* ---------- small row component ---------- */
function Row(props: {
  it: Item;
  busyId: string | null;
  onSave: (it: Item, patch: Partial<Item>) => Promise<void>;
  onToggle: (it: Item) => Promise<void>;
  onMove: (it: Item, dir: "up" | "down") => Promise<void>;
  onDelete: (it: Item) => Promise<void>;
  onView: () => void;
}) {
  const { it, busyId, onSave, onToggle, onMove, onDelete, onView } =
    props;
  const disabled = busyId === it.id;

  return (
    <div className="border border-[#e4ded1] rounded-2xl p-3 flex flex-col gap-3 bg-[#faf9f6]">
      {/* Ligne info ordre + badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-600">
          Ordre groupe : <strong>{it.order}</strong>
        </span>
        {it.has_details && (
          <span className="text-[10px] px-2 py-1 rounded-full bg-[#2f4632] text-white">
            A une page détail
          </span>
        )}
      </div>

      {/* Champs éditables : nom plus visible */}
      <div className="grid gap-3 md:grid-cols-3 md:gap-4 flex-1">
        {/* name */}
        <label className="flex flex-col gap-1 text-sm md:col-span-1">
          <span className="text-xs text-gray-600">Nom</span>
          <div className="flex gap-2">
            <input
              className="border rounded-lg px-3 py-2 w-full text-sm font-semibold"
              defaultValue={it.name}
              onBlur={(e) =>
                e.target.value.trim() !== it.name &&
                onSave(it, { name: e.target.value.trim() })
              }
            />
            <button
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-[#e4ded1] hover:bg-[#d8cfbd]"
              onClick={(e) => {
                const el = e.currentTarget
                  .previousSibling as HTMLInputElement;
                onSave(it, { name: el.value.trim() });
              }}
              disabled={disabled}
            >
              Modifier
            </button>
          </div>
        </label>

        {/* price */}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-gray-600">Prix</span>
          <div className="flex gap-2">
            <input
              className="border rounded-lg px-3 py-2 w-full text-sm"
              defaultValue={it.price}
              onBlur={(e) =>
                e.target.value.trim() !== it.price &&
                onSave(it, { price: e.target.value.trim() })
              }
            />
            <button
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-[#e4ded1] hover:bg-[#d8cfbd]"
              onClick={(e) => {
                const el = e.currentTarget
                  .previousSibling as HTMLInputElement;
                onSave(it, { price: el.value.trim() });
              }}
              disabled={disabled}
            >
              Modifier
            </button>
          </div>
        </label>

        {/* short description */}
        <label className="flex flex-col gap-1 text-sm md:col-span-1">
          <span className="text-xs text-gray-600">
            Description courte
          </span>
          <div className="flex gap-2">
            <input
              className="border rounded-lg px-3 py-2 w-full text-sm"
              defaultValue={it.description}
              onBlur={(e) =>
                e.target.value !== it.description &&
                onSave(it, { description: e.target.value })
              }
            />
            <button
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-[#e4ded1] hover:bg-[#d8cfbd]"
              onClick={(e) => {
                const el = e.currentTarget
                  .previousSibling as HTMLInputElement;
                onSave(it, { description: el.value });
              }}
              disabled={disabled}
            >
              Modifier
            </button>
          </div>
        </label>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={it.visible}
              onChange={() => onToggle(it)}
            />
            <span>Visible</span>
          </label>

          <button
            className="px-3 py-1.5 rounded-lg font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={onView}
          >
            Détails
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="px-2.5 py-1 rounded-lg border border-[#d4cec2] bg-white"
            onClick={() => onMove(it, "up")}
            disabled={disabled}
            title="Monter (dans son groupe)"
          >
            ↑
          </button>
          <button
            className="px-2.5 py-1 rounded-lg border border-[#d4cec2] bg-white"
            onClick={() => onMove(it, "down")}
            disabled={disabled}
            title="Descendre (dans son groupe)"
          >
            ↓
          </button>
          <button
            className="px-3 py-1.5 rounded-lg font-semibold bg-red-600 text-white hover:bg-red-700"
            onClick={() => onDelete(it)}
            disabled={disabled}
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
