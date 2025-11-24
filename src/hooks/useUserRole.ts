// src/hooks/useUserRole.ts
"use client";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

type RoleDoc = {
  role: string;
  active?: boolean;
  email?: string;
  display_name?: string;
};

export function useUserRole() {
  const [loading, setLoading]     = useState(true);
  const [uid, setUid]             = useState<string | null>(null);
  const [role, setRole]           = useState<string | null>(null);
  const [active, setActive]       = useState<boolean>(true);
  const [profile, setProfile]     = useState<RoleDoc | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUid(null);
        setRole(null);
        setActive(false);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUid(u.uid);
      const snap = await getDoc(doc(db, "user_roles", u.uid));
      if (snap.exists()) {
        const data = snap.data() as RoleDoc;
        setRole(data.role ?? null);
        setActive(data.active !== false);
        setProfile(data);
      } else {
        setRole(null);
        setActive(false);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return { loading, uid, role, active, profile };
}
