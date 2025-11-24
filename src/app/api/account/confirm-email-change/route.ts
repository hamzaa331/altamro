import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

type EmailChangePayload = {
  uid: string;
  old_email: string;
  new_email: string;
  exp: number;
};

function parseToken(token: string): EmailChangePayload {
  const decoded = Buffer.from(token, "base64url").toString("utf8");
  const [payloadStr, hmac] = decoded.split("::");

  if (!payloadStr || !hmac) {
    throw new Error("Invalid token format");
  }

  const secret = process.env.APP_EMAIL_CHANGE_SECRET!;
  const expectedHmac = crypto
    .createHmac("sha256", secret)
    .update(payloadStr)
    .digest("hex");

  if (expectedHmac !== hmac) {
    throw new Error("Invalid signature");
  }

  const payload = JSON.parse(payloadStr) as EmailChangePayload;

  if (!payload.uid || !payload.new_email) {
    throw new Error("Missing uid/new_email");
  }

  if (payload.exp < Date.now()) {
    throw new Error("Token expired");
  }

  return payload;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing token" },
        { status: 400 }
      );
    }

    const { uid, old_email, new_email } = parseToken(token);

    // 1) Met à jour Firebase Auth
    await adminAuth.updateUser(uid, { email: new_email });

    // 2) Met à jour Firestore: collection "user", doc = uid
    await adminDb.collection("user").doc(uid).set(
      {
        email: new_email,
      },
      { merge: true }
    );

    // 3) Redirige vers une page de succès avec old/new en query
    const redirectUrl = new URL("/email-change-success", req.url);
    redirectUrl.searchParams.set("old", old_email);
    redirectUrl.searchParams.set("new", new_email);

    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("confirm-email-change error:", err);

    const redirectUrl = new URL("/email-change-error", req.url);
    redirectUrl.searchParams.set("reason", "invalid_or_expired");

    return NextResponse.redirect(redirectUrl);
  }
}
