"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { signOut } from "firebase/auth";

import { db, auth } from "@/lib/firebase";
import RequireRole from "@/components/RequireRole";
import {
  DashboardShell,
  type DashboardAction,
} from "@/components/dashboard-shell";
import { useUserRole } from "@/hooks/useUserRole";

/* ---------- types ---------- */

type AppUserStatus = "active" | "blocked" | "banned";

type AppUser = {
  id: string; // doc id
  uid: string; // uid field if present
  email?: string;
  display_name?: string;
  Prnom?: string;
  nomFamille?: string;
  phone_number?: string;
  adress?: string;
  date_birth?: string;
  created_time?: any;
  account_status: AppUserStatus;
  banned_until?: any | null; // Firestore Timestamp ou null
};

/* ---------- helpers bannissement ---------- */

type BanCode =
  | "1d"
  | "2d"
  | "3d"
  | "5d"
  | "1w"
  | "2w"
  | "3w"
  | "1m"
  | "2m"
  | "3m"
  | "6m"
  | "10m"
  | "12m";

/** Retourne une Date de fin de bannissement à partir du code choisi */
function computeBanEnd(code: BanCode): Date {
  const end = new Date();
  if (code.endsWith("d")) {
    const days = parseInt(code.replace("d", ""), 10);
    end.setDate(end.getDate() + days);
  } else if (code.endsWith("w")) {
    const weeks = parseInt(code.replace("w", ""), 10);
    end.setDate(end.getDate() + weeks * 7);
  } else if (code.endsWith("m")) {
    const months = parseInt(code.replace("m", ""), 10);
    end.setMonth(end.getMonth() + months);
  }
  return end;
}

/* ========================================================= */
/*                      INNER CONTENT                        */
/* ========================================================= */

