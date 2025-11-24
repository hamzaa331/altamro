// src/app/api/account/request-password-reset/route.ts
import { NextRequest, NextResponse } from "next/server";
import sgMail, { MailDataRequired } from "@sendgrid/mail";
import crypto from "crypto";
import { adminAuth } from "@/lib/firebase-admin";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders });
}

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

type PasswordResetPayload = {
  uid: string;
  email: string;
  exp: number;
};

function createPasswordResetToken(uid: string, email: string) {
  const payload: PasswordResetPayload = {
    uid,
    email,
    exp: Date.now() + 1000 * 60 * 60, // 1h
  };

  const payloadStr = JSON.stringify(payload);
  const secret = process.env.APP_EMAIL_CHANGE_SECRET!; // on réutilise le même secret
  const hmac = crypto.createHmac("sha256", secret).update(payloadStr).digest("hex");
  const token = Buffer.from(`${payloadStr}::${hmac}`).toString("base64url");
  return token;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body || {};

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing email" },
        { status: 400, headers: corsHeaders }
      );
    }

    let uid: string | null = null;
    try {
      const user = await adminAuth.getUserByEmail(email);
      uid = user.uid;
    } catch (e) {
      // Si l'email n'existe pas, on ne révèle rien : on répond ok quand même.
      console.warn("Password reset requested for unknown email:", email);
    }

    // Toujours répondre ok pour ne pas révéler si l’email existe ou pas.
    if (!uid) {
      return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
    }

    const token = createPasswordResetToken(uid, email);

    const base = process.env.APP_DEFAULT_REDIRECT || "https://altamaro.com";
    const resetUrl = `${base.replace(/\/$/, "")}/reset-password?token=${token}`;

    const appName = process.env.APP_NAME || "Altamaro";
    const year = new Date().getFullYear();

    const msg: MailDataRequired = {
      to: email,
      from: {
        email: process.env.SEND_FROM_EMAIL!,
        name: process.env.SEND_FROM_NAME!,
      },
      templateId: process.env.SENDGRID_PASSWORD_RESET_TEMPLATE_ID!,
      dynamicTemplateData: {
        reset_url: resetUrl,
        app_name: appName,
        year,
        email,
      },
    };

    await sgMail.send(msg);

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error("request-password-reset error:", err?.response?.body || err);
    const message =
      err?.response?.body?.errors?.[0]?.message ||
      err?.response?.body ||
      err?.message ||
      "send failed";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: corsHeaders }
    );
  }
}
