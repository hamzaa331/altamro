// app/dashboard/branding/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";


import {
  DashboardShell,
  type DashboardAction,
} from "@/components/dashboard-shell";

import RequireRole from "@/components/RequireRole";
import { useUserRole } from "@/hooks/useUserRole";



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

/* ───────── Outer page with dashboard ───────── */

function BrandingPageInner() {
    const r = useRouter();
  const { uid, role, loading: roleLoading } = useUserRole();

  const [userName, setUserName] = useState("Utilisateur");
  const [userEmail, setUserEmail] = useState("contact@altamaro.com");

  // si pas connecté → login
  useEffect(() => {
    if (!roleLoading && !uid) {
      r.replace("/login");
    }
  }, [roleLoading, uid, r]);

  // même logique que /dashboard : Auth puis doc "user/{uid}"
  useEffect(() => {
    if (!roleLoading && uid) {
      const authUser = auth.currentUser;

      if (authUser) {
        if (authUser.displayName) setUserName(authUser.displayName);
        if (authUser.email) setUserEmail(authUser.email);
      }

      const ref = doc(db, "user", uid);
      getDoc(ref).then((snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as any;
        const nameFromDoc =
          data.display_name ||
          `${data.Prnom || ""} ${data.nomFamille || ""}`.trim();
        const emailFromDoc = data.email;

        if (nameFromDoc) setUserName(nameFromDoc);
        if (emailFromDoc) setUserEmail(emailFromDoc);
      });
    }
  }, [roleLoading, uid]);

  if (roleLoading || !uid || !role) {
    return <div className="p-6">Chargement…</div>;
  }



 // 🔐 Liste complète des actions possibles
  const allActions: DashboardAction[] = [
    {
      href: "/dashboard/statistics",
      title: "Statistiques",
      desc: "Vue d’ensemble, tops, activité",
      icon: "📊",
      section: "Analyse",
    },

    {
      href: "/dashboard/home",
      title: "Accueil",
      desc: "Contenu principal de l’app.",
      icon: "🏠",
      section: "Pages",
    },
    {
      href: "/dashboard/pages-common",
      title: "Interface Commune",
      desc: "Éléments partagés.",
      icon: "🧩",
      section: "Pages",
    },
    {
      href: "/dashboard/restaurant",
      title: "Page Restaurant",
      desc: "Textes, images & vidéos.",
      icon: "🏨",
      section: "Pages",
    },

    {
      href: "/dashboard/menu",
      title: "Menus",
      desc: "Sections, groupes & produits.",
      icon: "🍽️",
      section: "Carte & Produits",
    },
    {
      href: "/dashboard/menu/all",
      title: "Tous les Produits",
      desc: "Liste complète.",
      icon: "🛒",
      section: "Carte & Produits",
    },
    {
      href: "/dashboard/categories",
      title: "Catégories",
      desc: "Entrées, plats, desserts…",
      icon: "📂",
      section: "Carte & Produits",
    },

    {
      href: "/dashboard/reservations",
      title: "Réservations",
      desc: "Demandes clients.",
      icon: "📅",
      section: "Clients",
    },
    {
      href: "/dashboard/reclamations",
      title: "Réclamations",
      desc: "Messages & réclamations.",
      icon: "✉️",
      section: "Clients",
    },
    {
      href: "/dashboard/users",
      title: "Utilisateurs app",
      desc: "Profils, blocage & bannissement.",
      icon: "👤",
      section: "Clients",
    },

    {
      href: "/dashboard/branding",
      title: "Branding & Réseaux",
      desc: "Logo et liens sociaux.",
      icon: "🎨",
      section: "Marque",
    },
    {
      href: "/dashboard/card",
      title: "Vidéos",
      desc: "Télécharger & gérer.",
      icon: "🎞️",
      section: "Marque",
    },
     {
      href: "/dashboard/administration",
      title: "Administration",
      desc: "Rôles & accès staff",
      icon: "🧑‍💼",
      section: "Administration",
    },
  ];

  // 🎯 Filtrer les actions selon le rôle
  let actions: DashboardAction[] = [];

  if (role === "admin") {
    actions = allActions;
  } else if (role === "responsable_pages") {
    // responsable_pages : uniquement Pages + Marque + Statistiques
    const allowed = new Set([
      "/dashboard/statistics",
      "/dashboard/home",
      "/dashboard/pages-common",
      "/dashboard/restaurant",
      "/dashboard/branding",
      "/dashboard/card",
    ]);
    actions = allActions.filter((a) => allowed.has(a.href));
  } else {
    // ne devrait pas arriver car RequireRole bloque déjà,
    // mais par sécurité on renvoie un menu vide.
    actions = [];
  }


  return (
    <DashboardShell
      uid={uid}
      userName={userName}
      userEmail={userEmail}
      userRole={role || undefined}
      actions={actions}
      onSignOut={async () => {
        await signOut(auth);
        r.replace("/login");
      }}
>
      <BrandingInner />
    </DashboardShell>
  );
}

