// src/app/email-change-success/page.tsx

import Image from "next/image";

type Props = {
  searchParams: {
    old?: string;
    new?: string;
  };
};


export default function EmailChangeSuccessPage({ searchParams }: Props) {
  const oldEmail = searchParams.old || "Ancienne adresse inconnue";
  const newEmail = searchParams.new || "Nouvelle adresse inconnue";

  const appRedirect =
    process.env.APP_DEFAULT_REDIRECT || "https://altamaro.com/";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg border border-slate-100 p-8">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Image
            src="https://res.cloudinary.com/dryxaquva/image/upload/v1759590547/l0khkr88b4egcl8hwy6g.jpg"
            alt="Altamaro"
            width={180}
            height={60}
            className="h-auto w-auto"
          />
        </div>

        {/* Title */}
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 text-center mb-2">
          Votre adresse e-mail a été mise à jour
        </h1>
        <p className="text-slate-600 text-center mb-6">
          Nous avons bien enregistré la modification de votre adresse e-mail de
          connexion. Vous utiliserez désormais cette nouvelle adresse pour vous
          connecter à votre compte.
        </p>

        {/* Info card */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6">
          <p className="text-sm uppercase tracking-wide text-slate-500 mb-3">
            Détails de la modification
          </p>

          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">
                Ancienne adresse
              </p>
              <div className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-800 break-all">
                {oldEmail}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">
                Nouvelle adresse
              </p>
              <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 break-all">
                {newEmail}
              </div>
            </div>
          </div>
        </div>

        {/* Security note */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-amber-900">
            Si vous n&apos;êtes pas à l&apos;origine de cette modification,
            contactez rapidement notre équipe à{" "}
            <a
              href="mailto:contact@altamaro.com"
              className="font-medium underline"
            >
              contact@altamaro.com
            </a>{" "}
            afin que nous sécurisions votre compte.
          </p>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={appRedirect}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium transition"
          >
            Retour à l&apos;application
          </a>
        </div>
      </div>
    </div>
  );
}
