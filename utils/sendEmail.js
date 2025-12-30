// import nodemailer from 'nodemailer';

// const sendEmail = async (options) => {
//   // Configuration du transporteur SMTP avec les informations de cPanel
//   const transporter = nodemailer.createTransport({
//     host: 'mail.diasporatogo.com', // Remplacez par votre serveur SMTP
//     port: 465, // Port SMTP (généralement 465 pour SSL ou 587 pour TLS)
//     secure: true, // true pour le port 465, false pour les autres ports
//     auth: {
//       user: 'support@diasporatogo.com', // Remplacez par votre adresse email
//       pass: 'Support@2025', // Remplacez par votre mot de passe
//     },
//   });

//   const mailOptions = {
//     from: 'support@diasporatogo.com', // Remplacez par votre adresse email
//     to: options.email,
//     subject: options.subject,
//     text: options.text || options.message, // Texte brut pour les clients qui ne supportent pas HTML
//     html: options.html, // Contenu HTML
//   };

//   try {
//     await transporter.sendMail(mailOptions);
//     console.log('Email envoyé avec succès');
//   } catch (error) {
//     console.error('Erreur lors de l\'envoi de l\'email:', error);
//   }
// };

// export { sendEmail };

// const sendEmail = async (options) => {
//   try {
//     const data = {
//       personalizations: [{
//         to: [{ email: options.email }],
//         subject: options.subject
//       }],
//       from: { 
//         email: 'support@diasporatogo.com', 
//         name: 'DiasporaTogo' 
//       },
//       content: [{
//         type: 'text/html',
//         value: options.html
//       }]
//     };

//     const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
//       method: 'POST',
//       headers: {
//         'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
//         'Content-Type': 'application/json'
//       },
//       body: JSON.stringify(data)
//     });

//     if (response.status === 403) {
//       throw new Error('API Key invalide ou permissions insuffisantes');
//     }
    
//     if (!response.ok) {
//       const errorText = await response.text();
//       throw new Error(`SendGrid error ${response.status}: ${errorText}`);
//     }

//     console.log('✅ Email envoyé avec SendGrid API');
//     return true;
//   } catch (error) {
//     console.error('❌ Erreur SendGrid API:', error.message);
//     throw error;
//   }
// };

// export { sendEmail };



const sendEmail = async (options) => {
  try {
    console.log('📧 Envoi via API REST SendGrid...');
    
    const data = {
      personalizations: [{
        to: [{ email: options.email }],
        subject: options.subject
      }],
      from: { 
        email: 'hezoubeke18@gmail.com',
        name: 'DiasporaTogo'
      },
      content: [{
        type: 'text/html',
        value: options.html
      }]
    };

    console.log('🔑 API Key utilisée:', process.env.SENDGRID_API_KEY ? 'PRÉSENTE' : 'ABSENTE');

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    console.log('📊 Statut SendGrid:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Détails erreur:', errorText);
      throw new Error(`SendGrid API error ${response.status}: ${errorText}`);
    }

    console.log('✅ Email envoyé via API REST SendGrid');
    return true;
  } catch (error) {
    console.error('❌ Erreur API SendGrid:', error.message);
    throw error;
  }
};

export { sendEmail };