/* ───────── Default export with role protection ───────── */

export default function BrandingPage() {
  return (
    <RequireRole allow={["admin", "responsable_pages"]}>
      <BrandingPageInner />
    </RequireRole>
  );
}


/* ───────── Inner content (fonctionnalité inchangée) ───────── */

function BrandingInner() {
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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#2f4632]">
            Branding & Réseaux
          </h1>
          <p className="text-sm text-[#43484f]">
            Gérez le logo du site et les liens vers vos réseaux sociaux.
          </p>
        </div>
        <button
          onClick={save}
          disabled={busy || !dirty}
          className={`px-4 py-2 rounded-2xl text-sm font-medium text-white ${
            busy || !dirty
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-[#2f4632] hover:bg-[#243527]"
          }`}
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </header>

      {err && <div className="text-sm text-red-600">{err}</div>}

      {/* Logo */}
      <section className="border border-gray-200 rounded-2xl p-4 md:p-5 space-y-4 bg-white shadow-sm">
        <h2 className="text-lg font-semibold text-[#2f4632]">Logo</h2>
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="w-44">
            {data.logo_url ? (
              <img
                src={data.logo_url}
                className="w-44 h-44 object-contain bg-white rounded-xl border border-gray-200"
                alt="Logo preview"
              />
            ) : (
              <div className="w-44 h-44 grid place-items-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-500 text-center px-2">
                Aucun logo configuré
              </div>
            )}
          </div>

          <div className="flex-1 space-y-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">
                Télécharger un nouveau logo
              </label>
              <input
                type="file"
                accept="image/*"
                className="text-xs"
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
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">
                Ou coller l’URL du logo
              </label>
              <input
                className="border border-gray-200 p-2 rounded-xl w-full text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#b1853c]"
                value={data.logo_url}
                onChange={(e) => {
                  setData((d) => ({ ...d, logo_url: e.target.value }));
                  setDirty(true);
                }}
                placeholder="https://…"
              />
              <p className="text-[11px] text-gray-400">
                Format recommandé : PNG ou SVG sur fond transparent.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Socials */}
      <section className="border border-gray-200 rounded-2xl p-4 md:p-5 space-y-4 bg-white shadow-sm">
        <h2 className="text-lg font-semibold text-[#2f4632]">Liens sociaux</h2>
        <p className="text-xs text-gray-500">
          Ces liens s’affichent dans l’application (footer / page contact). Tu
          peux désactiver un réseau sans effacer son URL.
        </p>

        <SocialRow
          label="Instagram"
          placeholder="https://instagram.com/altamaro"
          enabled={data.instagram_enabled}
          url={data.instagram_url}
          onChange={(u, en) => {
            setData((d) => ({ ...d, instagram_url: u, instagram_enabled: en }));
            setDirty(true);
          }}
        />
        <SocialRow
          label="TikTok"
          placeholder="https://www.tiktok.com/@altamaro"
          enabled={data.tiktok_enabled}
          url={data.tiktok_url}
          onChange={(u, en) => {
            setData((d) => ({ ...d, tiktok_url: u, tiktok_enabled: en }));
            setDirty(true);
          }}
        />
        <SocialRow
          label="Facebook"
          placeholder="https://facebook.com/altamaro"
          enabled={data.facebook_enabled}
          url={data.facebook_url}
          onChange={(u, en) => {
            setData((d) => ({ ...d, facebook_url: u, facebook_enabled: en }));
            setDirty(true);
          }}
        />
        <SocialRow
          label="Google Maps"
          placeholder="https://maps.google.com/…"
          enabled={data.maps_enabled}
          url={data.maps_url}
          onChange={(u, en) => {
            setData((d) => ({ ...d, maps_url: u, maps_enabled: en }));
            setDirty(true);
          }}
        />

        <p className="text-[11px] text-gray-400">
          Astuce : vérifie que chaque lien commence bien par{" "}
          <code className="bg-gray-100 px-1 rounded">https://</code>.
        </p>
      </section>
    </div>
  );
}

/* small helper component */
function SocialRow(props: {
  label: string;
  url: string;
  enabled: boolean;
  placeholder?: string;
  onChange: (url: string, enabled: boolean) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-[140px_1fr_auto] items-center">
      <div className="text-sm font-medium text-[#43484f]">{props.label}</div>
      <input
        className="border border-gray-200 p-2 rounded-xl w-full text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#b1853c]"
        value={props.url}
        placeholder={props.placeholder || "https://…"}
        onChange={(e) => props.onChange(e.target.value, props.enabled)}
      />
      <label className="flex items-center justify-end gap-2 text-xs text-[#43484f]">
        <input
          type="checkbox"
          checked={props.enabled}
          onChange={(e) => props.onChange(props.url, e.target.checked)}
        />
        Activé
      </label>
    </div>
  );
}
