// src/app/login/page.tsx
"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

export default function LoginPage() {
  const r = useRouter();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loginEmail = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pwd);
      r.push("/dashboard");
    } catch (e: any) {
      const msg =
        e?.code === "auth/invalid-credential"
          ? "Email ou mot de passe incorrect."
          : e?.code === "auth/user-not-found"
          ? "Aucun compte trouvé avec cet email."
          : e?.code === "auth/wrong-password"
          ? "Mot de passe incorrect."
          : "Impossible de vous connecter. Veuillez réessayer.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  const loginGoogle = async () => {
    setErr(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      r.push("/dashboard");
    } catch (e: any) {
      setErr("Connexion Google impossible pour le moment.");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8 bg-[#f4f1ea]">
      <div
        className="
          w-full max-w-4xl rounded-3xl border shadow-xl overflow-hidden
          bg-white border-[#e8e2d7]
        "
      >
        <div className="grid md:grid-cols-2">
          {/* LEFT : big logo / brand */}
          <div className="relative hidden md:flex items-center justify-center bg-gradient-to-br from-[#2f4632] to-[#435f47] p-8">
            <div className="text-center space-y-4">
              <div className="mx-auto w-40 h-40 relative">
                {/* 🔹 Put your logo file in /public and update the src if needed */}
                <Image
  src="https://res.cloudinary.com/dryxaquva/image/upload/v1759590547/l0khkr88b4egcl8hwy6g.jpg"
  alt="Altamaro"
  fill
  className="object-cover rounded-2xl shadow-2xl"
  priority
/>

              </div>
              <div className="space-y-1">
                <h1 className="text-2xl font-extrabold text-white tracking-wide">
                  Altamaro Back-Office
                </h1>
                <p className="text-sm text-[#e4f0e6]">
                  Gérez votre carte, vos réservations et votre marque
                  depuis un seul espace.
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT : login form */}
          <div className="p-8 sm:p-10 flex flex-col justify-center space-y-6">
            <div className="md:hidden mb-2">
              {/* Small logo on mobile */}
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10">
                  <Image
  src="https://res.cloudinary.com/dryxaquva/image/upload/v1759590547/l0khkr88b4egcl8hwy6g.jpg"
  alt="Altamaro"
  fill
  className="object-cover rounded-xl"
/>

                </div>
                <div>
                  <h1
                    className="text-xl font-extrabold"
                    style={{ color: "#2f4632" }}
                  >
                    Altamaro Back-Office
                  </h1>
                  <p className="text-xs" style={{ color: "#43484f" }}>
                    Connexion administrateur
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h2
                className="text-2xl font-extrabold"
                style={{ color: "#2f4632" }}
              >
                Se connecter
              </h2>
              <p className="text-sm mt-1" style={{ color: "#43484f" }}>
                Utilisez vos identifiants staff pour accéder au dashboard.
              </p>
            </div>

            {err && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-2">
                {err}
              </div>
            )}

            <form onSubmit={loginEmail} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: "#43484f" }}>
                  Email
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  className="w-full border border-[#e8e2d7] rounded-xl px-3 py-2 text-sm bg-[#faf9f6] focus:outline-none focus:ring-2 focus:ring-[#b1853c]/70"
                  placeholder="admin@altamaro.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: "#43484f" }}>
                  Mot de passe
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  className="w-full border border-[#e8e2d7] rounded-xl px-3 py-2 text-sm bg-[#faf9f6] focus:outline-none focus:ring-2 focus:ring-[#b1853c]/70"
                  placeholder="********"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => r.push("/login/reset-password")}
                  className="mt-1 text-xs underline-offset-2 hover:underline"
                  style={{ color: "#2f4632" }}
                >
                  Mot de passe oublié ?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || !email || !pwd}
                className="
                  w-full rounded-xl px-4 py-2.5 text-sm font-semibold
                  shadow-md transition-all
                  disabled:opacity-70 disabled:cursor-not-allowed
                "
                style={{
                  backgroundColor:
                    loading || !email || !pwd ? "#9aa3a1" : "#2f4632",
                  color: "#ffffff",
                }}
              >
                {loading ? "Connexion…" : "Se connecter"}
              </button>
            </form>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-[#e4ded1]" />
              <span className="text-[11px]" style={{ color: "#8a8477" }}>
                ou
              </span>
              <div className="h-px flex-1 bg-[#e4ded1]" />
            </div>

            <button
  onClick={loginGoogle}
  className="w-full flex items-center justify-center gap-3 border border-[#e4ded1] bg-white hover:bg-[#faf9f6] text-[#2f4632] font-medium py-3 rounded-2xl shadow-sm transition"
>
  <img
    src="/google.svg"
    alt="Google"
    className="w-5 h-5"
  />
  Continuer avec Google
</button>


            <p className="text-[11px] mt-2" style={{ color: "#8a8477" }}>
              Accès réservé au personnel Altamaro (admin, chefs, responsables
              contenu & clients).
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
