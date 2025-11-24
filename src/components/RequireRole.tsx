// src/components/RequireRole.tsx
"use client";
import { useUserRole } from "@/hooks/useUserRole";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RequireRole({
  children,
  allow = ["admin", "responsable_pages", "responsable_clients", "chef"],
}: { children: React.ReactNode; allow?: string[] }) {
  const { loading, uid, role, active } = useUserRole();
  const r = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!uid) r.replace("/login");
      else if (!role || !allow.includes(role) || active === false) {
        r.replace("/login");
      }
    }
  }, [loading, uid, role, active, r, allow]);

  if (loading) return <div className="p-6">Chargement…</div>;
  return <>{children}</>;
}
