// app/dashboard/menu/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import {
  DashboardShell,
  type DashboardAction,
} from "@/components/dashboard-shell";

import RequireRole from "@/components/RequireRole";
import { useUserRole } from "@/hooks/useUserRole";


/* ───────────── utils ───────────── */

function slugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueIdForTitle(
  colRef: ReturnType<typeof collection>,
  title: string
) {
  const base = slugify(title) || `${Date.now()}`;
  let id = base,
    i = 2;
  while ((await getDoc(doc(colRef, id))).exists()) id = `${base}-${i++}`;
  return id;
}

async function uploadToCloudinary(file: File) {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;
  const endpoint = `https://api.cloudinary.com/v1_1/${cloud}/image/upload`;
  const form = new FormData();
  form.append("upload_preset", preset);
  form.append("file", file);
  const res = await fetch(endpoint, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Upload failed");
  return data.secure_url as string;
}
function cl(url: string, transform: string) {
  const marker = "/upload/";
  const i = url.indexOf(marker);
  return i === -1 ? url : url.replace(marker, `/upload/${transform}/`);
}

/* ───────────── types ───────────── */

type Section = {
  id: string;
  title: string;
  description: string;
  order: number;
  visible: boolean;
};
type Group = {
  id: string;
  section_ref: any;
  title: string;
  description: string;
  order: number;
  visible: boolean;
};
type Item = {
  id: string;
  group_ref: any;
  name: string;
  price: string;
  description: string;
  order: number;
  visible: boolean;
};
type GroupImage = {
  id: string;
  group_ref: any;
  image_url: string;
  order: number;
  visible: boolean;
  detail_desc?: string;
  ingredients?: string;
};

/* ───────────── OUTER PAGE WITH DASHBOARD ───────────── */

export default function MenuAdminPage() {
  const r = useRouter();

  const { uid, role, loading: roleLoading } = useUserRole();

  const [userName, setUserName] = useState("Utilisateur");
  const [userEmail, setUserEmail] = useState("contact@altamaro.com");

  // 🔁 Redirection si pas connecté
  useEffect(() => {
    if (!roleLoading && !uid) {
      r.replace("/login");
    }
  }, [roleLoading, uid, r]);

  // 👤 Charger nom + email depuis Auth puis Firestore (/user/{uid})
  useEffect(() => {
    if (!roleLoading && uid) {
      const authUser = auth.currentUser;

      // valeurs par défaut depuis Auth
      if (authUser) {
        if (authUser.displayName) setUserName(authUser.displayName);
        if (authUser.email) setUserEmail(authUser.email);
      }

      // compléter avec Firestore /user/{uid}
      const ref = doc(db, "user", uid);
      getDoc(ref).then((snap) => {
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
      desc: "Sections, groupes & produits.",
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
  href: "/dashboard/comments",
  title: "Commentaires",
  desc: "Masquer ou supprimer.",
  icon: "💬",
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
  } else if (role === "chef") {
    const allowed = new Set<string>([
      "/dashboard/statistics",
      "/dashboard/menu",
      "/dashboard/menu/all",
      "/dashboard/categories",
    ]);
    actions = allActions.filter((a) => allowed.has(a.href));
  } else {
    actions = [];
  }


    return (
    <RequireRole allow={["admin", "chef"]}>
      <DashboardShell
         uid={uid}
      userName={userName}
      userEmail={userEmail}
      actions={actions}
      userRole={role || undefined}   // 🔸 ADD THIS LINE
      onSignOut={async () => {
        await signOut(auth);
        r.replace("/login");
      }}
      >
        <MenuInner />
      </DashboardShell>
    </RequireRole>
  );

}


/* ───────────── INNER LOGIC ───────────── */

function MenuInner() {
  const sectionsCol = useMemo(() => collection(db, "menu_sections"), []);
  const groupsCol = useMemo(() => collection(db, "menu_groups"), []);
  const itemsCol = useMemo(() => collection(db, "menu_items"), []);
  const groupImagesCol = useMemo(
    () => collection(db, "menu_group_images"),
    []
  );

  const [sections, setSections] = useState<Section[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [groupImages, setGroupImages] = useState<GroupImage[]>([]);

  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // add forms
  const [newSecTitle, setNewSecTitle] = useState("");
  const [newSecDesc, setNewSecDesc] = useState("");
  const [newGrpTitle, setNewGrpTitle] = useState("");
  const [newGrpDesc, setNewGrpDesc] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newGrpImageFile, setNewGrpImageFile] = useState<File | null>(null);

  // Onglets (UI seulement, ne change pas la logique Firestore)
  type TabKey = "sections" | "groups" | "images" | "items";
  const [tab, setTab] = useState<TabKey>("sections");

  // ───────────── search / filter states (UI only) ─────────────
  const [sectionSearch, setSectionSearch] = useState("");
  const [sectionVisibilityFilter, setSectionVisibilityFilter] = useState<
    "all" | "visible" | "hidden"
  >("all");

  const [groupSearch, setGroupSearch] = useState("");
  const [groupVisibilityFilter, setGroupVisibilityFilter] = useState<
    "all" | "visible" | "hidden"
  >("all");

  const [itemSearch, setItemSearch] = useState("");
  const [itemVisibilityFilter, setItemVisibilityFilter] = useState<
    "all" | "visible" | "hidden"
  >("all");

  const [groupImageVisibilityFilter, setGroupImageVisibilityFilter] =
    useState<"all" | "visible" | "hidden">("all");

  // ───────────── derived filtered lists (UI only) ─────────────
  const filteredSections = useMemo(() => {
    const q = sectionSearch.trim().toLowerCase();
    return sections.filter((s) => {
      const matchText =
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q);
      const matchVisibility =
        sectionVisibilityFilter === "all"
          ? true
          : sectionVisibilityFilter === "visible"
          ? s.visible
          : !s.visible;
      return matchText && matchVisibility;
    });
  }, [sections, sectionSearch, sectionVisibilityFilter]);

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    return groups.filter((g) => {
      const matchText =
        !q ||
        g.title.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q);
      const matchVisibility =
        groupVisibilityFilter === "all"
          ? true
          : groupVisibilityFilter === "visible"
          ? g.visible
          : !g.visible;
      return matchText && matchVisibility;
    });
  }, [groups, groupSearch, groupVisibilityFilter]);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    return items.filter((it) => {
      const matchText =
        !q ||
        it.name.toLowerCase().includes(q) ||
        it.description.toLowerCase().includes(q) ||
        it.price.toLowerCase().includes(q);
      const matchVisibility =
        itemVisibilityFilter === "all"
          ? true
          : itemVisibilityFilter === "visible"
          ? it.visible
          : !it.visible;
      return matchText && matchVisibility;
    });
  }, [items, itemSearch, itemVisibilityFilter]);

  const filteredGroupImages = useMemo(() => {
    return groupImages.filter((gi) => {
      const matchVisibility =
        groupImageVisibilityFilter === "all"
          ? true
          : groupImageVisibilityFilter === "visible"
          ? gi.visible
          : !gi.visible;
      return matchVisibility;
    });
  }, [groupImages, groupImageVisibilityFilter]);

  /* ───────────── subscriptions ───────────── */

  useEffect(() => {
    const unsub = onSnapshot(
      query(sectionsCol, orderBy("order", "asc")),
      (snap) => {
        setSections(
          snap.docs.map((d, i) => {
            const x = d.data() as any,
              ord = x.order ?? i;
            return {
              id: d.id,
              title: x.title ?? "",
              description: x.description ?? "",
              order: ord,
              visible: x.visible ?? true,
            };
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
  }, [sectionsCol]);

  useEffect(() => {
    if (!selectedSectionId) {
      setGroups([]);
      return;
    }
    const sref = doc(sectionsCol, selectedSectionId);
    const unsub = onSnapshot(
      query(groupsCol, where("section_ref", "==", sref), orderBy("order", "asc")),
      (snap) => {
        setGroups(
          snap.docs.map((d, i) => {
            const x = d.data() as any,
              ord = x.order ?? i;
            return {
              id: d.id,
              section_ref: x.section_ref,
              title: x.title ?? "",
              description: x.description ?? "",
              order: ord,
              visible: x.visible ?? true,
            };
          })
        );
      },
      (e) => setErr(e.message)
    );
    return () => unsub();
  }, [groupsCol, sectionsCol, selectedSectionId]);

  useEffect(() => {
    if (!selectedGroupId) {
      setItems([]);
      return;
    }
    const gref = doc(groupsCol, selectedGroupId);
    const unsub = onSnapshot(
      query(itemsCol, where("group_ref", "==", gref), orderBy("order", "asc")),
      (snap) => {
        setItems(
          snap.docs.map((d, i) => {
            const x = d.data() as any,
              ord = x.order ?? i;
            return {
              id: d.id,
              group_ref: x.group_ref,
              name: x.name ?? "",
              price: x.price ?? "",
              description: x.description ?? "",
              order: ord,
              visible: x.visible ?? true,
            };
          })
        );
      },
      (e) => setErr(e.message)
    );
    return () => unsub();
  }, [itemsCol, groupsCol, selectedGroupId]);

  useEffect(() => {
    if (!selectedGroupId) {
      setGroupImages([]);
      return;
    }
    const gref = doc(groupsCol, selectedGroupId);
    const unsub = onSnapshot(
      query(
        groupImagesCol,
        where("group_ref", "==", gref),
        orderBy("order", "asc")
      ),
      (snap) => {
        setGroupImages(
          snap.docs.map((d, i) => {
            const x = d.data() as any,
              ord = x.order ?? i;
            return {
              id: d.id,
              group_ref: x.group_ref,
              image_url: x.image_url ?? "",
              order: ord,
              visible: x.visible ?? true,
            };
          })
        );
      },
      (e) => setErr(e.message)
    );
    return () => unsub();
  }, [groupImagesCol, groupsCol, selectedGroupId]);

  /* ───────────── helpers ───────────── */

  async function renumberQuery(qry: ReturnType<typeof query>) {
    const snap = await getDocs(qry);
    const batch = writeBatch(db);
    snap.docs.forEach((d, i) => batch.update(d.ref, { order: i }));
    await batch.commit();
  }
  async function deleteInChunks(qry: ReturnType<typeof query>) {
    while (true) {
      const snap = await getDocs(query(qry, limit(400)));
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  async function cascadeDeleteGroup(groupId: string) {
    const gref = doc(groupsCol, groupId);
    await deleteInChunks(query(itemsCol, where("group_ref", "==", gref)));
    await deleteInChunks(
      query(groupImagesCol, where("group_ref", "==", gref))
    );
    await deleteDoc(gref);
  }
  async function cascadeDeleteSection(sectionId: string) {
    const sref = doc(sectionsCol, sectionId);
    const gSnap = await getDocs(
      query(groupsCol, where("section_ref", "==", sref))
    );
    for (const g of gSnap.docs) await cascadeDeleteGroup(g.id);
    await deleteDoc(sref);
  }

  /* ───────────── Sections CRUD ───────────── */

  const addSection = async () => {
    if (!newSecTitle.trim()) return setErr("Le titre principal est obligatoire.");
    try {
      setBusy(true);
      const id = await uniqueIdForTitle(sectionsCol, newSecTitle);
      await setDoc(
        doc(sectionsCol, id),
        {
          title: newSecTitle.trim(),
          description: newSecDesc.trim(),
          order: sections.length,
          visible: true,
        },
        { merge: true }
      );
      setNewSecTitle("");
      setNewSecDesc("");
      await renumberQuery(query(sectionsCol, orderBy("order", "asc")));
    } catch (e: any) {
      setErr(e.message || "Échec ajout section");
    } finally {
      setBusy(false);
    }
  };
  const editSectionTitle = (s: Section, title: string) =>
    updateDoc(doc(sectionsCol, s.id), { title });
  const editSectionDesc = (s: Section, description: string) =>
    updateDoc(doc(sectionsCol, s.id), { description });
  const toggleSection = (s: Section) =>
    updateDoc(doc(sectionsCol, s.id), { visible: !s.visible });

  // move by id (so it works with filtered lists)
  const moveSection = async (sectionId: string, direction: "up" | "down") => {
    const from = sections.findIndex((s) => s.id === sectionId);
    if (from === -1) return;
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= sections.length) return;
    const a = sections[from],
      b = sections[to];
    const batch = writeBatch(db);
    batch.update(doc(sectionsCol, a.id), { order: to });
    batch.update(doc(sectionsCol, b.id), { order: from });
    await batch.commit();
    await renumberQuery(query(sectionsCol, orderBy("order", "asc")));
  };

  const deleteSection = async (s: Section) => {
    try {
      setBusy(true);
      await cascadeDeleteSection(s.id);
      if (selectedSectionId === s.id) {
        setSelectedSectionId(null);
        setSelectedGroupId(null);
      }
      await renumberQuery(query(sectionsCol, orderBy("order", "asc")));
    } catch (e: any) {
      setErr(e.message || "Échec suppression section");
    } finally {
      setBusy(false);
    }
  };

  /* ───────────── Groups CRUD ───────────── */

  const addGroup = async () => {
    if (!selectedSectionId)
      return setErr("Choisissez d’abord une section.");
    try {
      setBusy(true);
      const sref = doc(sectionsCol, selectedSectionId);
      const id = await uniqueIdForTitle(
        groupsCol,
        newGrpTitle || `group-${Date.now()}`
      );
      await setDoc(
        doc(groupsCol, id),
        {
          section_ref: sref,
          title: newGrpTitle.trim(),
          description: newGrpDesc.trim(),
          order: groups.length,
          visible: true,
        },
        { merge: true }
      );
      setNewGrpTitle("");
      setNewGrpDesc("");
      await renumberQuery(
        query(
          groupsCol,
          where("section_ref", "==", sref),
          orderBy("order", "asc")
        )
      );
    } catch (e: any) {
      setErr(e.message || "Échec ajout groupe");
    } finally {
      setBusy(false);
    }
  };
  const editGroupTitle = (g: Group, title: string) =>
    updateDoc(doc(groupsCol, g.id), { title });
  const editGroupDesc = (g: Group, description: string) =>
    updateDoc(doc(groupsCol, g.id), { description });
  const toggleGroup = (g: Group) =>
    updateDoc(doc(groupsCol, g.id), { visible: !g.visible });

  const moveGroup = async (groupId: string, direction: "up" | "down") => {
    if (!selectedSectionId) return;
    const from = groups.findIndex((g) => g.id === groupId);
    if (from === -1) return;
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= groups.length) return;
    const a = groups[from],
      b = groups[to];
    const batch = writeBatch(db);
    batch.update(doc(groupsCol, a.id), { order: to });
    batch.update(doc(groupsCol, b.id), { order: from });
    await batch.commit();
    await renumberQuery(
      query(
        groupsCol,
        where("section_ref", "==", doc(sectionsCol, selectedSectionId)),
        orderBy("order", "asc")
      )
    );
  };

  const deleteGroup = async (g: Group) => {
    try {
      setBusy(true);
      await cascadeDeleteGroup(g.id);
      if (selectedGroupId === g.id) setSelectedGroupId(null);
      if (selectedSectionId) {
        await renumberQuery(
          query(
            groupsCol,
            where("section_ref", "==", doc(sectionsCol, selectedSectionId)),
            orderBy("order", "asc")
          )
        );
      }
    } catch (e: any) {
      setErr(e.message || "Échec suppression groupe");
    } finally {
      setBusy(false);
    }
  };

  /* ───────────── Items CRUD ───────────── */

  const addItem = async () => {
    if (!selectedGroupId) return setErr("Choisissez d’abord un groupe.");
    if (!newItemName.trim() || !newItemPrice.trim())
      return setErr("Nom du produit et prix obligatoires.");
    try {
      setBusy(true);
      const gref = doc(groupsCol, selectedGroupId);
      const id = await uniqueIdForTitle(itemsCol, newItemName);
      await setDoc(
        doc(itemsCol, id),
        {
          group_ref: gref,
          name: newItemName.trim(),
          price: newItemPrice.trim(),
          description: newItemDesc.trim(),
          order: items.length,
          visible: true,
        },
        { merge: true }
      );
      setNewItemName("");
      setNewItemPrice("");
      setNewItemDesc("");
      await renumberQuery(
        query(itemsCol, where("group_ref", "==", gref), orderBy("order", "asc"))
      );
    } catch (e: any) {
      setErr(e.message || "Échec ajout produit");
    } finally {
      setBusy(false);
    }
  };
  const editItemName = (it: Item, v: string) =>
    updateDoc(doc(itemsCol, it.id), { name: v });
  const editItemPrice = (it: Item, v: string) =>
    updateDoc(doc(itemsCol, it.id), { price: v });
  const editItemDesc = (it: Item, v: string) =>
    updateDoc(doc(itemsCol, it.id), { description: v });
  const toggleItem = (it: Item) =>
    updateDoc(doc(itemsCol, it.id), { visible: !it.visible });

  const moveItem = async (itemId: string, direction: "up" | "down") => {
    if (!selectedGroupId || items.length === 0) return;
    const from = items.findIndex((it) => it.id === itemId);
    if (from === -1) return;
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= items.length) return;
    const a = items[from],
      b = items[to];
    const batch = writeBatch(db);
    batch.update(doc(itemsCol, a.id), { order: to });
    batch.update(doc(itemsCol, b.id), { order: from });
    await batch.commit();
    await renumberQuery(
      query(
        itemsCol,
        where("group_ref", "==", doc(groupsCol, selectedGroupId)),
        orderBy("order", "asc")
      )
    );
  };

  const deleteItem = async (it: Item) => {
    try {
      setBusy(true);
      await deleteDoc(doc(itemsCol, it.id));
      if (selectedGroupId) {
        await renumberQuery(
          query(
            itemsCol,
            where("group_ref", "==", doc(groupsCol, selectedGroupId)),
            orderBy("order", "asc")
          )
        );
      }
    } catch (e: any) {
      setErr(e.message || "Échec suppression produit");
    } finally {
      setBusy(false);
    }
  };

  /* ───────────── Group Images CRUD ───────────── */

  const addGroupImage = async () => {
    if (!selectedGroupId) return setErr("Choisissez d’abord un groupe.");
    if (!newGrpImageFile) return setErr("Choisissez une image.");
    try {
      setBusy(true);
      const gref = doc(groupsCol, selectedGroupId);
      const url = await uploadToCloudinary(newGrpImageFile);
      const id = `${Date.now()}`;
      await setDoc(
        doc(groupImagesCol, id),
        {
          group_ref: gref,
          image_url: url,
          order: groupImages.length,
          visible: true,
        },
        { merge: true }
      );
      setNewGrpImageFile(null);
      await renumberQuery(
        query(
          groupImagesCol,
          where("group_ref", "==", gref),
          orderBy("order", "asc")
        )
      );
    } catch (e: any) {
      setErr(e.message || "Échec ajout image");
    } finally {
      setBusy(false);
    }
  };
  const replaceGroupImage = async (gi: GroupImage, f: File) => {
    const url = await uploadToCloudinary(f);
    await updateDoc(doc(groupImagesCol, gi.id), { image_url: url });
  };

  const toggleGroupImage = (gi: GroupImage) =>
    updateDoc(doc(groupImagesCol, gi.id), { visible: !gi.visible });

  const moveGroupImage = async (
    groupImageId: string,
    direction: "up" | "down"
  ) => {
    if (!selectedGroupId || groupImages.length === 0) return;
    const from = groupImages.findIndex((gi) => gi.id === groupImageId);
    if (from === -1) return;
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= groupImages.length) return;
    const a = groupImages[from],
      b = groupImages[to];
    const batch = writeBatch(db);
    batch.update(doc(groupImagesCol, a.id), { order: to });
    batch.update(doc(groupImagesCol, b.id), { order: from });
    await batch.commit();
    await renumberQuery(
      query(
        groupImagesCol,
        where("group_ref", "==", doc(groupsCol, selectedGroupId)),
        orderBy("order", "asc")
      )
    );
  };

  const deleteGroupImage = async (gi: GroupImage) => {
    try {
      setBusy(true);
      await deleteDoc(doc(groupImagesCol, gi.id));
      if (selectedGroupId) {
        await renumberQuery(
          query(
            groupImagesCol,
            where("group_ref", "==", doc(groupsCol, selectedGroupId)),
            orderBy("order", "asc")
          )
        );
      }
    } catch (e: any) {
      setErr(e.message || "Échec suppression image");
    } finally {
      setBusy(false);
    }
  };

  /* ───────────── UI ───────────── */

  if (loading) return <div className="p-6">Chargement…</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1
            className="text-3xl font-extrabold"
            style={{ color: "#2f4632" }}
          >
            Menus & sections
          </h1>
          <p className="text-sm" style={{ color: "#43484f" }}>
            Structure : <strong>Section</strong> → <strong>Groupe</strong> →
            <strong> Produits</strong> + carrousel d’images par groupe.
          </p>
        </div>
      </div>

      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl px-4 py-2">
          {err}
        </div>
      )}

      {/* TABS NAV (comme Interface Commune) */}
      <div className="flex flex-wrap gap-2 rounded-2xl p-1 bg-white shadow-sm border border-[#e4ded1]">
        {[
          { key: "sections", label: "Sections" },
          { key: "groups", label: "Groupes" },
          { key: "images", label: "Images du groupe" },
          { key: "items", label: "Produits" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as TabKey)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={
              tab === t.key
                ? {
                    background:
                      "linear-gradient(135deg,#2f4632,#435f47)",
                    color: "#ffffff",
                    boxShadow: "0 3px 10px rgba(47,70,50,0.3)",
                  }
                : {
                    backgroundColor: "transparent",
                    color: "#43484f",
                  }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ========== PANEL SECTIONS ========== */}
      {tab === "sections" && (
        <section className="bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-6 space-y-5">
          <div className="space-y-1">
            <h2
              className="text-lg font-semibold"
              style={{ color: "#2f4632" }}
            >
              Sections (titres principaux)
            </h2>
            <p className="text-xs" style={{ color: "#43484f" }}>
              Chaque section correspond à un grand bloc du menu (ex : “Entrées”,
              “Plats principaux”, “Desserts”…).
            </p>
          </div>

          {/* search + filters */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <input
              className="border border-[#e4ded1] rounded-xl px-3 py-2 text-sm w-full md:w-1/2 bg-[#faf9f6]"
              placeholder="Rechercher une section (titre ou description)…"
              value={sectionSearch}
              onChange={(e) => setSectionSearch(e.target.value)}
            />
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-600">Filtrer par statut :</span>
              <select
                className="border border-[#e4ded1] rounded-xl px-2 py-1 text-xs bg-[#faf9f6]"
                value={sectionVisibilityFilter}
                onChange={(e) =>
                  setSectionVisibilityFilter(e.target.value as
                    | "all"
                    | "visible"
                    | "hidden")
                }
              >
                <option value="all">Toutes</option>
                <option value="visible">Visibles</option>
                <option value="hidden">Masquées</option>
              </select>
            </div>
          </div>

          {/* Formulaire + liste côte à côte pour limiter le scroll */}
          <div className="grid gap-6 md:grid-cols-3">
            {/* Form */}
            <div className="md:col-span-1 border border-[#e4ded1] rounded-2xl p-4 space-y-3 bg-[#faf9f6]">
              <LabeledInput
                label="Titre principal *"
                value={newSecTitle}
                onChange={setNewSecTitle}
              />
              <LabeledTextArea
                label="Description (optionnelle)"
                value={newSecDesc}
                onChange={setNewSecDesc}
                rows={3}
              />
              <button
                onClick={addSection}
                disabled={busy || !newSecTitle.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold shadow"
                style={{
                  backgroundColor:
                    busy || !newSecTitle.trim() ? "#9aa3a1" : "#2f4632",
                  color: "#ffffff",
                }}
              >
                {busy ? "Ajout…" : "Ajouter la section"}
              </button>
            </div>

            {/* Liste */}
            <div className="md:col-span-2 space-y-3 max-h-[480px] overflow-auto pr-1">
              {filteredSections.length === 0 && (
                <div className="text-sm text-gray-600">
                  Aucune section pour l’instant.
                </div>
              )}
              {filteredSections.map((s) => {
                const globalIndex = sections.findIndex(
                  (sec) => sec.id === s.id
                );
                const isFirst = globalIndex === 0;
                const isLast = globalIndex === sections.length - 1;

                return (
                  <div
                    key={s.id}
                    className={`border border-[#e4ded1] rounded-2xl p-3 flex flex-col md:flex-row md:items-center gap-3 bg-[#faf9f6]`}
                  >
                    <div className="flex-1 space-y-2">
                      <EditableInline
                        label={`Titre principal (ordre ${s.order})`}
                        value={s.title}
                        onSave={(t) => editSectionTitle(s, t)}
                      />
                      <EditableInline
                        label="Description"
                        value={s.description}
                        onSave={(t) => editSectionDesc(s, t)}
                      />
                    </div>

                    <div className="flex flex-col gap-2 text-xs items-start md:items-end">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={s.visible}
                          onChange={() => toggleSection(s)}
                        />{" "}
                        Visible
                      </label>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => moveSection(s.id, "up")}
                          disabled={isFirst}
                          className="px-2 py-1 rounded border"
                          style={{
                            backgroundColor: isFirst ? "#e0e0dd" : "#ffffff",
                            borderColor: "#d4cec2",
                          }}
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveSection(s.id, "down")}
                          disabled={isLast}
                          className="px-2 py-1 rounded border"
                          style={{
                            backgroundColor: isLast ? "#e0e0dd" : "#ffffff",
                            borderColor: "#d4cec2",
                          }}
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => deleteSection(s)}
                          className="px-2 py-1 rounded bg-red-600 text-white font-semibold"
                        >
                          Supprimer
                        </button>
                      </div>

                      <button
                        className="px-3 py-1 rounded-xl text-xs font-medium border mt-1"
                        style={{
                          borderColor: "#b1853c66",
                          color:
                            selectedSectionId === s.id ? "#2f4632" : "#43484f",
                          backgroundColor:
                            selectedSectionId === s.id
                              ? "#e5efe7"
                              : "transparent",
                        }}
                        onClick={() => {
                          setSelectedSectionId(s.id);
                          setSelectedGroupId(null);
                        }}
                      >
                        {selectedSectionId === s.id
                          ? "Section sélectionnée"
                          : "Sélectionner"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ========== PANEL GROUPES ========== */}
      {tab === "groups" && (
        <section className="bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-6 space-y-5">
          <div className="space-y-1">
            <h2
              className="text-lg font-semibold"
              style={{ color: "#2f4632" }}
            >
              Groupes (sous-titres)
            </h2>
            <p className="text-xs" style={{ color: "#43484f" }}>
              Les groupes appartiennent à une section sélectionnée (ex :
              “Pizzas”, “Pâtes”, “Grillades” dans la section “Plats principaux”).
            </p>
          </div>

          {!selectedSectionId && (
            <div className="text-sm text-gray-600">
              Sélectionnez d’abord une section dans l’onglet{" "}
              <strong>Sections</strong>.
            </div>
          )}

          {selectedSectionId && (
            <>
              {/* search + filters */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <input
                  className="border border-[#e4ded1] rounded-xl px-3 py-2 text-sm w-full md:w-1/2 bg-[#faf9f6]"
                  placeholder="Rechercher un groupe (titre ou description)…"
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                />
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600">Filtrer par statut :</span>
                  <select
                    className="border border-[#e4ded1] rounded-xl px-2 py-1 text-xs bg-[#faf9f6]"
                    value={groupVisibilityFilter}
                    onChange={(e) =>
                      setGroupVisibilityFilter(e.target.value as
                        | "all"
                        | "visible"
                        | "hidden")
                    }
                  >
                    <option value="all">Tous</option>
                    <option value="visible">Visibles</option>
                    <option value="hidden">Masqués</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                {/* Form */}
                <div className="md:col-span-1 border border-[#e4ded1] rounded-2xl p-4 space-y-3 bg-[#faf9f6]">
                  <LabeledInput
                    label="Titre de groupe (optionnel)"
                    value={newGrpTitle}
                    onChange={setNewGrpTitle}
                  />
                  <LabeledTextArea
                    label="Description de groupe (optionnelle)"
                    value={newGrpDesc}
                    onChange={setNewGrpDesc}
                    rows={3}
                  />
                  <button
                    onClick={addGroup}
                    disabled={busy}
                    className="px-4 py-2 rounded-lg text-sm font-semibold shadow"
                    style={{
                      backgroundColor: busy ? "#9aa3a1" : "#2f4632",
                      color: "#ffffff",
                    }}
                  >
                    {busy ? "Ajout…" : "Ajouter un groupe"}
                  </button>
                </div>

                {/* Liste */}
                <div className="md:col-span-2 space-y-3 max-h-[480px] overflow-auto pr-1">
                  {filteredGroups.length === 0 && (
                    <div className="text-sm text-gray-600">
                      Aucun groupe pour cette section.
                    </div>
                  )}
                  {filteredGroups.map((g) => {
                    const globalIndex = groups.findIndex(
                      (gg) => gg.id === g.id
                    );
                    const isFirst = globalIndex === 0;
                    const isLast = globalIndex === groups.length - 1;

                    return (
                      <div
                        key={g.id}
                        className={`border border-[#e4ded1] rounded-2xl p-3 flex flex-col md:flex-row md:items-center gap-3 bg-[#faf9f6]`}
                      >
                        <div className="flex-1 space-y-2">
                          <EditableInline
                            label={`Titre groupe (ordre ${g.order})`}
                            value={g.title}
                            onSave={(t) => editGroupTitle(g, t)}
                          />
                          <EditableInline
                            label="Description"
                            value={g.description}
                            onSave={(t) => editGroupDesc(g, t)}
                          />
                        </div>

                        <div className="flex flex-col gap-2 text-xs items-start md:items-end">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={g.visible}
                              onChange={() => toggleGroup(g)}
                            />{" "}
                            Visible
                          </label>

                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => moveGroup(g.id, "up")}
                              disabled={isFirst}
                              className="px-2 py-1 rounded border"
                              style={{
                                backgroundColor: isFirst
                                  ? "#e0e0dd"
                                  : "#ffffff",
                                borderColor: "#d4cec2",
                              }}
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => moveGroup(g.id, "down")}
                              disabled={isLast}
                              className="px-2 py-1 rounded border"
                              style={{
                                backgroundColor: isLast
                                  ? "#e0e0dd"
                                  : "#ffffff",
                                borderColor: "#d4cec2",
                              }}
                            >
                              ↓
                            </button>
                            <button
                              onClick={() => deleteGroup(g)}
                              className="px-2 py-1 rounded bg-red-600 text-white font-semibold"
                            >
                              Supprimer
                            </button>
                          </div>

                          <button
                            className="px-3 py-1 rounded-xl text-xs font-medium border mt-1"
                            style={{
                              borderColor: "#b1853c66",
                              color:
                                selectedGroupId === g.id
                                  ? "#2f4632"
                                  : "#43484f",
                              backgroundColor:
                                selectedGroupId === g.id
                                  ? "#e5efe7"
                                  : "transparent",
                            }}
                            onClick={() => setSelectedGroupId(g.id)}
                          >
                            {selectedGroupId === g.id
                              ? "Groupe sélectionné"
                              : "Sélectionner"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* ========== PANEL IMAGES ========== */}
      {tab === "images" && (
        <section className="bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-6 space-y-5">
          <div className="space-y-1">
            <h2
              className="text-lg font-semibold"
              style={{ color: "#2f4632" }}
            >
              Images du groupe (carrousel)
            </h2>
            <p className="text-xs" style={{ color: "#43484f" }}>
              Chaque groupe peut avoir plusieurs images affichées en carrousel
              sur la page menu.
            </p>
          </div>

          {!selectedGroupId && (
            <div className="text-sm text-gray-600">
              Sélectionnez un groupe dans l’onglet <strong>Groupes</strong>.
            </div>
          )}

          {selectedGroupId && (
            <>
              {/* filters */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1" />
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600">Filtrer par statut :</span>
                  <select
                    className="border border-[#e4ded1] rounded-xl px-2 py-1 text-xs bg-[#faf9f6]"
                    value={groupImageVisibilityFilter}
                    onChange={(e) =>
                      setGroupImageVisibilityFilter(e.target.value as
                        | "all"
                        | "visible"
                        | "hidden")
                    }
                  >
                    <option value="all">Toutes</option>
                    <option value="visible">Visibles</option>
                    <option value="hidden">Masquées</option>
                  </select>
                </div>
              </div>

              {/* Form + liste en colonne mais dans la même carte */}
              <div className="border border-[#e4ded1] rounded-2xl p-4 space-y-3 bg-[#faf9f6]">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs">
                    <span style={{ color: "#43484f" }}>Image *</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        setNewGrpImageFile(e.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                </div>
                <button
                  onClick={addGroupImage}
                  disabled={busy || !newGrpImageFile}
                  className="px-4 py-2 rounded-lg text-sm font-semibold shadow"
                  style={{
                    backgroundColor:
                      busy || !newGrpImageFile ? "#9aa3a1" : "#2f4632",
                    color: "#ffffff",
                  }}
                >
                  {busy ? "Ajout…" : "Ajouter une image"}
                </button>
              </div>

              <div className="space-y-3 max-h-[480px] overflow-auto pr-1">
                {filteredGroupImages.length === 0 && (
                  <div className="text-sm text-gray-600">
                    Aucune image pour ce groupe.
                  </div>
                )}
                {filteredGroupImages.map((gi) => {
                  const globalIndex = groupImages.findIndex(
                    (gImg) => gImg.id === gi.id
                  );
                  const isFirst = globalIndex === 0;
                  const isLast =
                    globalIndex === groupImages.length - 1;

                  return (
                    <div
                      key={gi.id}
                      className="border border-[#e4ded1] rounded-2xl p-3 flex flex-col md:flex-row md:items-center gap-3 bg-[#faf9f6]"
                    >
                      {gi.image_url ? (
                        <img
                          src={cl(
                            gi.image_url,
                            "f_auto,q_auto,w_160,h_100,c_fill"
                          )}
                          className="w-40 h-24 object-cover rounded-xl"
                          alt=""
                        />
                      ) : (
                        <div className="w-40 h-24 bg-[#f4f4f2] rounded grid place-items-center text-xs text-gray-500">
                          Pas d’image
                        </div>
                      )}

                      <div className="flex-1 flex flex-col gap-2 text-xs">
                        <label className="text-xs flex flex-col gap-1">
                          <span>Remplacer l’image</span>
                          <input
                            className="block"
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                              e.target.files?.[0] &&
                              replaceGroupImage(gi, e.target.files[0])
                            }
                          />
                        </label>

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={gi.visible}
                            onChange={() => toggleGroupImage(gi)}
                          />{" "}
                          Visible
                        </label>

                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <button
                            onClick={() => moveGroupImage(gi.id, "up")}
                            disabled={isFirst}
                            className="px-2 py-1 rounded border"
                            style={{
                              backgroundColor: isFirst
                                ? "#e0e0dd"
                                : "#ffffff",
                              borderColor: "#d4cec2",
                            }}
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveGroupImage(gi.id, "down")}
                            disabled={isLast}
                            className="px-2 py-1 rounded border"
                            style={{
                              backgroundColor: isLast
                                ? "#e0e0dd"
                                : "#ffffff",
                              borderColor: "#d4cec2",
                            }}
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => deleteGroupImage(gi)}
                            className="px-2 py-1 rounded bg-red-600 text-white font-semibold"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {/* ========== PANEL PRODUITS ========== */}
      {tab === "items" && (
        <section className="bg-white rounded-3xl shadow-sm border border-[#e4ded1] p-6 space-y-5">
          <div className="space-y-1">
            <h2
              className="text-lg font-semibold"
              style={{ color: "#2f4632" }}
            >
              Produits
            </h2>
            <p className="text-xs" style={{ color: "#43484f" }}>
              Les produits appartiennent à un groupe sélectionné (ex : “Pizza
              Margherita”, “Pizza 4 fromages”…).
            </p>
          </div>

          {!selectedGroupId && (
            <div className="text-sm text-gray-600">
              Sélectionnez un groupe dans l’onglet <strong>Groupes</strong>.
            </div>
          )}

          {selectedGroupId && (
            <>
              {/* search + filters */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <input
                  className="border border-[#e4ded1] rounded-xl px-3 py-2 text-sm w-full md:w-1/2 bg-[#faf9f6]"
                  placeholder="Rechercher un produit (nom, description, prix)…"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                />
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600">Filtrer par statut :</span>
                  <select
                    className="border border-[#e4ded1] rounded-xl px-2 py-1 text-xs bg-[#faf9f6]"
                    value={itemVisibilityFilter}
                    onChange={(e) =>
                      setItemVisibilityFilter(e.target.value as
                        | "all"
                        | "visible"
                        | "hidden")
                    }
                  >
                    <option value="all">Tous</option>
                    <option value="visible">Visibles</option>
                    <option value="hidden">Masqués</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                {/* Form */}
                <div className="md:col-span-1 border border-[#e4ded1] rounded-2xl p-4 space-y-3 bg-[#faf9f6]">
                  <LabeledInput
                    label="Nom *"
                    value={newItemName}
                    onChange={setNewItemName}
                  />
                  <LabeledInput
                    label="Prix *"
                    value={newItemPrice}
                    onChange={setNewItemPrice}
                    placeholder="ex: 10 ou 5 - 24"
                  />
                  <LabeledTextArea
                    label="Description (optionnelle)"
                    value={newItemDesc}
                    onChange={setNewItemDesc}
                    rows={3}
                  />
                  <button
                    onClick={addItem}
                    disabled={
                      busy || !newItemName.trim() || !newItemPrice.trim()
                    }
                    className="px-4 py-2 rounded-lg text-sm font-semibold shadow"
                    style={{
                      backgroundColor:
                        busy || !newItemName.trim() || !newItemPrice.trim()
                          ? "#9aa3a1"
                          : "#2f4632",
                      color: "#ffffff",
                    }}
                  >
                    {busy ? "Ajout…" : "Ajouter le produit"}
                  </button>
                </div>

                {/* Liste */}
                <div className="md:col-span-2 space-y-3 max-h-[480px] overflow-auto pr-1">
                  {filteredItems.length === 0 && (
                    <div className="text-sm text-gray-600">
                      Aucun produit dans ce groupe.
                    </div>
                  )}
                  {filteredItems.map((it) => {
                    const globalIndex = items.findIndex(
                      (iit) => iit.id === it.id
                    );
                    const isFirst = globalIndex === 0;
                    const isLast = globalIndex === items.length - 1;

                    return (
                      <div
                        key={it.id}
                        className="border border-[#e4ded1] rounded-2xl p-3 flex flex-col md:flex-row md:items-center gap-3 bg-[#faf9f6]"
                      >
                        <div className="flex-1 space-y-2">
                          <EditableInline
                            label={`Nom (ordre ${it.order})`}
                            value={it.name}
                            onSave={(v) => editItemName(it, v)}
                          />
                          <EditableInline
                            label="Prix"
                            value={it.price}
                            onSave={(v) => editItemPrice(it, v)}
                          />
                          <EditableInline
                            label="Description courte"
                            value={it.description}
                            onSave={(v) => editItemDesc(it, v)}
                          />
                        </div>

                        <div className="flex flex-col gap-2 text-xs items-start md:items-end">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={it.visible}
                              onChange={() => toggleItem(it)}
                            />{" "}
                            Visible
                          </label>

                          <a
                            href={`/dashboard/menu/item/${it.id}`}
                            className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-semibold"
                          >
                            Détails
                          </a>

                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => moveItem(it.id, "up")}
                              disabled={isFirst}
                              className="px-2 py-1 rounded border"
                              style={{
                                backgroundColor: isFirst
                                  ? "#e0e0dd"
                                  : "#ffffff",
                                borderColor: "#d4cec2",
                              }}
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => moveItem(it.id, "down")}
                              disabled={isLast}
                              className="px-2 py-1 rounded border"
                              style={{
                                backgroundColor: isLast
                                  ? "#e0e0dd"
                                  : "#ffffff",
                                borderColor: "#d4cec2",
                              }}
                            >
                              ↓
                            </button>
                            <button
                              onClick={() => deleteItem(it)}
                              className="px-2 py-1 rounded bg-red-600 text-white text-xs font-semibold"
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

/* ───────────── small inputs ───────────── */

function LabeledInput(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-gray-600">{props.label}</span>
      <input
        className="border p-2 rounded text-sm"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}
function LabeledTextArea(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-gray-600">{props.label}</span>
      <textarea
        className="border p-2 rounded text-sm"
        rows={props.rows ?? 3}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}
function EditableInline(props: {
  label?: string;
  value: string;
  onSave: (v: string) => void;
}) {
  const [val, setVal] = useState(props.value);
  const [editing, setEditing] = useState(false);
  useEffect(() => setVal(props.value), [props.value]);
  return (
    <div className="flex flex-col gap-1 flex-1 text-sm">
      {props.label && (
        <span className="text-gray-600 text-xs">{props.label}</span>
      )}
      <div className="flex gap-2">
        <input
          className="border p-2 rounded w-full text-sm"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={!editing}
        />
        {!editing ? (
          <button
            className="px-3 py-2 rounded bg-[#e4ded1] text-xs font-semibold hover:bg-[#d8cfbd]"
            onClick={() => setEditing(true)}
          >
            Modifier
          </button>
        ) : (
          <>
            <button
              className="px-3 py-2 rounded text-xs font-semibold"
              style={{ backgroundColor: "#2f4632", color: "#ffffff" }}
              onClick={() => {
                props.onSave(val);
                setEditing(false);
              }}
            >
              Enregistrer
            </button>
            <button
              className="px-3 py-2 rounded bg-[#e4ded1] text-xs font-semibold hover:bg-[#d8cfbd]"
              onClick={() => {
                setVal(props.value);
                setEditing(false);
              }}
            >
              Annuler
            </button>
          </>
        )}
      </div>
    </div>
  );
}
