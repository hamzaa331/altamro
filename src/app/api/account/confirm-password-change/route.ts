// src/app/api/account/confirm-password-change/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { adminAuth } from "@/lib/firebase-admin";

type PasswordChangePayload = {
  uid: string;
  email: string;
  new_password: string;
  exp: number;
};

function parseToken(token: string): PasswordChangePayload {
  const decoded = Buffer.from(token, "base64url").toString("utf8");
  const [payloadStr, hmac] = decoded.split("::");

  if (!payloadStr || !hmac) {
    throw new Error("Invalid token format");
  }

  const secret = process.env.APP_EMAIL_CHANGE_SECRET!; // OK: on réutilise le même secret
  const expectedHmac = crypto
    .createHmac("sha256", secret)
    .update(payloadStr)
    .digest("hex");

  if (expectedHmac !== hmac) {
    throw new Error("Invalid signature");
  }

  const payload = JSON.parse(payloadStr) as PasswordChangePayload;

  if (!payload.uid || !payload.new_password) {
    throw new Error("Missing uid/new_password");
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

    const { uid, new_password } = parseToken(token);

    // 1) Met à jour le mot de passe dans Firebase Auth
    await adminAuth.updateUser(uid, { password: new_password });

    // 2) Redirection vers la page de succès NEXT.JS
    const base = process.env.APP_DEFAULT_REDIRECT || "https://altamro.vercel.app";
    const normalizedBase = base.replace(/\/$/, ""); // supprime le / final si présent
    const redirectUrl = `${normalizedBase}/password-change-success`;

    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("confirm-password-change error:", err);

    const base = process.env.APP_DEFAULT_REDIRECT || "https://altamro.vercel.app";
    const normalizedBase = base.replace(/\/$/, "");
    const redirectUrl = `${normalizedBase}/password-change-error?error=1`;

    return NextResponse.redirect(redirectUrl);
  }
}
