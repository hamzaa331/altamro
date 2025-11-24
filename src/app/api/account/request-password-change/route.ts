// src/app/api/account/request-password-change/route.ts
import { NextRequest, NextResponse } from "next/server";
import sgMail, { MailDataRequired } from "@sendgrid/mail";
import crypto from "crypto";

// ---------- CORS HEADERS ----------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // tu peux restreindre plus tard
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}
// ----------------------------------

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

type PasswordChangePayload = {
  uid: string;
  email: string;
  new_password: string;
  exp: number;
};

// on génère un token signé avec ton secret
function createPasswordChangeToken(
  uid: string,
  email: string,
  newPassword: string
) {
  const payload: PasswordChangePayload = {
    uid,
    email,
    new_password: newPassword,
    exp: Date.now() + 1000 * 60 * 60, // 1h
  };

  const payloadStr = JSON.stringify(payload);
  const secret = process.env.APP_EMAIL_CHANGE_SECRET!;
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(payloadStr)
    .digest("hex");

  const token = Buffer.from(`${payloadStr}::${hmac}`).toString("base64url");
  return token;
}

export async function GET() {
  return NextResponse.json(
    { ok: true, route: "/api/account/request-password-change" },
    { status: 200, headers: corsHeaders }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      uid,
      email,
      new_password,
      first_name,
      last_name,
    }: {
      uid?: string;
      email?: string;
      new_password?: string;
      first_name?: string;
      last_name?: string;
    } = body || {};

    if (!uid || !email || !new_password) {
      return NextResponse.json(
        { ok: false, error: "Missing uid/email/new_password" },
        { status: 400, headers: corsHeaders }
      );
    }

    const token = createPasswordChangeToken(uid, email, new_password);

    // l’URL de confirmation (route API qui fera le vrai changement)
    function getBaseUrlFromReq(req: NextRequest) {
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "http";
  if (!host) return process.env.APP_BASE_URL || "http://localhost:3000";
  return `${proto}://${host}`;
}

// inside POST:
const base = getBaseUrlFromReq(req).replace(/\/$/, "");
const confirmUrl = `${base}/api/account/confirm-password-change?token=${token}`;
    const appName = process.env.APP_NAME || "Altamaro";
    const year = new Date().getFullYear();

    const msg: MailDataRequired = {
      to: email,
      from: {
        email: process.env.SEND_FROM_EMAIL!,
        name: process.env.SEND_FROM_NAME!,
      },
      templateId: process.env.SENDGRID_CONFIRM_PASSWORD_TEMPLATE_ID!,
      dynamicTemplateData: {
        first_name,
        last_name,
        app_name: appName,
        confirm_url: confirmUrl,
        year,
      },
    };

    await sgMail.send(msg);

    return NextResponse.json(
      { ok: true },
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (err: any) {
    console.error("request-password-change error:", err?.response?.body || err);
    const message =
      err?.response?.body?.errors?.[0]?.message ||
      err?.response?.body ||
      err?.message ||
      "send failed";

    return NextResponse.json(
      { ok: false, error: message },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}
