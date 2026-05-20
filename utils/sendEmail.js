import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (options) => {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'DiasporaTogo <noreply@diasporatogo.com>',
      to: [options.email],
      subject: options.subject,
      html: options.html,
      text: options.text || options.message,
    });

    if (error) {
      throw new Error(`Resend error: ${JSON.stringify(error)}`);
    }

    console.log('✅ Email envoyé via Resend, id:', data.id);
    return true;
  } catch (error) {
    console.error('❌ Erreur Resend:', error.message);
    throw error;
  }
};

export { sendEmail };
