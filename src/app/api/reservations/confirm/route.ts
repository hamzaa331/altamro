export const runtime = "nodejs";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import Handlebars from "handlebars";

const templatePath = path.join(process.cwd(), "src/emails/reservation.html");
const htmlTemplate = fs.readFileSync(templatePath, "utf8");

export async function POST(req: Request) {
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
      app_name = "Altamaro"
    } = body || {};

    const year = new Date().getFullYear();

    // compile template
    const template = Handlebars.compile(htmlTemplate);
    const html = template({
      first_name,
      last_name,
      email,
      phone,
      espace,
      date,
      time,
      people,
      app_name,
      year
    });

    // transporter
   const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false, // 587 = TLS (STARTTLS)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});


    await transporter.sendMail({
      from: `"${app_name}" altamaroresto@gmail.com`,
      to: email,
      subject: `[${app_name}] Confirmation de réservation`,
      html
    });

    return Response.json({ ok: true });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || "send failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
