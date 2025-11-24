// src/app/password-change-error/page.tsx
import Image from "next/image";

type PasswordChangeErrorPageProps = {
  searchParams: {
    reason?: string;
  };
};


export default function PasswordChangeErrorPage({
  searchParams,
}: PasswordChangeErrorPageProps) {
  const reason = searchParams.reason;

  const appRedirect =
    process.env.NEXT_PUBLIC_APP_DEFAULT_REDIRECT ||
    process.env.APP_DEFAULT_REDIRECT ||
    "https://altamaro.com/";

  const message =
    {
      invalid_or_expired:
        "Le lien que vous avez utilisé est invalide ou a expiré. Veuillez refaire une demande de changement de mot de passe.",
      missing:
        "Aucun lien de confirmation n’a été détecté. Veuillez refaire une demande.",
    }[reason || "invalid_or_expired"];

  return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg border border-red-100 p-8">
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
        <h1 className="text-2xl md:text-3xl font-semibold text-red-700 text-center mb-2">
          Erreur lors du changement de mot de passe
        </h1>

        {/* Error message */}
        <p className="text-red-600 text-center mb-6">{message}</p>

        {/* Info box */}
        <div className="bg-red-100 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-red-800">
            Pour des raisons de sécurité, les liens de confirmation sont valables
            pendant une durée limitée.
            <br />
            Si vous pensez que quelqu’un essaie d’accéder à votre compte,
            changez immédiatement votre mot de passe et contactez notre support.
            <br />
            <br />
            Email support :{" "}
            <a
              href="mailto:contact@altamaro.com"
              className="underline font-medium"
            >
              contact@altamaro.com
            </a>
          </p>
        </div>

        {/* CTA */}
        <div className="flex justify-center">
          <a
            href={appRedirect}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition"
          >
            Retour à l’application
          </a>
        </div>
      </div>
    </div>
  );
}
