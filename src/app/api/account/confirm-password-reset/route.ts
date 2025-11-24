// src/app/api/account/confirm-password-reset/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { adminAuth } from "@/lib/firebase-admin";

type PasswordResetPayload = {
  uid: string;
  email: string;
  exp: number;
};

function parseToken(token: string): PasswordResetPayload {
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

  const payload = JSON.parse(payloadStr) as PasswordResetPayload;

  if (!payload.uid || !payload.email) {
    throw new Error("Missing uid/email");
  }

  if (payload.exp < Date.now()) {
    throw new Error("Token expired");
  }

  return payload;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, new_password } = body || {};

    if (!token || !new_password) {
      return NextResponse.json(
        { ok: false, error: "Missing token/new_password" },
        { status: 400 }
      );
    }

    if (typeof new_password !== "string" || new_password.length < 6) {
      return NextResponse.json(
        { ok: false, error: "Password too short" },
        { status: 400 }
      );
    }

    const { uid } = parseToken(token);

    await adminAuth.updateUser(uid, {
      password: new_password,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("confirm-password-reset error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 }
    );
  }
}
