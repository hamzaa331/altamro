// src/app/reset-password/page.tsx
"use client";

import { useState } from "react";

type Props = {
  searchParams: {
    token?: string;
  };
};

export default function ResetPasswordPage({ searchParams }: Props) {
  const token = searchParams.token ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!token) {
      setError("Lien invalide ou expiré.");
      return;
    }

    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/account/confirm-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });

      const data = await res.json();
      if (!res.ok || data.ok !== true) {
        throw new Error(data.error || "Échec de la réinitialisation du mot de passe");
      }

      setMessage("Votre mot de passe a été réinitialisé avec succès.");
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2 text-center">
          Réinitialiser votre mot de passe
        </h1>
        <p className="text-sm text-slate-600 mb-6 text-center">
          Choisissez un nouveau mot de passe pour votre compte Altamaro.
        </p>

        {!token && (
          <p className="text-sm text-red-600 mb-4 text-center">
            Lien invalide ou expiré.
          </p>
        )}

        {token && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Confirmer le nouveau mot de passe
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">
                {error}
              </p>
            )}
            {message && (
              <p className="text-sm text-emerald-600">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-amber-600 text-white text-sm font-medium py-2.5 hover:bg-amber-700 disabled:opacity-60"
            >
              {loading ? "Enregistrement..." : "Valider le nouveau mdp"}
            </button>
            <h1 className="text-2xl font-semibold text-slate-900 mb-2 text-center">
  RESET PAGE v999
</h1>
          </form>
        )}
      </div>
    </div>
  );
}