function UsersInner() {
  const usersCol = useMemo(() => collection(db, "user"), []);
  const userRolesCol = useMemo(() => collection(db, "user_roles"), []);

  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AppUserStatus>(
    "all"
  );

  // ---- load users (exclude staff with roles) ----
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [usersSnap, rolesSnap] = await Promise.all([
          getDocs(usersCol),
          getDocs(userRolesCol),
        ]);

        const staffIds = new Set<string>(rolesSnap.docs.map((d) => d.id));
        const nowMs = Date.now();
        const fixes: Promise<void>[] = [];

        const list: AppUser[] = [];
        usersSnap.forEach((d) => {
          const data = d.data() as any;
          const uid = data.uid || d.id;

          // ❌ ignorer les comptes qui ont un rôle (staff)
          if (staffIds.has(uid)) return;

          let status: AppUserStatus =
            (data.account_status as AppUserStatus) || "active";
          let bannedUntil: any = data.banned_until ?? null;

          // 🔁 auto-déban si la date est dépassée
          if (status === "banned" && bannedUntil) {
            let endMs: number | null = null;
            if (typeof bannedUntil.toMillis === "function") {
              endMs = bannedUntil.toMillis();
            } else if (typeof bannedUntil.seconds === "number") {
              endMs = bannedUntil.seconds * 1000;
            }

            if (endMs !== null && endMs < nowMs) {
              status = "active";
              bannedUntil = null;
              fixes.push(
                updateDoc(doc(usersCol, d.id), {
                  account_status: "active",
                  banned_until: null,
                })
              );
            }
          }

          list.push({
            id: d.id,
            uid,
            email: data.email,
            display_name: data.display_name,
            Prnom: data.Prnom,
            nomFamille: data.nomFamille,
            phone_number: data.phone_number,
            adress: data.adress,
            date_birth: data.date_birth,
            created_time: data.created_time,
            account_status: status,
            banned_until: bannedUntil,
          });
        });

        if (fixes.length) {
          await Promise.all(fixes);
        }

        // tri simple : plus récent en bas
        list.sort((a, b) => {
          const ta = a.created_time?.seconds ?? 0;
          const tb = b.created_time?.seconds ?? 0;
          return ta - tb;
        });

        setUsers(list);
      } catch (e: any) {
        setErr(e.message || "Erreur lors du chargement des utilisateurs.");
      } finally {
        setLoading(false);
      }
    })();
  }, [usersCol, userRolesCol]);

  // ---- actions ----

  const saveUser = async (id: string, patch: Partial<AppUser>) => {
    const ref = doc(usersCol, id);
    const payload: any = { ...patch };

    // enlever les champs locaux qui ne doivent pas être dans Firestore
    delete payload.id;
    delete payload.uid;

    await updateDoc(ref, payload);

    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...patch } : u))
    );
  };

  const deleteUser = async (id: string) => {
    if (
      !confirm(
        "Voulez-vous vraiment supprimer ce compte utilisateur ? Cette action est définitive."
      )
    )
      return;

    await deleteDoc(doc(usersCol, id));
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  // ---- derived list search + filtre ----
  const filteredUsers = users.filter((u) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      u.email?.toLowerCase().includes(q) ||
      u.display_name?.toLowerCase().includes(q) ||
      u.Prnom?.toLowerCase().includes(q) ||
      u.nomFamille?.toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === "all" || u.account_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (loading) return <div className="p-6">Chargement…</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* HEADER */}
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1
            className="text-3xl font-extrabold"
            style={{ color: "#2f4632" }}
          >
            Utilisateurs de l’application
          </h1>
          <p className="text-sm mt-1" style={{ color: "#43484f" }}>
            Gérer les comptes des utilisateurs FlutterFlow (blocage,
            bannissement temporaire ou permanent, mise à jour des
            informations).
          </p>
        </div>
      </header>

      {err && (
        <div className="p-3 rounded-2xl bg-red-100 text-red-700 text-sm">
          {err}
        </div>
      )}

      {/* barre de recherche / filtre */}
      <section className="bg-white border border-[#e4ded1] rounded-2xl px-4 py-3 shadow-sm flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex-1">
          <input
            className="w-full border border-[#e4ded1] rounded-xl px-3 py-2 text-sm bg-[#faf9f6]"
            placeholder="Rechercher par nom, prénom ou email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 text-xs md:text-sm">
          <label className="flex items-center gap-2">
            <span style={{ color: "#43484f" }}>Statut :</span>
            <select
              className="border border-[#e4ded1] rounded-xl px-2 py-1 bg-white"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | AppUserStatus)
              }
            >
              <option value="all">Tous</option>
              <option value="active">Actifs</option>
              <option value="blocked">Bloqués</option>
              <option value="banned">Bannis</option>
            </select>
          </label>
          <span className="text-[11px] text-gray-500">
            {filteredUsers.length} / {users.length} utilisateur(s)
          </span>
        </div>
      </section>

      {/* liste des utilisateurs */}
      <section className="space-y-4">
        {filteredUsers.length === 0 && (
          <p className="text-sm text-gray-500">
            Aucun utilisateur ne correspond à ces critères.
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {filteredUsers.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              onSave={saveUser}
              onDelete={deleteUser}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/* ========================================================= */
/*                         USER CARD                         */
/* ========================================================= */

function UserCard({
  user,
  onSave,
  onDelete,
}: {
  user: AppUser;
  onSave: (id: string, patch: Partial<AppUser>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [form, setForm] = useState<AppUser>(user);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [banDuration, setBanDuration] = useState<BanCode | "">("");

  useEffect(() => {
    setForm(user);
    setBanDuration(""); // reset durée quand on reçoit un nouveau user
  }, [user]);

  const handleChange = (field: keyof AppUser, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleStatusChange = (value: AppUserStatus) => {
    setForm((f) => ({ ...f, account_status: value }));
  };

  const bannedUntilDate =
    form.banned_until && (form.banned_until as any).toDate
      ? (form.banned_until as any).toDate()
      : null;

  const handleSaveClick = async () => {
    setSaving(true);
    setLocalErr(null);
    try {
      let banned_until: any = form.banned_until ?? null;

      if (form.account_status === "banned") {
        // si une durée est choisie → on recalcule la date de fin
        if (banDuration) {
          const end = computeBanEnd(banDuration);
          banned_until = Timestamp.fromDate(end);
        }
        // si pas de durée choisie, on garde la valeur existante
      } else {
        // statut actif ou bloqué → on enlève toute date de ban
        banned_until = null;
      }

      await onSave(user.id, {
        display_name: form.display_name ?? "",
        Prnom: form.Prnom ?? "",
        nomFamille: form.nomFamille ?? "",
        email: form.email ?? "",
        phone_number: form.phone_number ?? "",
        adress: form.adress ?? "",
        date_birth: form.date_birth ?? "",
        account_status: form.account_status,
        banned_until,
      });

      setForm((f) => ({ ...f, banned_until }));
    } catch (e: any) {
      setLocalErr(e.message || "Erreur lors de l’enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = async () => {
    setDeleting(true);
    setLocalErr(null);
    try {
      await onDelete(user.id);
    } catch (e: any) {
      setLocalErr(e.message || "Erreur lors de la suppression.");
    } finally {
      setDeleting(false);
    }
  };

  const handleCancelBanClick = async () => {
    setSaving(true);
    setLocalErr(null);
    try {
      await onSave(user.id, {
        account_status: "active",
        banned_until: null,
      });
      setForm((f) => ({ ...f, account_status: "active", banned_until: null }));
      setBanDuration("");
    } catch (e: any) {
      setLocalErr(e.message || "Erreur lors de l’annulation du ban.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="p-5 rounded-3xl border shadow-md flex flex-col gap-3 bg-white"
      style={{ borderColor: "#e8e2d7" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold" style={{ color: "#2f4632" }}>
            {form.display_name ||
              `${form.Prnom || ""} ${form.nomFamille || ""}`.trim() ||
              "Utilisateur sans nom"}
          </p>
          <p className="text-xs break-all" style={{ color: "#43484f" }}>
            {form.email || "— email manquant —"}
          </p>
          <p className="text-[10px] mt-1 text-gray-500">uid: {form.uid}</p>
          {form.account_status === "banned" && bannedUntilDate && (
            <p className="text-[10px] mt-1 text-red-700">
              Bannissement jusqu’au{" "}
              {bannedUntilDate.toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </p>
          )}
        </div>

        <span
          className="px-3 py-1 rounded-full text-[11px] font-semibold"
          style={{
            backgroundColor:
              form.account_status === "active"
                ? "#e2f3e5"
                : form.account_status === "blocked"
                ? "#fff4d6"
                : "#fbe9e9",
            color:
              form.account_status === "banned" ? "#7a1f1f" : "#2f4632",
          }}
        >
          {form.account_status === "active"
            ? "Actif"
            : form.account_status === "blocked"
            ? "Bloqué"
            : "Banni"}
        </span>
      </div>

      {/* infos éditables */}
      <div className="grid gap-2 text-xs">
        <SmallInput
          label="Prénom"
          value={form.Prnom || ""}
          onChange={(v) => handleChange("Prnom", v)}
        />
        <SmallInput
          label="Nom"
          value={form.nomFamille || ""}
          onChange={(v) => handleChange("nomFamille", v)}
        />
        <SmallInput
          label="Nom d’affichage"
          value={form.display_name || ""}
          onChange={(v) => handleChange("display_name", v)}
        />
        <SmallInput
          label="Téléphone"
          value={form.phone_number || ""}
          onChange={(v) => handleChange("phone_number", v)}
        />
        <SmallInput
          label="Adresse"
          value={form.adress || ""}
          onChange={(v) => handleChange("adress", v)}
        />
        <SmallInput
          label="Date de naissance"
          value={form.date_birth || ""}
          onChange={(v) => handleChange("date_birth", v)}
        />
      </div>

      {/* statut & actions */}
      <div className="flex flex-col gap-2 mt-2 text-xs">
        <label className="flex items-center justify-between gap-2">
          <span style={{ color: "#43484f" }}>Statut du compte</span>
          <select
            className="border rounded-lg px-2 py-1 text-[11px]"
            style={{ borderColor: "#e8e2d7" }}
            value={form.account_status}
            onChange={(e) =>
              handleStatusChange(e.target.value as AppUserStatus)
            }
          >
            <option value="active">Actif</option>
            <option value="blocked">Bloqué</option>
            <option value="banned">Banni</option>
          </select>
        </label>

        {/* Choix de la durée si banni */}
        {form.account_status === "banned" && (
          <div className="flex flex-col gap-1 mt-1">
            <span className="text-[11px]" style={{ color: "#43484f" }}>
              Durée du bannissement
            </span>
            <select
              className="border rounded-lg px-2 py-1 text-[11px]"
              style={{ borderColor: "#e8e2d7" }}
              value={banDuration}
              onChange={(e) => setBanDuration(e.target.value as BanCode | "")}
            >
              <option value="">— Sans changement / ban manuel —</option>
              <optgroup label="Par jours">
                <option value="1d">1 jour</option>
                <option value="2d">2 jours</option>
                <option value="3d">3 jours</option>
                <option value="5d">5 jours</option>
              </optgroup>
              <optgroup label="Par semaines">
                <option value="1w">1 semaine</option>
                <option value="2w">2 semaines</option>
                <option value="3w">3 semaines</option>
              </optgroup>
              <optgroup label="Par mois">
                <option value="1m">1 mois</option>
                <option value="2m">2 mois</option>
                <option value="3m">3 mois</option>
                <option value="6m">6 mois</option>
                <option value="10m">10 mois</option>
                <option value="12m">12 mois</option>
              </optgroup>
            </select>
            <span className="text-[10px] text-gray-500">
              Si tu choisis une durée, la date de fin sera recalculée. Quand
              elle sera dépassée, le compte repassera en “Actif”
              automatiquement.
            </span>
          </div>
        )}

        {localErr && (
          <div className="text-[11px] text-red-600">{localErr}</div>
        )}

        <div className="flex items-center justify-between mt-2 gap-2">
          <button
            onClick={handleSaveClick}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold shadow-sm"
            style={{
              backgroundColor: saving ? "#9aa3a1" : "#2f4632",
              color: "#ffffff",
            }}
          >
            {saving ? "Enregistrement..." : "Sauvegarder"}
          </button>

          <div className="flex items-center gap-2">
            {form.account_status === "banned" && (
              <button
                onClick={handleCancelBanClick}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                style={{
                  backgroundColor: "#e4e7eb",
                  color: "#2f4632",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                Annuler le bannissement
              </button>
            )}

            <button
              onClick={handleDeleteClick}
              disabled={deleting}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
              style={{
                backgroundColor: "#fbe9e9",
                color: "#a42323",
                opacity: deleting ? 0.7 : 1,
              }}
            >
              {deleting ? "Suppression..." : "Supprimer le compte"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* petit input réutilisable */
function SmallInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span style={{ color: "#43484f" }}>{label}</span>
      <input
        className="border rounded-lg px-2 py-1 text-xs bg-[#faf9f6]"
        style={{ borderColor: "#e8e2d7" }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/* ========================================================= */
/*                     PAGE + DASHBOARDSHELL                 */
/* ========================================================= */

export default function UsersPage() {
  const r = useRouter();
  const { uid, role, loading: roleLoading } = useUserRole();

  const [userName, setUserName] = useState("Administrateur");
  const [userEmail, setUserEmail] = useState("contact@altamaro.com");

  // redirection si pas connecté
  useEffect(() => {
    if (!roleLoading && !uid) {
      r.replace("/login");
    }
  }, [roleLoading, uid, r]);

  // charger nom + email depuis /user/{uid}
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

  if (roleLoading || !uid || !role) {
    return <div className="p-6">Chargement…</div>;
  }

  // menu latéral
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
      desc: "Sections & produits.",
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
      desc: "Logos et liens sociaux.",
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

  let actions: DashboardAction[] = [];

  if (role === "admin") {
    actions = allActions;
  } else if (role === "responsable_clients") {
    const allowed = new Set<string>([
      "/dashboard/statistics",
      "/dashboard/reservations",
      "/dashboard/reclamations",
      "/dashboard/users",
    ]);
    actions = allActions.filter((a) => allowed.has(a.href));
  } else {
    actions = [];
  }

  return (
    <RequireRole allow={["admin", "responsable_clients"]}>
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
        <UsersInner />
      </DashboardShell>
    </RequireRole>
  );
}
