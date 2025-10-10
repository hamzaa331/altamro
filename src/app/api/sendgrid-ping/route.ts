import { NextRequest, NextResponse } from 'next/server';
import sgMail from '@sendgrid/mail';
sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { to } = await req.json();
    await sgMail.send({
      to,
      from: { email: process.env.SEND_FROM_EMAIL!, name: process.env.SEND_FROM_NAME! },
      subject: 'Ping',
      text: 'SendGrid connectivity ok.',
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.response?.body || e.message }, { status: 500 });
  }
}
