// src/app/password-change-success/page.tsx
export default function PasswordChangeSuccessPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f5f7f5",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          background: "#ffffff",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
          textAlign: "center",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <img
          src="https://res.cloudinary.com/dryxaquva/image/upload/v1759590547/l0khkr88b4egcl8hwy6g.jpg"
          alt="Altamaro"
          style={{ width: 180, margin: "0 auto 16px" }}
        />

        <h1
          style={{
            fontSize: 24,
            marginBottom: 8,
            color: "#2f4632",
            fontWeight: 700,
          }}
        >
          Mot de passe modifié avec succès
        </h1>

        <p
          style={{
            fontSize: 15,
            lineHeight: "22px",
            color: "#32473a",
            marginBottom: 16,
          }}
        >
          Votre mot de passe a été mis à jour.  
          Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
        </p>

        <p
          style={{
            fontSize: 13,
            lineHeight: "20px",
            color: "#6a7a70",
            marginBottom: 24,
          }}
        >
          Si vous n’êtes pas à l’origine de cette action,
          contactez immédiatement notre équipe support.
        </p>


        <a
          href="https://altamaro.com"
          style={{
            display: "inline-block",
            padding: "12px 20px",
            borderRadius: 999,
            background: "#b1853c",
            color: "#ffffff",
            fontSize: 15,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Retour à l’application
        </a>
      </div>
    </main>
  );
}
