import { Resend } from "resend";

const DEFAULT_FROM =
  "Discipulado Águas Purificadoras <acesso@acesso.aguaspurificadoras.com.br>";

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendVerificationCodeEmail({ to, code, firstName, purpose }) {
  if (!isEmailConfigured()) {
    throw new Error(
      "Configure a integração do Resend na Vercel para enviar o código de acesso.",
    );
  }

  const isReset = purpose === "redefinir";
  const subject = isReset
    ? `Código para redefinir sua senha: ${code}`
    : `Seu código de acesso: ${code}`;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.STUDY_EMAIL_FROM || DEFAULT_FROM,
    to: [to],
    subject,
    text: buildText({ code, firstName, isReset }),
    html: buildHtml({ code, firstName, isReset }),
  });

  if (error) {
    throw new Error(error.message || "Não foi possível enviar o código.");
  }
}

function buildText({ code, firstName, isReset }) {
  const greeting = firstName ? `Olá, ${firstName}!` : "Olá!";
  const reason = isReset
    ? "Você pediu para redefinir a senha do Discipulado."
    : "Você está criando sua senha no Discipulado.";

  return [
    greeting,
    "",
    reason,
    "",
    `Seu código é: ${code}`,
    "",
    "O código vale por 15 minutos e só pode ser usado uma vez.",
    "Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.",
    "",
    "Igreja Apostólica e Profética Águas Purificadoras",
  ].join("\n");
}

/**
 * E-mail em tabela com estilo inline de propósito: cliente de e-mail não tem
 * suporte confiável a flexbox, grid nem folha de estilo externa.
 */
function buildHtml({ code, firstName, isReset }) {
  const greeting = firstName ? `Olá, ${escapeHtml(firstName)}!` : "Olá!";
  const reason = isReset
    ? "Você pediu para redefinir a sua senha do Discipulado."
    : "Falta pouco para você criar a sua senha do Discipulado.";
  const spacedCode = escapeHtml(code).split("").join("&#8202;");

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>${isReset ? "Redefinir senha" : "Código de acesso"}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f6fb;">
    <div style="display:none;font-size:1px;color:#f4f6fb;max-height:0;overflow:hidden;">
      Seu código é ${escapeHtml(code)} e vale por 15 minutos.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(15,23,42,0.08);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="background-color:#1e3a8a;padding:24px 32px;">
                <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#bfdbfe;">
                  Águas Purificadoras
                </p>
                <p style="margin:4px 0 0;font-size:20px;font-weight:600;color:#ffffff;">
                  Discipulado de Líderes
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px;">
                <p style="margin:0 0 12px;font-size:16px;color:#0f172a;">${greeting}</p>
                <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">${reason}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;border-radius:12px;border:1px solid #e2e8f0;">
                  <tr>
                    <td align="center" style="padding:20px 16px;">
                      <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">
                        Seu código
                      </p>
                      <p style="margin:0;font-size:36px;font-weight:700;letter-spacing:0.16em;color:#1e3a8a;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;">
                        ${spacedCode}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#475569;">
                  Digite o código no aplicativo para continuar. Ele vale por
                  <strong style="color:#0f172a;">15 minutos</strong> e só pode ser usado uma vez.
                </p>
                <p style="margin:0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#94a3b8;">
                  Se não foi você que pediu, ignore este e-mail — sua senha continua a mesma.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            Igreja Apostólica e Profética Águas Purificadoras
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
