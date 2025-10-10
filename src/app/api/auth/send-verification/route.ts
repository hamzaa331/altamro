// src/app/api/auth/send-verification/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import sgMail, { MailDataRequired } from '@sendgrid/mail';

function initFirebase() {
  if (!getApps().length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
    initializeApp({ credential: cert(sa) });
  }
}

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

// Health check (handy with ngrok)
export async function GET() {
  return NextResponse.json({ health: 'ok' });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // --- normalize + validate inputs coming from FlutterFlow ---
    const emailRaw = (body?.email ?? '').toString();
    const email = emailRaw.trim().toLowerCase();

    const first_name = (body?.first_name ?? '').toString().trim();
    const last_name  = (body?.last_name  ?? '').toString().trim();
    const image_url  = (body?.image_Url  ?? '').toString().trim();
    const app_name   = (body?.app_name   ?? process.env.APP_NAME ?? 'Altamaro').toString().trim();
    const verify_url = (body?.verify_url ?? '').toString().trim(); // test app URL you pass from FlutterFlow

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return NextResponse.json({ ok: false, error: 'invalid email', received: '${email}' }, { status: 400 });
    }

    // Generate a Firebase verification link if you DIDN’T supply verify_url
    initFirebase();
    const continueUrl = verify_url || process.env.APP_DEFAULT_REDIRECT!;
    const verifyLink = await getAuth().generateEmailVerificationLink(email, { url: continueUrl });

    // Build email payload for SendGrid Dynamic Template
    const msg: MailDataRequired = {
      to: email,
      from: { email: process.env.SEND_FROM_EMAIL!, name: process.env.SEND_FROM_NAME! },
      subject: `Bienvenue sur ${app_name} – Vérifiez votre email`,
      templateId: process.env.SENDGRID_VERIFY_TEMPLATE_ID!, // <- set this in your .env
      dynamicTemplateData: {
        app_name,
        first_name,
        last_name,
        email,
        // prefer the Firebase link (it carries Firebase OOB params), but still show your test URL in the email body too
        verify_url: verifyLink,
        // optional hero/logo (you can pass your FF value or fallback to a hosted logo)
        image_url: image_url || 'https://res.cloudinary.com/dryxaquva/image/upload/v1728471264/altamaro-logo.png',
        // brand colors used in the template
        brand_bg: '#2f4632',
        brand_accent: '#b1853c'
      }
    };

    await sgMail.send(msg);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('send-verification error:', e?.response?.body || e);
    const message =
      e?.response?.body?.errors?.[0]?.message ||
      e?.response?.body ||
      e?.message ||
      'internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
