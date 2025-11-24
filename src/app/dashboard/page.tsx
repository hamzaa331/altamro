// src/app/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";


import { useUserRole } from "@/hooks/useUserRole";
import {
  DashboardShell,
  type DashboardAction,
} from "@/components/dashboard-shell";
import RequireRole from "@/components/RequireRole";


export default function DashboardPage() {
  const r = useRouter();
  const { loading, uid, role } = useUserRole();
  const [displayName, setDisplayName] = useState("Utilisateur");
const [displayEmail, setDisplayEmail] = useState("contact@altamaro.com");


  // Redirection si pas connecté ou pas de rôle
  useEffect(() => {
    if (!loading) {
      if (!uid || !role) {
        r.replace("/login");
      }
    }
  }, [loading, uid, role, r]);

  useEffect(() => {
  if (!loading && uid) {
    const authUser = auth.currentUser;

    // valeurs par défaut depuis Auth
    if (authUser) {
      if (authUser.displayName) setDisplayName(authUser.displayName);
      if (authUser.email) setDisplayEmail(authUser.email);
    }

    // puis on essaie de compléter avec Firestore /user/{uid}
    const ref = doc(db, "user", uid);
    getDoc(ref).then((snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as any;
      const nameFromDoc =
        data.display_name ||
        `${data.Prnom || ""} ${data.nomFamille || ""}`.trim();
      const emailFromDoc = data.email;

      if (nameFromDoc) setDisplayName(nameFromDoc);
      if (emailFromDoc) setDisplayEmail(emailFromDoc);
    });
  }
}, [loading, uid]);


  if (loading || !uid || !role) {
    return <div className="p-6">Chargement...</div>;
  }

  const user = auth.currentUser;

  // 🔐 Toutes les actions possibles (admin voit tout)
  const allActions: DashboardAction[] = [
        // ----- PAGES -----

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
      desc: "Gestion du contenu principal",
      icon: "🏠",
      section: "Pages",
    },
    {
      href: "/dashboard/pages-common",
      title: "Interface Commune",
      desc: "Contenu partagé",
      icon: "🧩",
      section: "Pages",
    },
    {
      href: "/dashboard/restaurant",
      title: "Page Restaurant",
      desc: "Images & vidéos",
      icon: "🏨",
      section: "Pages",
    },

    // ----- CARTE & PRODUITS -----
    {
      href: "/dashboard/menu",
      title: "Menus",
      desc: "Sections & produits",
      icon: "🍽️",
      section: "Carte & Produits",
    },
    {
      href: "/dashboard/menu/all",
      title: "Tous les Produits",
      desc: "Liste complète",
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

    // ----- CLIENTS -----
    {
      href: "/dashboard/reservations",
      title: "Réservations",
      desc: "Demandes clients",
      icon: "📅",
      section: "Clients",
    },
    {
      href: "/dashboard/reclamations",
      title: "Réclamations",
      desc: "Messages & réclamations",
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

    // ----- MARQUE -----
    {
      href: "/dashboard/branding",
      title: "Branding & Réseaux",
      desc: "Logos et liens sociaux",
      icon: "🎨",
      section: "Marque",
    },
    {
      href: "/dashboard/card",
      title: "Vidéos",
      desc: "Télécharger & gérer",
      icon: "🎞️",
      section: "Marque",
    },

    // ----- OUTILS -----
    
    {
      href: "/dashboard/administration",
      title: "Administration",
      desc: "Rôles & accès staff",
      icon: "🧑‍💼",
      section: "Administration",
    },
  ];

  // 🎯 Filtrage des actions selon le rôle
  let actions: DashboardAction[] = [];

  if (role === "admin") {
    actions = allActions;
  } else if (role === "chef") {
    actions = allActions.filter((a) =>
      [
        "/dashboard/menu",
        "/dashboard/menu/all",
        "/dashboard/categories",
        "/dashboard/statistics",
      ].includes(a.href)
    );
  } else if (role === "responsable_pages") {
    actions = allActions.filter((a) =>
      [
        "/dashboard/home",
        "/dashboard/pages-common",
        "/dashboard/restaurant",
        "/dashboard/branding",
        "/dashboard/card",
        "/dashboard/statistics",
      ].includes(a.href)
    );
  } else if (role === "responsable_clients") {
  const allowed = new Set<string>([
    "/dashboard/statistics",
    "/dashboard/reservations",
    "/dashboard/reclamations",
    "/dashboard/users",
  ]);
  actions = allActions.filter((a) => allowed.has(a.href));
}


    return (
    <RequireRole
      allow={[
        "admin",
        "chef",
        "responsable_pages",
        "responsable_clients",
      ]}
    >
      <DashboardShell
        uid={uid}
        userName={displayName}
  userEmail={displayEmail}
  userRole={role}          
       
        actions={actions}
        onSignOut={async () => {
          await signOut(auth);
          r.replace("/login");
        }}
      >
        <div className="space-y-10">
          <div>
            <h1
              className="text-4xl font-extrabold"
              style={{ color: "#2f4632" }}
            >
              Tableau de Bord
            </h1>
            <p className="text-sm mt-2" style={{ color: "#43484f" }}>
              Gérez l’ensemble du restaurant selon votre rôle.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
            {actions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="
                  p-7 rounded-3xl border shadow-md hover:shadow-xl transition-all hover:-translate-y-1
                "
                style={{
                  backgroundColor: "#ffffffee",
                  borderColor: "#e8e2d7",
                }}
              >
                <div className="text-4xl mb-4">{a.icon}</div>
                <h2
                  className="text-lg font-bold"
                  style={{ color: "#2f4632" }}
                >
                  {a.title}
                </h2>
                <p
                  className="text-sm mt-1"
                  style={{ color: "#43484f" }}
                >
                  {a.desc}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </DashboardShell>
    </RequireRole>
  );
}

