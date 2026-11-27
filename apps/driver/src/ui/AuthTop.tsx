/** Franja superior de las pantallas de acceso: marca, de qué trata la pantalla y una línea de contexto. */
export function AuthTop({ title, text }: { title: string; text: string }) {
  return (
    <div className="login-top">
      <div className="auth-logo">
        <img className="logo" src="/icon.svg" alt="" width={44} height={44} />
        <div>
          <strong>Forragest</strong>
          <small>Reparto</small>
        </div>
      </div>
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}
