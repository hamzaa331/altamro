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
  order: number;       // order within the group
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
  const itemImagesCol = useMemo(() => collection(db, "menu_item_images"), []);

  const [items, setItems] = useState<Item[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

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
        query(itemImagesCol, where("item_ref", "==", thisItemRef), limit(400))
      );
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  async function renumberGroup(groupRef: any) {
    const snap = await getDocs(
      query(itemsCol, where("group_ref", "==", groupRef), orderBy("order", "asc"))
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
        query(itemsCol, where("group_ref", "==", it.group_ref), orderBy("order", "asc"))
      );
      const siblings = snap.docs.map((d) => ({ id: d.id, order: (d.data() as any).order ?? 0 }));
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
    if (!confirm(`Delete “${it.name}”? This removes details and gallery too.`)) return;
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

  /* --------- filtering + split sections --------- */
  const filtered = items.filter((it) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (
      it.name.toLowerCase().includes(q) ||
      it.description.toLowerCase().includes(q) ||
      it.price.toLowerCase().includes(q)
    );
  });

  const withDetails = filtered.filter((i) => i.has_details);
  const withoutDetails = filtered.filter((i) => !i.has_details);

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">All Products</h1>
        <div className="flex gap-2">
          <input
            className="border rounded px-3 py-2 w-64"
            placeholder="Search name / price / desc…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </header>

      {err && <div className="text-red-600">{err}</div>}

      {/* Section 1 — Products WITH details (on top) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">
            Products with details <span className="text-gray-500">({withDetails.length})</span>
          </h2>
        </div>

        {withDetails.length === 0 ? (
          <div className="text-sm text-gray-500">None yet.</div>
        ) : (
          <div className="space-y-4">
            {withDetails.map((it) => (
              <Row
                key={it.id}
                it={it}
                busyId={busyId}
                onSave={saveField}
                onToggle={toggleVisible}
                onMove={move}
                onDelete={deleteItem}
                onView={() => r.push(`/dashboard/menu/item/${it.id}`)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Section 2 — Other products (no details yet) */}
      <section className="space-y-3 border-t pt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">
            Other products <span className="text-gray-500">({withoutDetails.length})</span>
          </h2>
        </div>

        {withoutDetails.length === 0 ? (
          <div className="text-sm text-gray-500">No other products.</div>
        ) : (
          <div className="space-y-4">
            {withoutDetails.map((it) => (
              <Row
                key={it.id}
                it={it}
                busyId={busyId}
                onSave={saveField}
                onToggle={toggleVisible}
                onMove={move}
                onDelete={deleteItem}
                onView={() => r.push(`/dashboard/menu/item/${it.id}`)}
              />
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-gray-500">
        Tip: ordering moves items within their group only.
      </p>
    </div>
  );
}

/* ---------- small row component to keep JSX tidy ---------- */
function Row(props: {
  it: Item;
  busyId: string | null;
  onSave: (it: Item, patch: Partial<Item>) => Promise<void>;
  onToggle: (it: Item) => Promise<void>;
  onMove: (it: Item, dir: "up" | "down") => Promise<void>;
  onDelete: (it: Item) => Promise<void>;
  onView: () => void;
}) {
  const { it, busyId, onSave, onToggle, onMove, onDelete, onView } = props;

  return (
    <div className="border rounded p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      {/* Left: Editable fields */}
      <div className="grid gap-2 md:grid-cols-3 md:gap-4 flex-1">
        {/* name */}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">
            Name <span className="opacity-60">(order {it.order})</span>
          </span>
          <div className="flex gap-2">
            <input
              className="border rounded px-2 py-1 w-full"
              defaultValue={it.name}
              onBlur={(e) =>
                e.target.value.trim() !== it.name &&
                onSave(it, { name: e.target.value.trim() })
              }
            />
            <button
              className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
              onClick={(e) => {
                const el = (e.currentTarget.previousSibling as HTMLInputElement)!;
                onSave(it, { name: el.value.trim() });
              }}
              disabled={busyId === it.id}
            >
              Edit
            </button>
          </div>
        </label>

        {/* price */}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Price</span>
          <div className="flex gap-2">
            <input
              className="border rounded px-2 py-1 w-full"
              defaultValue={it.price}
              onBlur={(e) =>
                e.target.value.trim() !== it.price &&
                onSave(it, { price: e.target.value.trim() })
              }
            />
            <button
              className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
              onClick={(e) => {
                const el = (e.currentTarget.previousSibling as HTMLInputElement)!;
                onSave(it, { price: el.value.trim() });
              }}
              disabled={busyId === it.id}
            >
              Edit
            </button>
          </div>
        </label>

        {/* short description */}
        <label className="flex flex-col gap-1 md:col-span-1">
          <span className="text-xs text-gray-500">Description</span>
          <div className="flex gap-2">
            <input
              className="border rounded px-2 py-1 w-full"
              defaultValue={it.description}
              onBlur={(e) =>
                e.target.value !== it.description &&
                onSave(it, { description: e.target.value })
              }
            />
            <button
              className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
              onClick={(e) => {
                const el = (e.currentTarget.previousSibling as HTMLInputElement)!;
                onSave(it, { description: el.value });
              }}
              disabled={busyId === it.id}
            >
              Edit
            </button>
          </div>
        </label>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        {/* visible */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={it.visible}
            onChange={() => onToggle(it)}
          />
          Visible
        </label>

        {/* view */}
        <button
          className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
          onClick={onView}
        >
          View
        </button>

        {/* reorder (within group) */}
        <button
          className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
          onClick={() => onMove(it, "up")}
          disabled={busyId === it.id}
          title="Move up (within its group)"
        >
          ↑
        </button>
        <button
          className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
          onClick={() => onMove(it, "down")}
          disabled={busyId === it.id}
          title="Move down (within its group)"
        >
          ↓
        </button>

        {/* delete */}
        <button
          className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
          onClick={() => onDelete(it)}
          disabled={busyId === it.id}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
