import { NextResponse } from "next/server";
import admin from "firebase-admin";
import sgMail from "@sendgrid/mail";

function isAuthorized(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  return auth === expected;
}

if (!admin.apps.length) {
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!svc) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_KEY");
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(svc)),
  });
}
const db = admin.firestore();

if (!process.env.SENDGRID_API_KEY) throw new Error("Missing SENDGRID_API_KEY");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return new NextResponse(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
  }

  const now = new Date();
  const start = new Date(now.getTime() + 30 * 60000); // +30min
  const end   = new Date(now.getTime() + 45 * 60000); // +45min window

  const snap = await db
    .collection("Reservation")
    .where("start_at", ">=", admin.firestore.Timestamp.fromDate(start))
    .where("start_at", "<",  admin.firestore.Timestamp.fromDate(end))
    .where("reminderSent", "==", false)
    .get();

  let sent = 0;
  for (const doc of snap.docs) {
    const r = doc.data() as any;
    const email = r.Email || r.email;
    if (!email) continue;

    const when = (r.start_at?.toDate?.() || r.start_at) as Date;
    const timeLabel = when.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    const msg = {
      to: email,
      from: { email: process.env.SEND_FROM_EMAIL!, name: process.env.SEND_FROM_NAME || "Altamaro" },
      subject: `[Altamaro] Rappel: votre réservation à ${timeLabel} (dans 30 min)`,
      html: `
        <p>Bonjour ${r.Prenom ?? ""} ${r.Nom ?? ""},</p>
        <p>Petit rappel : votre réservation chez <strong>Altamaro</strong> est prévue à <strong>${timeLabel}</strong> (≈30 minutes).</p>
        <p>À très bientôt !</p>
      `,
    };

    try {
      await sgMail.send(msg);
      await doc.ref.update({ reminderSent: true });
      sent++;
    } catch (e) {
      console.error("SendGrid error:", e);
    }
  }

  return NextResponse.json({ ok: true, checked: snap.size, sent });
}
