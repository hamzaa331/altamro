"use client";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

export function useUserRole() {
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setUid(null); setRole(null); setLoading(false); return; }
      setUid(u.uid);
      const snap = await getDoc(doc(db, "user_roles", u.uid));
      setRole(snap.exists() ? (snap.data() as any).role : null);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { loading, uid, role };
}
