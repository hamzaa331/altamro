// src/app/api/account/request-email-change/route.ts
import { NextRequest, NextResponse } from "next/server";
import sgMail, { MailDataRequired } from "@sendgrid/mail";
import crypto from "crypto";
import { adminAuth } from "@/lib/firebase-admin";

// ---------- CORS HEADERS ----------
const corsHeaders = {
  // you can restrict to "https://app.flutterflow.io" and your domain later
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Handle preflight from browser
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}
// ----------------------------------

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

function createEmailChangeToken(
  uid: string,
  oldEmail: string,
  newEmail: string
) {
  const payload = JSON.stringify({
    uid,
    old_email: oldEmail,
    new_email: newEmail,
    exp: Date.now() + 1000 * 60 * 60, // 1h
  });

  const secret = process.env.APP_EMAIL_CHANGE_SECRET!;
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const token = Buffer.from(`${payload}::${hmac}`).toString("base64url");
  return token;
}

export async function GET() {
  return NextResponse.json(
    { ok: true, route: "/api/account/request-email-change" },
    {
      status: 200,
      headers: corsHeaders,
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { uid, old_email, new_email, first_name, last_name } = body || {};
    if (!uid || !old_email || !new_email) {
      return NextResponse.json(
        { ok: false, error: "Missing uid/old_email/new_email" },
        { status: 400, headers: corsHeaders }
      );
    }

    const token = createEmailChangeToken(uid, old_email, new_email);
    const verifyUrl = `https://altamro.vercel.app/api/account/confirm-email-change?token=${token}`;


    const appName = process.env.APP_NAME || "Altamaro";
    const year = new Date().getFullYear();

    // 1) mail to NEW email (verify)
    const msgNew: MailDataRequired = {
      to: new_email,
      from: {
        email: process.env.SEND_FROM_EMAIL!,
        name: process.env.SEND_FROM_NAME!,
      },
      templateId: process.env.SENDGRID_VERIFY_NEW_EMAIL_TEMPLATE_ID!,
      dynamicTemplateData: {
        first_name,
        last_name,
        old_email,
        new_email,
        verify_url: verifyUrl,
        app_name: appName,
        year,
      },
    };

    // 2) mail to OLD email (notice)
    const msgOld: MailDataRequired = {
      to: old_email,
      from: {
        email: process.env.SEND_FROM_EMAIL!,
        name: process.env.SEND_FROM_NAME!,
      },
      templateId: process.env.SENDGRID_EMAIL_CHANGED_TEMPLATE_ID!,
      dynamicTemplateData: {
        first_name,
        last_name,
        old_email,
        new_email,
        app_name: appName,
        year,
      },
    };

    await sgMail.send(msgNew);
    await sgMail.send(msgOld);

    return NextResponse.json(
      { ok: true },
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (err: any) {
    console.error("request-email-change error:", err?.response?.body || err);
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
