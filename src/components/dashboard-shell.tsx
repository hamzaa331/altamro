"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export type DashboardAction = {
  href: string;
  title: string;
  desc: string;
  icon?: string;
  section?: string;
};

type Props = {
  uid: string;
  userName: string;
  userEmail: string;
  actions: DashboardAction[];
  children: ReactNode;
  onSignOut?: () => void;
  userRole?: string;    
};

export function DashboardShell({
  uid,
  userName,
  userEmail,
  actions,
  children,
  onSignOut,
  userRole,  
}: Props) {
  const pathname = usePathname();

  const grouped = actions.reduce((acc, a) => {
    const key = a.section ?? "Général";
    acc[key] = acc[key] || [];
    acc[key].push(a);
    return acc;
  }, {} as Record<string, DashboardAction[]>);

  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: "#f4f4f2" }}
    >
      {/* BARRE LATÉRALE */}
      <aside
        className="
        w-72 
        bg-white/80 
        backdrop-blur-xl 
        border-r 
        shadow-xl 
        flex flex-col 
        rounded-tr-3xl 
        rounded-br-3xl 
        my-4
      "
        style={{
          borderColor: "#b1853c30",
        }}
      >

        {/* PROFIL */}
        <div
          className="px-7 py-6 border-b"
          style={{ borderColor: "#b1853c40" }}
        >
          <div className="flex items-center gap-4">
            <div
              className="
              h-12 w-12 
              rounded-2xl 
              flex items-center justify-center 
              text-xl font-bold 
              shadow-lg
            "
              style={{
                background: "linear-gradient(135deg, #b1853c, #2f4632)",
                color: "white",
              }}
            >
              A
            </div>

            <div>
              <p
                className="font-bold text-[15px]"
                style={{ color: "#2f4632" }}
              >
                {userName}
              </p>
              <p className="text-[11px]" style={{ color: "#43484f" }}>
                {userEmail}
              </p>
              {userRole && (
  <p className="text-[11px]" style={{ color: "#b1853c" }}>
    Rôle : {userRole}
  </p>
)}

            </div>
          </div>
        </div>

        {/* NAVIGATION */}
        <nav className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
          {Object.entries(grouped).map(([section, links]) => (
            <div key={section}>
              <p
                className="text-[11px] font-bold uppercase tracking-wider mb-3 px-2"
                style={{ color: "#b1853c" }}
              >
                {section}
              </p>

              <div className="space-y-2">
                {links.map((a) => {
                  const active = pathname === a.href;

                  return (
                    <Link
                      key={a.href}
                      href={a.href}
                      className="
                        flex items-start gap-4 p-3 rounded-xl border transition-all shadow-sm
                      "
                      style={{
                        background: active
                          ? "linear-gradient(135deg, #2f4632, #435f47)"
                          : "white",
                        borderColor: active ? "transparent" : "#e8e2d7",
                        color: active ? "white" : "#2f4632",
                        boxShadow: active
                          ? "0 4px 14px rgba(47,70,50,0.3)"
                          : "0 2px 6px rgba(0,0,0,0.05)",
                      }}
                    >
                      <span className="text-xl">{a.icon || "📌"}</span>

                      <div>
                        <p className="font-semibold text-sm">{a.title}</p>
                        <p
                          className="text-[11px] mt-0.5"
                          style={{
                            color: active ? "#ffffffcc" : "#43484f",
                          }}
                        >
                          {a.desc}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* BAS DE LA SIDEBAR */}
        <div
          className="px-7 py-5 border-t"
          style={{ borderColor: "#b1853c40" }}
        >
          <button
            onClick={onSignOut}
            className="w-full py-2.5 rounded-lg font-semibold text-sm shadow"
            style={{
              backgroundColor: "#ffffffcc",
              color: "#2f4632",
            }}
          >
            Se déconnecter
          </button>
        </div>
      </aside>

      {/* CONTENU PRINCIPAL */}
      <main className="flex-1 px-16 py-10">{children}</main>
    </div>
  );
}
