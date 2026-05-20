import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  console.error('❌ RESEND_API_KEY manquante — les emails ne seront pas envoyés');
}

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.EMAIL_FROM || 'DiasporaTogo <noreply@diasporatogo.com>';

export const sendVerificationEmail = async (email, code, name) => {
  console.log(`📧 Envoi OTP à ${email} depuis "${FROM}" (API key: ${process.env.RESEND_API_KEY ? 'présente' : 'ABSENTE'})`);
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [email],
    subject: 'Votre code de vérification',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Vérification de votre compte</h1>
        </div>

        <div style="padding: 30px; background-color: #f9f9f9;">
          <h2 style="color: #333;">Bonjour${name ? ' ' + name : ''},</h2>

          <p style="color: #666; line-height: 1.6;">
            Pour finaliser la création de votre compte,
            veuillez utiliser le code de vérification ci-dessous :
          </p>

          <div style="text-align: center; margin: 40px 0;">
            <div style="display: inline-block; background: white; padding: 20px 40px; border-radius: 10px;
                       border: 2px dashed #667eea; font-size: 32px; font-weight: bold; letter-spacing: 10px;
                       color: #333;">
              ${code}
            </div>
          </div>

          <div style="background-color: #fff8e1; border-left: 4px solid #ffb300; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #5d4037;">
              <strong>⚠️ Important :</strong> Ce code expirera dans 10 minutes.
              Ne le partagez avec personne.
            </p>
          </div>

          <p style="color: #666;">
            Si vous n'avez pas effectué cette demande, veuillez ignorer cet email.
          </p>

          <p style="color: #666;">
            Cordialement,<br>
            L'équipe DiasporaTogo
          </p>
        </div>

        <div style="background-color: #f5f5f5; padding: 20px; text-align: center; color: #999; font-size: 12px;">
          <p style="margin: 0;">
            © ${new Date().getFullYear()} DiasporaTogo. Tous droits réservés.
          </p>
        </div>
      </div>
    `,
  });

  if (error) {
    console.error('❌ Resend sendVerificationEmail error:', JSON.stringify(error));
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }

  console.log('✅ OTP envoyé, id:', data.id);
  return data;
};

export const sendWelcomeEmail = async (email, name) => {
  console.log(`📧 Envoi bienvenue à ${email} depuis "${FROM}"`);
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [email],
    subject: 'Bienvenue sur DiasporaTogo !',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Bienvenue !</h1>
        </div>

        <div style="padding: 30px; background-color: #f9f9f9;">
          <h2 style="color: #333;">Félicitations${name ? ', ' + name : ''} !</h2>

          <p style="color: #666; line-height: 1.6;">
            Votre compte a été vérifié avec succès. Vous pouvez maintenant accéder à toutes les fonctionnalités
            de notre plateforme.
          </p>

          <div style="background-color: #e8f5e9; border-left: 4px solid #4CAF50; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #2e7d32;">
              <strong>💡 Pour commencer :</strong><br>
              1. Complétez votre profil<br>
              2. Explorez les fonctionnalités<br>
              3. Rejoignez la communauté
            </p>
          </div>

          <p style="color: #666;">
            Si vous avez des questions, n'hésitez pas à contacter notre support.
          </p>

          <p style="color: #666;">
            Bienvenue à bord !<br>
            L'équipe DiasporaTogo
          </p>
        </div>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }

  return data;
};
