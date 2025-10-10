"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function DashboardPage() {
  const r = useRouter();
  const [uid, setUid] = useState<string | null>(null);

  // Redirect to /login if not signed in
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) r.replace("/login");
      else setUid(user.uid);
    });
    return () => unsub();
  }, [r]);

  if (!uid) return <div className="p-6">Loading…</div>;

  // Actions shown on the dashboard
  const actions = [
    {
      href: "/dashboard/home",
      title: "Edit Home Page",
      desc: "Manage hero, texts, videos and sections of the Home page.",
    },
    {
      href: "/dashboard/categories",
      title: "Categories List",
      desc: "Add, reorder, show/hide categories (Entrées, Plats, Desserts…).",
    },
    {
      href: "/dashboard/pages-common",
      title: "Interface Commun",
      desc: "Shared content for all category pages (hero, videos, chef text, dessert gallery).",
    },
    // Already added: Card (video-only admin)
    {
      href: "/dashboard/card",
      title: "Card",
      desc: "Upload and manage videos (1 per page).",
    },
    // 🔹 NEW: Menu Interfaces (dynamic menu builder)
    {
      href: "/dashboard/menu",
      title: "Menu Interfaces",
      desc: "Build your dynamic menu: sections, titles, products, prices, descriptions & images.",
    },
    {
  href: "/dashboard/menu/all",
  title: "All Products",
  desc: "Manage every product in one place: edit, reorder, toggle visibility, view or delete.",
},
{
  href: "/dashboard/reservations",
  title: "Reservations",
  desc: "View all reservations grouped by today, upcoming and past.",
},
{
  href: "/dashboard/branding",
  title: "Branding & Social",
  desc: "Logo and social links (Instagram, TikTok, Facebook, Google Maps).",
}

  ];

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-gray-500">
            Signed in as <code className="font-mono">{uid}</code>
          </p>
        </div>
        <button
          className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300"
          onClick={async () => {
            await signOut(auth);
            r.replace("/login");
          }}
        >
          Sign out
        </button>
      </header>

      {/* Action grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group block rounded-xl border border-gray-200 p-5 hover:shadow-md transition"
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-medium">{a.title}</h2>
              <span className="text-gray-400 group-hover:text-gray-600">→</span>
            </div>
            <p className="mt-2 text-sm text-gray-600">{a.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
