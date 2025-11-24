import { NextRequest, NextResponse } from "next/server";
import sgMail, { MailDataRequired } from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

// For easy test in browser
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/reservations/confirm",
    transport: "sendgrid",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      first_name,
      last_name,
      email,
      phone,
      espace,
      date,
      time,
      people,
      app_name = process.env.APP_NAME || "Altamaro",
    } = body || {};

    const year = new Date().getFullYear();

    const msg: MailDataRequired = {
      to: email,
      from: {
        email: process.env.SEND_FROM_EMAIL!,
        name: process.env.SEND_FROM_NAME!,
      },
      subject: `[${app_name}] Confirmation de réservation`,
      templateId: process.env.SENDGRID_RES_TEMPLATE_ID!,
      dynamicTemplateData: {
        first_name,
        last_name,
        email,
        phone,
        espace,
        date,
        time,
        people,
        app_name,
        year,
      },
    };

    await sgMail.send(msg);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("reservation-confirm error:", err?.response?.body || err);
    const message =
      err?.response?.body?.errors?.[0]?.message ||
      err?.response?.body ||
      err?.message ||
      "send failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
