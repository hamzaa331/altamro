// src/app/dashboard/administration/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { useUserRole } from "@/hooks/useUserRole";

import {
  collection,
  doc,
  getDocs,
  getDoc,          // 🔹 AJOUTER ICI
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";

import { signOut } from "firebase/auth";


import RequireRole from "@/components/RequireRole";
import {
  DashboardShell,
  type DashboardAction,
} from "@/components/dashboard-shell";

type StaffRole =
  | "admin"
  | "chef"
  | "responsable_pages"
  | "responsable_clients";

type StaffDoc = {
  id: string; // uid
  email: string;
  display_name?: string;
  role: StaffRole;
  active: boolean;
  created_at?: any;
};

/* ---------------------------------------------------- */
/*              CONTENU INTERNE ADMIN PAGE              */
/* ---------------------------------------------------- */

function AdminInner() {
  const userRolesCol = useMemo(() => collection(db, "user_roles"), []);
  const usersCol = useMemo(() => collection(db, "user"), []);

  const [staff, setStaff] = useState<StaffDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // form create
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("chef");

  /* ---- live staff list ---- */
  useEffect(() => {
    const unsub = onSnapshot(
      query(userRolesCol, orderBy("created_at", "desc")),
      (snap) => {
        setStaff(
          snap.docs.map((d) => {
            const x = d.data() as any;
            return {
              id: d.id,
              email: x.email ?? "",
              display_name: x.display_name ?? "",
              role: x.role ?? "chef",
              active: x.active !== false,
              created_at: x.created_at,
            } as StaffDoc;
          })
        );
        setLoading(false);
      },
      (e) => {
        setErr(e.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [userRolesCol]);

  /* ---- helpers ---- */

  const createStaff = async () => {
    if (!email.trim()) {
      setErr("Veuillez saisir un email.");
      return;
    }
    try {
      setBusy(true);
      setErr(null);
      setInfo(null);

      const mail = email.trim().toLowerCase();

      // 1) on cherche dans la collection "user" l'utilisateur avec cet email
      const q = query(usersCol, where("email", "==", mail), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) {
        setErr(
          "Aucun utilisateur avec cet email dans la collection 'user'. " +
            "L'employé doit d'abord créer son compte côté app."
        );
        return;
      }

      const userDoc = snap.docs[0];
      const uid = (userDoc.data() as any).uid || userDoc.id;
      const display_name = (userDoc.data() as any).display_name || "";

      // 2) on crée / met à jour le doc dans user_roles
      await setDoc(
        doc(userRolesCol, uid),
        {
          role,
          email: mail,
          display_name,
          active: true,
          created_at: serverTimestamp(),
        },
        { merge: true }
      );

      setEmail("");
      setRole("chef");
      setInfo("Compte staff créé / mis à jour avec succès.");
    } catch (e: any) {
      setErr(e.message || "Erreur lors de la création du compte staff.");
    } finally {
      setBusy(false);
    }
  };

  const updateRole = async (s: StaffDoc, newRole: StaffRole) => {
    try {
      await updateDoc(doc(userRolesCol, s.id), { role: newRole });
    } catch (e: any) {
      setErr(e.message || "Erreur lors du changement de rôle.");
    }
  };

  const toggleActive = async (s: StaffDoc) => {
    try {
      await updateDoc(doc(userRolesCol, s.id), { active: !s.active });
    } catch (e: any) {
      setErr(e.message || "Erreur lors du changement de statut.");
    }
  };

  const deleteStaff = async (s: StaffDoc) => {
    if (!confirm(`Supprimer le rôle de ${s.email} ?`)) return;
    try {
      await deleteDoc(doc(userRolesCol, s.id));
    } catch (e: any) {
      setErr(e.message || "Erreur lors de la suppression.");
    }
  };

  /* ---- UI ---- */

  if (loading) return <div className="p-6">Chargement…</div>;

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-extrabold"
            style={{ color: "#2f4632" }}
          >
            Administration des comptes
          </h1>
          <p className="text-sm mt-2" style={{ color: "#43484f" }}>
            Gérer les rôles : Admin, Chef, Responsables contenu & clients.
          </p>
        </div>
      </header>

      {err && <div className="text-sm text-red-600">{err}</div>}
      {info && (
        <div className="text-sm" style={{ color: "#2f4632" }}>
          {info}
        </div>
      )}

      {/* Carte création compte */}
      <section
        className="p-6 rounded-3xl border shadow-md space-y-4"
        style={{ backgroundColor: "#ffffffee", borderColor: "#e8e2d7" }}
      >
        <h2 className="text-lg font-bold" style={{ color: "#2f4632" }}>
          Créer / attribuer un compte staff
        </h2>
        <p className="text-xs" style={{ color: "#43484f" }}>
          L’employé doit d’abord avoir un compte dans la collection{" "}
          <code>user</code> (app FlutterFlow). Ici, vous lui attribuez un rôle
          et un accès au back-office.
        </p>

        <div className="grid gap-4 md:grid-cols-[2fr_1fr_auto] items-end">
          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "#43484f" }}
            >
              Email de l’employé
            </label>
            <input
              className="border rounded-xl px-3 py-2 text-sm"
              style={{ borderColor: "#e8e2d7" }}
              placeholder="ex: chef@altamaro.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "#43484f" }}
            >
              Rôle
            </label>
            <select
              className="border rounded-xl px-3 py-2 text-sm"
              style={{ borderColor: "#e8e2d7" }}
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
            >
              <option value="chef">Chef (Carte & Produits)</option>
              <option value="responsable_pages">
                Responsable Contenu & Marque
              </option>
              <option value="responsable_clients">
                Responsable Clients (Réservations & Réclamations)
              </option>
              <option value="admin">Admin (accès complet)</option>
            </select>
          </div>

          <button
            onClick={createStaff}
            disabled={busy || !email.trim()}
            className="px-5 py-2.5 rounded-2xl text-sm font-semibold shadow-md transition-all hover:-translate-y-[1px]"
            style={{
              backgroundColor:
                busy || !email.trim() ? "#b7c2bb" : "#2f4632",
              color: "white",
              opacity: busy || !email.trim() ? 0.8 : 1,
            }}
          >
            {busy ? "Enregistrement..." : "Valider"}
          </button>
        </div>
      </section>

      {/* Liste des comptes staff */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold" style={{ color: "#2f4632" }}>
          Comptes staff existants
        </h2>

        {staff.length === 0 && (
          <p className="text-sm" style={{ color: "#43484f" }}>
            Aucun compte staff pour le moment.
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {staff.map((s) => (
            <div
              key={s.id}
              className="p-5 rounded-3xl border shadow-md flex flex-col gap-3"
              style={{
                backgroundColor: "#ffffff",
                borderColor: "#e8e2d7",
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p
                    className="text-sm font-bold"
                    style={{ color: "#2f4632" }}
                  >
                    {s.display_name || "Utilisateur sans nom"}
                  </p>
                  <p
                    className="text-xs break-all"
                    style={{ color: "#43484f" }}
                  >
                    {s.email}
                  </p>
                </div>
                <span
                  className="px-3 py-1 rounded-full text-[11px] font-semibold"
                  style={{
                    backgroundColor:
                      s.role === "admin"
                        ? "#2f4632"
                        : s.role === "chef"
                        ? "#b1853c"
                        : "#e8e2d7",
                    color: s.role === "admin" ? "#fff" : "#2f4632",
                  }}
                >
                  {s.role}
                </span>
              </div>

              <div className="flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span style={{ color: "#43484f" }}>Rôle</span>
                  <select
                    className="border rounded-lg px-2 py-1 text-[11px]"
                    style={{ borderColor: "#e8e2d7" }}
                    value={s.role}
                    onChange={(e) =>
                      updateRole(s, e.target.value as StaffRole)
                    }
                  >
                    <option value="chef">Chef</option>
                    <option value="responsable_pages">
                      Responsable pages
                    </option>
                    <option value="responsable_clients">
                      Responsable clients
                    </option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-2 mt-1">
                  <span style={{ color: "#43484f" }}>Statut</span>
                  <button
                    onClick={() => toggleActive(s)}
                    className="px-3 py-1 rounded-full text-[11px] font-semibold"
                    style={{
                      backgroundColor: s.active ? "#e2f3e5" : "#f4d6d6",
                      color: s.active ? "#2f4632" : "#7a1f1f",
                    }}
                  >
                    {s.active ? "Actif" : "Désactivé"}
                  </button>
                </div>
              </div>

              <div className="flex justify-end mt-2">
                <button
                  onClick={() => deleteStaff(s)}
                  className="px-3 py-1 rounded-lg text-[11px] font-semibold"
                  style={{
                    backgroundColor: "#fbe9e9",
                    color: "#a42323",
                  }}
                >
                  Supprimer le rôle
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------------------------------------------------- */
/*                PAGE AVEC DASHBOARDSHELL              */
/* ---------------------------------------------------- */

export default function AdministrationPage() {
  const r = useRouter();
  const { uid, role, loading: roleLoading } = useUserRole();

  const [userName, setUserName] = useState("Administrateur");
  const [userEmail, setUserEmail] = useState("contact@altamaro.com");

  // 🔐 Redirection si pas connecté / pas de rôle
  useEffect(() => {
    if (!roleLoading && (!uid || !role)) {
      r.replace("/login");
    }
  }, [roleLoading, uid, role, r]);

  // 👤 Charger le nom + email depuis Auth + Firestore (/user/{uid})
  useEffect(() => {
    if (!roleLoading && uid) {
      const authUser = auth.currentUser;

      if (authUser) {
        if (authUser.displayName) setUserName(authUser.displayName);
        if (authUser.email) setUserEmail(authUser.email);
      }

      const userRef = doc(db, "user", uid);
      getDoc(userRef).then((snap) => {
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

  // ✅ seulement après TOUS les hooks
  if (roleLoading || !uid || !role) {
    return <div className="p-6">Chargement…</div>;
  }


  const actions: DashboardAction[] = [

    // OUTILS
    {
      href: "/dashboard/statistics",
      title: "Statistiques",
      desc: "Analyse des performances",
      icon: "📊",
      section: "Outils",
    },
    // PAGES
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

    // CARTE & PRODUITS
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

    // CLIENTS
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
    {
  href: "/dashboard/comments",
  title: "Commentaires",
  desc: "Masquer ou supprimer.",
  icon: "💬",
  section: "Clients",
},

    // MARQUE
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

    
    {
      href: "/dashboard/administration",
      title: "Administration",
      desc: "Rôles & accès staff",
      icon: "🧑‍💼",
      section: "Administration",
    },
  ];

    return (
    <RequireRole allow={["admin"]}>
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
        <AdminInner />
      </DashboardShell>
    </RequireRole>
  );
}