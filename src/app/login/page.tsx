"use client";

import { auth, googleProvider } from "@/lib/firebase";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const r = useRouter();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const loginEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await signInWithEmailAndPassword(auth, email, pwd);
      r.push("/dashboard");
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const loginGoogle = async () => {
    setErr(null);
    try {
      await signInWithPopup(auth, googleProvider);
      r.push("/dashboard");
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Admin Login</h1>

        {/* Email/password login */}
        <form onSubmit={loginEmail} className="space-y-3">
          <input
            className="border p-2 w-full"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="border p-2 w-full"
            placeholder="Password"
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
          />
          <button className="w-full border p-2" type="submit">
            Sign in
          </button>
        </form>

        {/* Google login */}
        <button className="w-full border p-2" onClick={loginGoogle}>
          Sign in with Google
        </button>

        {err && <p className="text-red-600 text-sm">{err}</p>}
      </div>
    </main>
  );
}
