"use client";
import { useUserRole } from "@/hooks/useUserRole";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RequireRole({
  children,
  allow = ["admin","responsable","chef"],
}: { children: React.ReactNode; allow?: string[] }) {
  const { loading, uid, role } = useUserRole();
  const r = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!uid) r.replace("/login");
      else if (!role || !allow.includes(role)) r.replace("/login");
    }
  }, [loading, uid, role, r, allow]);

  if (loading) return <div className="p-6">Loading…</div>;
  return <>{children}</>;
}
