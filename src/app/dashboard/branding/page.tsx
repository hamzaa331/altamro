// app/dashboard/branding/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

/* ───────── Types & defaults ───────── */

type BrandingDoc = {
  logo_url: string;

  instagram_url: string;
  tiktok_url: string;
  facebook_url: string;
  maps_url: string;

  instagram_enabled: boolean;
  tiktok_enabled: boolean;
  facebook_enabled: boolean;
  maps_enabled: boolean;
};

const EMPTY: BrandingDoc = {
  logo_url: "",

  instagram_url: "",
  tiktok_url: "",
  facebook_url: "",
  maps_url: "",

  instagram_enabled: true,
  tiktok_enabled: true,
  facebook_enabled: true,
  maps_enabled: true,
};

/* ───────── Helpers ───────── */

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

function normalizeUrl(u: string) {
  if (!u) return "";
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/* ───────── Page ───────── */

export default function BrandingPage() {
  const r = useRouter();

  // simple auth gate
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) r.replace("/login");
      else setUid(user.uid);
    });
    return () => unsub();
  }, [r]);

  const brandingRef = useMemo(() => doc(db, "settings", "branding"), []);
  const [data, setData] = useState<BrandingDoc>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // live subscribe
  useEffect(() => {
    const unsub = onSnapshot(
      brandingRef,
      (snap) => {
        setData(snap.exists() ? ({ ...EMPTY, ...(snap.data() as any) }) : EMPTY);
        setDirty(false);
      },
      (e) => setErr(e.message)
    );
    return () => unsub();
  }, [brandingRef]);

  const save = async () => {
    try {
      setBusy(true);
      const payload: BrandingDoc = {
        ...data,
        instagram_url: normalizeUrl(data.instagram_url),
        tiktok_url: normalizeUrl(data.tiktok_url),
        facebook_url: normalizeUrl(data.facebook_url),
        maps_url: normalizeUrl(data.maps_url),
      };
      await setDoc(brandingRef, payload, { merge: true });
      setDirty(false);
      setErr(null);
    } catch (e: any) {
      setErr(e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (!uid) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Branding & Social</h1>
          <p className="text-sm text-gray-500">Edit site logo and social links.</p>
        </div>
        <button
          onClick={save}
          disabled={busy || !dirty}
          className={`px-4 py-2 rounded text-white ${busy || !dirty ? "bg-gray-400" : "bg-emerald-600 hover:bg-emerald-700"}`}
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </header>

      {err && <div className="text-red-600">{err}</div>}

      {/* Logo */}
      <section className="border rounded p-4 space-y-3">
        <h2 className="text-lg font-medium">Logo</h2>
        <div className="flex items-start gap-4">
          <div className="w-44">
            {data.logo_url ? (
              <img src={data.logo_url} className="w-44 h-44 object-contain bg-white rounded border" alt="Logo preview" />
            ) : (
              <div className="w-44 h-44 grid place-items-center rounded border bg-gray-50 text-sm text-gray-500">
                No logo
              </div>
            )}
          </div>

          <div className="flex-1 space-y-2">
            <label className="block text-sm text-gray-600">Upload new logo</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                e.target.files?.[0] &&
                (async () => {
                  try {
                    setBusy(true);
                    const url = await uploadToCloudinary(e.target.files![0]);
                    setData((d) => ({ ...d, logo_url: url }));
                    setDirty(true);
                  } catch (e: any) {
                    setErr(e.message || "Upload failed");
                  } finally {
                    setBusy(false);
                  }
                })()
              }
            />

            <label className="block text-sm text-gray-600 mt-3">Or paste logo URL</label>
            <input
              className="border p-2 rounded w-full"
              value={data.logo_url}
              onChange={(e) => { setData((d) => ({ ...d, logo_url: e.target.value })); setDirty(true); }}
              placeholder="https://…"
            />
          </div>
        </div>
      </section>

      {/* Socials */}
      <section className="border rounded p-4 space-y-4">
        <h2 className="text-lg font-medium">Social links</h2>

        <SocialRow
          label="Instagram"
          enabled={data.instagram_enabled}
          url={data.instagram_url}
          onChange={(u, en) => { setData((d) => ({ ...d, instagram_url: u, instagram_enabled: en })); setDirty(true); }}
        />
        <SocialRow
          label="TikTok"
          enabled={data.tiktok_enabled}
          url={data.tiktok_url}
          onChange={(u, en) => { setData((d) => ({ ...d, tiktok_url: u, tiktok_enabled: en })); setDirty(true); }}
        />
        <SocialRow
          label="Facebook"
          enabled={data.facebook_enabled}
          url={data.facebook_url}
          onChange={(u, en) => { setData((d) => ({ ...d, facebook_url: u, facebook_enabled: en })); setDirty(true); }}
        />
        <SocialRow
          label="Google Maps"
          enabled={data.maps_enabled}
          url={data.maps_url}
          onChange={(u, en) => { setData((d) => ({ ...d, maps_url: u, maps_enabled: en })); setDirty(true); }}
        />
        <p className="text-xs text-gray-500">Tip: You can disable a link without deleting the URL.</p>
      </section>
    </div>
  );
}

/* small helper component */
function SocialRow(props: {
  label: string;
  url: string;
  enabled: boolean;
  onChange: (url: string, enabled: boolean) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[140px_1fr_auto] items-center">
      <div className="text-sm text-gray-600">{props.label}</div>
      <input
        className="border p-2 rounded w-full"
        value={props.url}
        placeholder="https://…"
        onChange={(e) => props.onChange(e.target.value, props.enabled)}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={props.enabled}
          onChange={(e) => props.onChange(props.url, e.target.checked)}
        />
        Enabled
      </label>
    </div>
  );
}
