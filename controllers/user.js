import User from '../models/userModel.js';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { cloudinary } from '../utils/cloudinary.js';
import { sendEmail } from "../utils/sendEmail.js"
import crypto from "crypto";
import otpGenerator from "otp-generator"
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
//importation  du service de communication stripe
import stripe from '../utils/stripe.js';
import { sendVerificationEmail, sendWelcomeEmail } from '../utils/emailService.js';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', 
  port: 465, 
  secure: true, 
  auth: {
    user: 'diasporatogocontact@gmail.com',
    pass: 'xmsaeefvcfozrqzo',
  },
});

// export const login = async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     // Trouver l'utilisateur
//     const foundUser = await user.findOne({ email });
//     if (!foundUser) {
//       return res.status(401).json({
//         success: false,
//         message: 'Email ou mot de passe incorrect'
//       });
//     }

//     // Vérifier si le compte est validé
//     if (!foundUser.isValid) {
//       return res.status(403).json({
//         success: false,
//         message: 'Veuillez vérifier votre compte avant de vous connecter'
//       });
//     }

//     // Vérifier si le compte est rejeté
//     if (foundUser.isRejet) {
//       return res.status(403).json({
//         success: false,
//         message: 'Votre compte a été rejeté. Contactez l\'administration pour plus d\'informations'
//       });
//     }

//     // Vérifier le mot de passe
//     const isPasswordValid = await foundUser.comparePassword(password);
//     if (!isPasswordValid) {
//       return res.status(401).json({
//         success: false,
//         message: 'Email ou mot de passe incorrect'
//       });
//     }

//     // Générer le token JWT
//     const token = await foundUser.generateAuthToken();
    
//     // Ajouter le token à la liste des tokens de l'utilisateur
//     await foundUser.addToken(token, req.headers['user-agent'], req.ip);
    
//     // Mettre à jour la dernière connexion
//     foundUser.lastLogin = new Date();
//     await foundUser.save();

//     // Réponse formatée comme le premier backend (sans cookie)
//     res.status(200).json({
//       success: true,
//       message: 'Connexion réussie',
//       data: {
//         token,
//         user: {
//           id: foundUser._id,
//           email: foundUser.email,
//           name: foundUser.name,
//           username: foundUser.username,
//           role: foundUser.role,
//           first_name: foundUser.name?.split(' ')[0] || '',
//           last_name: foundUser.name?.split(' ').slice(1).join(' ') || '',
//           isValid: foundUser.isValid,
//           isRejet: foundUser.isRejet,
//           avatar: foundUser.avatar,
//           profession: foundUser.profession,
//           phoneNumber: foundUser.phoneNumber,
//           town: foundUser.town,
//           country: foundUser.country,
//           bio: foundUser.bio,
//           typeUser: foundUser.typeUser,
//           paymentVerified: foundUser.paymentVerified,
//           stripeCustomerId: foundUser.stripeCustomerId,
//           createdAt: foundUser.createdAt,
//           updatedAt: foundUser.updatedAt
//         }
//       }
//     });
//   } catch (error) {
//     console.error('Erreur lors de la connexion:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Erreur interne du serveur'
//     });
//   }
// };

export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validation des champs
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: "Email et mot de passe sont requis",
        code: "MISSING_CREDENTIALS"
      });
    }

    // Recherche de l'utilisateur avec sélection du mot de passe
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "Identifiants incorrects",
        code: "USER_NOT_FOUND"
      });
    }

    // CORRECTION: Si l'utilisateur n'a pas de username, en créer un
    if (!user.username || user.username.trim() === '') {
      const baseUsername = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      user.username = `${baseUsername || 'user'}${Math.floor(Math.random() * 1000)}`;
      
      // S'assurer de l'unicité
      let isUnique = false;
      let attempts = 0;
      let finalUsername = user.username;
      
      while (!isUnique && attempts < 10) {
        const existingUser = await User.findOne({ 
          username: finalUsername,
          _id: { $ne: user._id }
        });
        
        if (!existingUser) {
          isUnique = true;
          user.username = finalUsername;
        } else {
          finalUsername = `${baseUsername || 'user'}${Math.floor(Math.random() * 9000 + 1000)}`;
          attempts++;
        }
      }
      
      await user.save();
    }
    // Générer un token JWT
    const token = jwt.sign(
      { 
        userId: user._id,
        email: user.email,
        role: user.role,
        userType: user.userType,
        isVerified: user.isVerified,
        isActive: user.isActive
      }, 
      process.env.SECRET || 'ASKDGJSLDJGSLA;KDJIUOEWUTPIOUASKLDGJ;SLDKAJG',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Options pour le cookie
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Cookie HTTP Only sécurisé
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
      path: '/'
    });

    // Cookie pour le frontend (non-HTTPOnly)
    res.cookie('is_authenticated', 'true', {
      httpOnly: false,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    // Journalisation de la connexion
    // console.log(`✅ Connexion réussie: ${user.email} (${user.userType}) - ${new Date().toISOString()}`);

    // Réponse de succès
    res.status(200).json({
      success: true,
      message: "Connexion réussie",
      code: "LOGIN_SUCCESS",
      data: {
        token,
        user: {
          _id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          phoneNumber: user.phoneNumber,
          profession: user.profession,
          country: user.country,
          city: user.city,
          role: user.role,
          userType: user.userType,
          isVerified: user.isVerified,
          isActive: user.isActive,
          paymentStatus: user.paymentStatus,
          amountPaid: user.amountPaid,
          paymentDate: user.paymentDate,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt
        },
        session: {
          expiresIn: process.env.JWT_EXPIRES_IN || '7d',
          device: req.headers['user-agent']?.substring(0, 50) || 'Unknown'
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur lors de la connexion:', error);
    
    res.status(500).json({
      success: false,
      message: "Erreur interne du serveur",
      code: "SERVER_ERROR",
      errorId: `ERR-${Date.now()}`
    });
  }
};

// export const register = async (req, res) => {
//   const { 
//     firstname, 
//     lastname,
//     username, 
//     email, 
//     password,
//     phoneNumber, 
//     profession,
//     country,
//     town,
//     typeUser, // "individual" ou "company" (type d'utilisateur)
//     accountType, // "free" ou "premium" (type de compte)
//     paymentMethodId // ID de la méthode de paiement Stripe (pour premium)
//   } = req.body;

//   try {
//     // 1. Vérification de l'utilisateur existant
//     let existingUser = await User.findOne({ email });

//     if (existingUser && existingUser.isValid) {
//       return res.status(400).json({ 
//         message: "Un utilisateur avec cet email existe déjà" 
//       });
//     }

//     // 2. Génération OTP (pour tous les utilisateurs)
//     const otp = Math.floor(100000 + Math.random() * 900000).toString();
//     const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

//     // 3. Déterminer le rôle et les caractéristiques selon typeUser
//     let userRole = 'User'; // Rôle par défaut
//     let requiresPayment = false;
//     let isPremiumAccount = false;
//     let stripeCustomerId = null;
//     let paymentIntentId = null;
//     let subscriptionPrice = null;

//     // Configuration basée sur le type d'utilisateur et type de compte
//     switch(typeUser) {
//       case 'individual':
//         userRole = 'Individual';
//         if (accountType === 'premium') {
//           requiresPayment = true;
//           isPremiumAccount = true;
//           subscriptionPrice = 990; // 9.90€ pour individu premium
//         }
//         break;
        
//       case 'company':
//         userRole = 'Company';
//         if (accountType === 'premium') {
//           requiresPayment = true;
//           isPremiumAccount = true;
//           subscriptionPrice = 2990; // 29.90€ pour entreprise premium
//         }
//         break;
        
//       case 'freelancer':
//         userRole = 'Freelancer';
//         if (accountType === 'premium') {
//           requiresPayment = true;
//           isPremiumAccount = true;
//           subscriptionPrice = 1490; // 14.90€ pour freelancer premium
//         }
//         break;
        
//       default:
//         userRole = 'User';
//         accountType = 'free';
//     }

//     // 4. Traitement du paiement pour les comptes premium
//     if (requiresPayment && paymentMethodId) {
//       // Créer un client Stripe
//       const customer = await stripe.customers.create({
//         email,
//         name: `${firstname} ${lastname}`,
//         phone: phoneNumber,
//         metadata: {
//           typeUser,
//           accountType,
//           profession,
//           country
//         }
//       });
      
//       stripeCustomerId = customer.id;

//       // Créer un PaymentIntent
//       const paymentIntent = await stripe.paymentIntents.create({
//         amount: subscriptionPrice,
//         currency: 'eur',
//         customer: customer.id,
//         payment_method: paymentMethodId,
//         description: `Abonnement ${typeUser} ${accountType} - ${username}`,
//         metadata: {
//           typeUser,
//           accountType,
//           plan: 'premium'
//         },
//         confirm: true,
//         return_url: `${process.env.BASE_URL}/payment-success?email=${encodeURIComponent(email)}`
//       });

//       paymentIntentId = paymentIntent.id;

//       // Vérifier si le paiement a réussi
//       if (paymentIntent.status !== 'succeeded') {
//         return res.status(400).json({
//           message: "Le paiement a échoué",
//           paymentStatus: paymentIntent.status,
//           clientSecret: paymentIntent.client_secret,
//           requiresAction: paymentIntent.status === 'requires_action'
//         });
//       }
//     }

//     // 5. Préparation des données utilisateur
//     const userData = {
//       email,
//       name: `${firstname} ${lastname}`,
//       phoneNumber,
//       profession,
//       username,
//       password,
//       country,
//       town,
//       typeUser, // Type d'utilisateur: individual, company, freelancer
//       role: userRole, // Rôle dans l'application: Individual, Company, Freelancer, etc.
//       otp,
//       otpExpires,
//       stripeCustomerId,
//       paymentIntentId,
//       paymentVerified: isPremiumAccount,
//       accountType, // free ou premium
//       isValid: isPremiumAccount ? true : false, // Premium validé immédiatement, free besoin OTP
//       bio: accountType === 'premium' ? 'Compte Premium' : 'Available'
//     };

//     // 6. Création ou mise à jour de l'utilisateur
//     if (!existingUser) {
//       existingUser = new User(userData);
//     } else {
//       // Préserver certaines données existantes
//       const preserveFields = ['contacts', 'file', 'avatar', 'createdAt'];
//       preserveFields.forEach(field => {
//         if (existingUser[field]) {
//           userData[field] = existingUser[field];
//         }
//       });
//       Object.assign(existingUser, userData);
//     }

//     await existingUser.save();

//     // 7. Envoi de l'email de confirmation
//     const transporter = nodemailer.createTransport({
//       host: process.env.EMAIL_SERVICE || 'smtp.gmail.com',
//       port: 465,
//       secure: true,
//       auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASSWORD
//       }
//     });

//     // Déterminer le sujet de l'email
//     let emailSubject = '';
//     let emailContent = '';
    
//     if (isPremiumAccount) {
//       emailSubject = `Confirmation de votre compte ${typeUser} Premium`;
//       emailContent = `
//         <p>Votre inscription en tant que ${typeUser} premium a été confirmée avec succès.</p>
//         <p><strong>Type de compte :</strong> ${typeUser.charAt(0).toUpperCase() + typeUser.slice(1)} Premium</p>
//         <p><strong>Rôle :</strong> ${userRole}</p>
//         <p><strong>Forfait :</strong> Premium (${subscriptionPrice/100}€)</p>
//         <p>Vous avez maintenant accès à toutes les fonctionnalités premium.</p>
//         <p>Votre compte a été automatiquement validé grâce à votre paiement.</p>
//       `;
//     } else {
//       emailSubject = 'Vérification de votre compte';
//       emailContent = `
//         <p>Votre code OTP de vérification est :</p>
//         <div style="background-color: #f4f4f4; padding: 15px; text-align: center; 
//                     font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
//           ${otp}
//         </div>
//         <p>Ce code expire dans 10 minutes.</p>
//         <p><strong>Type de compte :</strong> ${typeUser} (Gratuit)</p>
//         <p><strong>Rôle :</strong> ${userRole}</p>
//       `;
//     }

//     const mailOptions = {
//       from: process.env.EMAIL_USER,
//       to: email,
//       subject: emailSubject,
//       html: `
//         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//           <h2>${isPremiumAccount ? 'Bienvenue !' : 'Vérification de compte'}</h2>
//           <p>Bonjour ${firstname} ${lastname},</p>
//           ${emailContent}
//           <hr style="margin: 20px 0;" />
//           <p style="color: #666; font-size: 12px;">
//             ${isPremiumAccount 
//               ? 'Merci pour votre confiance ! Accédez à votre tableau de bord pour commencer.' 
//               : 'Si vous n\'avez pas créé ce compte, ignorez cet email.'}
//           </p>
//         </div>
//       `
//     };

//     await transporter.sendMail(mailOptions);

//     // 8. Réponse adaptée
//     const response = {
//       message: isPremiumAccount 
//         ? `Inscription ${typeUser} premium confirmée avec succès` 
//         : "Un code OTP a été envoyé par email",
//       userType: typeUser,
//       accountType: accountType,
//       role: userRole,
//       email: email,
//       paymentVerified: isPremiumAccount,
//       isValid: isPremiumAccount,
//       redirectUrl: isPremiumAccount 
//         ? `${process.env.BASE_URL}/dashboard` 
//         : `${process.env.BASE_URL}/verify?email=${encodeURIComponent(email)}`
//     };

//     if (isPremiumAccount && paymentIntentId) {
//       response.paymentId = paymentIntentId;
//       response.subscriptionPrice = subscriptionPrice / 100;
//     }

//     if (!isPremiumAccount) {
//       response.otpRequired = true;
//     }

//     res.status(200).json(response);

//   } catch (error) {
//     console.error('Erreur lors de l\'inscription:', error);

//     // Gestion spécifique des erreurs Stripe
//     if (error.type && error.type.includes('Stripe')) {
//       return res.status(400).json({
//         message: "Erreur de traitement du paiement",
//         error: error.message,
//         code: error.code
//       });
//     }

//     // Gestion des erreurs de validation Mongoose
//     if (error.name === 'ValidationError') {
//       const errors = Object.values(error.errors).map(err => err.message);
//       return res.status(400).json({
//         message: "Erreur de validation",
//         errors
//       });
//     }

//     res.status(500).json({
//       message: "Erreur lors de l'inscription",
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };

// // Fonction utilitaire pour convertir typeUser en rôle
// export const getUserRole = (typeUser, accountType) => {
//   const roleMap = {
//     'individual': 'Individual',
//     'company': 'Company',
//     'freelancer': 'Freelancer',
//     'admin': 'Admin',
//     'moderator': 'Moderator',
//     'support': 'Support'
//   };
  
//   return roleMap[typeUser] || 'User';
// };

// // Fonction pour mettre à jour le rôle (pour l'admin)
export const updateUserRole = async (req, res) => {
  const { userId, newRole } = req.body;
  
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }
    
    // Vérifier si le nouveau rôle est valide
    const validRoles = ['User', 'Individual', 'Company', 'Freelancer', 'Support', 'Admin', 'Moderator', 'Supervisor'];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({ 
        message: "Rôle invalide",
        validRoles 
      });
    }
    
    // Mettre à jour le rôle
    user.role = newRole;
    await user.save();
    
    res.status(200).json({
      message: "Rôle mis à jour avec succès",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        typeUser: user.typeUser
      }
    });
    
  } catch (error) {
    console.error('Erreur lors de la mise à jour du rôle:', error);
    res.status(500).json({ 
      message: "Erreur lors de la mise à jour du rôle" 
    });
  }
};


// export const register = async (req, res) => {
//   const { 
//     firstname, 
//     lastname,
//     username, 
//     email, 
//     password,
//     phoneNumber, 
//     profession,
//     country,
//     town,
//     typeUser
//   } = req.body;

//   try {
//     let existingUser = await User.findOne({ email });

//     if (existingUser && existingUser.isValid) {
//       return res.status(400).json({ message: "L'utilisateur existe déjà" });
//     }

// 	  const otp = Math.floor(100000 + Math.random() * 900000).toString();
//     // const otp = otpGenerator.generate(5, { digits: true, alphabets: false, specialChars: false });
//     const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes

//     if (!existingUser) {
//       // const hashedPassword = await bcrypt.hash(password, 12);
//       existingUser = new User({ 
//         email, 
//         name: `${firstname} ${lastname}`,
//         phoneNumber,
//         profession,
//         username,
//         password,
//         country,
//         town,
//         typeUser,
//         otp, 
//         otpExpires 
//       });
//     } else {
//       // const hashedPassword = await bcrypt.hash(password, 12);
//       // existingUser.password = hashedPassword;
//       existingUser.otp = otp;
//       existingUser.otpExpires = otpExpires;
//     }

//     await existingUser.save();

//     await transporter.sendMail({
//       from: "diasporatogocontact@gmail.com",
//       to: email,
//       subject: "Vérifiez votre compte",
//       text: `Votre code est ${otp}. Il expire dans 10 minutes.`,
//     });

//     res.status(200).send({ message: "Un code OTP a ete envoyer par mail", redirectUrl: `${process.env.BASE_URL}/verify?email=${email}` });
//   } catch (error) {
//     console.log('Error in register ' + error);
//     res.status(500).send(error);
//   }
// };


// Fonction utilitaire pour nettoyer les comptes non validés expirés
const cleanupExpiredUnverifiedAccounts = async () => {
  try {
    const expiryDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 heures
    
    const result = await User.deleteMany({
      isValid: false,
      createdAt: { $lt: expiryDate },
      otpExpires: { $lt: new Date() }
    });
    
    if (result.deletedCount > 0) {
      console.log(`Nettoyage: ${result.deletedCount} comptes non validés expirés supprimés`);
    }
  } catch (error) {
    console.error('Erreur lors du nettoyage des comptes expirés:', error);
  }
};

// Fonction pour vérifier si un email peut être réutilisé
export const checkEmailAvailability = async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email requis'
      });
    }
    
    const existingUser = await User.findOne({ email });
    
    if (!existingUser) {
      return res.status(200).json({
        success: true,
        data: {
          available: true,
          message: 'Email disponible'
        }
      });
    }
    
    if (existingUser.isValid) {
      return res.status(200).json({
        success: true,
        data: {
          available: false,
          message: 'Un compte avec cet email existe déjà',
          isVerified: true
        }
      });
    }
    
    // Vérifier si le compte non validé a expiré
    const isExpired = existingUser.otpExpires && existingUser.otpExpires < new Date();
    
    return res.status(200).json({
      success: true,
      data: {
        available: isExpired,
        message: isExpired 
          ? 'Ancien compte non validé expiré - email réutilisable' 
          : 'Un code de vérification a déjà été envoyé à cet email',
        isVerified: false,
        isExpired: isExpired,
        createdAt: existingUser.createdAt
      }
    });
  } catch (error) {
    console.error('Erreur lors de la vérification de l\'email:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification'
    });
  }
};


export const validUser = async (req, res) => {
  try {
    const validuser = await User
      .findOne({ _id: req.rootUserId })
      .select('-password');
    if (!validuser) res.json({ message: 'user is not valid' });
    res.status(201).json({
      user: validuser,
      token: req.token,
    });
  } catch (error) {
    res.status(500).json({ error: error });
    console.log(error);
  }
};

export const googleAuth = async (req, res) => {

  try {
    const { tokenId } = req.body;

    // Validation du token Google
    const client = new OAuth2Client(process.env.CLIENT_ID || "372464699967-rcisa4jb296eiesvr6ug632g0umnpb5i.apps.googleusercontent.com");
    const ticket = await client.verifyIdToken({
      idToken: tokenId,
      audience: process.env.CLIENT_ID || "372464699967-rcisa4jb296eiesvr6ug632g0umnpb5i.apps.googleusercontent.com",
    });

    const { email_verified, email, name, picture } = ticket.getPayload();

    if (!email_verified) {
      return res.status(400).json({ message: 'Email non vérifié par Google' });
    }

    // Recherche ou création de l'utilisateur
    let userData = await User.findOne({ email }).select('-password');

    if (!userData) {
      const password = crypto.randomBytes(16).toString('hex'); // Mot de passe plus sécurisé
      userData = await User.create({
        name,
        email,
        password,
        avatar: picture,
        isValid: true,
        authMethod: 'google' // Pour suivre la méthode d'authentification
      });
    }

    // Génération du token JWT
    const token = await userData.generateAuthToken();

    // Réponse sécurisée
    res.cookie('userToken', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      domain: process.env.NODE_ENV === 'production'
        ? 'diaspora-togo.vercel.app' // Sans le point devant !
        : 'localhost',
      maxAge: 86400000,
      path: '/'
    });
    return res
      .status(200)
      .json({
        token,
        user: {
          _id: userData._id,
          name: userData.name,
          email: userData.email,
          avatar: userData.avatar
        }
      });

  } catch (error) {
    console.error('Erreur backend:', error);
    return res.status(500).json({
      error: 'Erreur serveur',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// export const googleAuth = async (req, res) => {
//   try {
//     const { tokenId } = req.body;
//     const client = new OAuth2Client(process.env.CLIENT_ID);
//     const verify = await client.verifyIdToken({
//       idToken: tokenId,
//       audience: process.env.CLIENT_ID,
//     });
//     const { email_verified, email, name, picture } = verify.payload;
//     if (!email_verified) res.json({ message: 'Email Not Verified' });
//     const userExist = await user.findOne({ email }).select('-password');
//     if (userExist) {
//       res.cookie('userToken', tokenId, {
//         httpOnly: true,
//         maxAge: 24 * 60 * 60 * 1000,
//       });
//       res.status(200).json({ token: tokenId, user: userExist });
//     } else {
//       const password = email + process.env.CLIENT_ID;
//       const newUser = await user({
//         name: name,
//         avatar: picture,
//         password,
//         email,
//       });
//       await newUser.save();
//       res.cookie('userToken', tokenId, {
//         httpOnly: true,
//         maxAge: 24 * 60 * 60 * 1000,
//       });
//       res
//         .status(200)
//         .json({ message: 'User registered Successfully', token: tokenId });
//     }
//   } catch (error) {
//     res.status(500).json({ error: error });
//     console.log('error in googleAuth backend' + error);
//   }
// };

export const logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (token && req.rootUser) {
      // Révoquer le token côté utilisateur
      await req.rootUser.revokeToken(token);
    }

    res.status(200).json({
      success: true,
      message: 'Déconnexion réussie'
    });
  } catch (error) {
    console.error('Erreur lors de la déconnexion:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la déconnexion'
    });
  }
};

/**
 * Controller pour rafraîchir le token JWT
 */
export const refreshToken = async (req, res) => {
  try {
    // Le token est déjà extrait par le middleware Auth
    const token = req.token;
    const userId = req.rootUserId;

    if (!token || !userId) {
      return res.status(401).json({
        success: false,
        message: 'Token ou utilisateur manquant',
      });
    }

    // Vérifier si le token n'a pas été révoqué AVANT de continuer
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
      });
    }

    const isTokenRevoked = currentUser.tokens?.some(t => 
      t.token === token && t.revoked === true
    );

    if (isTokenRevoked) {
      return res.status(401).json({
        success: false,
        message: 'Token révoqué',
      });
    }

    // Générer un nouveau token
    const newToken = jwt.sign(
      { id: currentUser._id, email: currentUser.email },
      process.env.SECRET,
      { expiresIn: '24h' }
    );

    // Mise à jour atomique en une seule opération
    await user.findByIdAndUpdate(
      currentUser._id,
      {
        $push: {
          tokens: {
            token: newToken,
            device: req.headers['user-agent'] || 'Unknown',
            ip: req.ip || req.connection.remoteAddress,
            createdAt: new Date(),
            lastUsed: new Date(),
          }
        }
      }
    );

    // OPTIONNEL : Marquer l'ancien token comme révoqué en arrière-plan
    // Ne pas le faire immédiatement pour éviter les conflits
    setTimeout(async () => {
      try {
        await User.updateOne(
          { 
            _id: currentUser._id,
            'tokens.token': token,
            'tokens.revoked': { $ne: true }
          },
          {
            $set: {
              'tokens.$.revoked': true,
              'tokens.$.revokedAt': new Date(),
            }
          }
        );
      } catch (bgError) {
        console.error('Background token revocation failed:', bgError);
      }
    }, 100);

    // Mettre le nouveau token dans les cookies
    res.cookie('userToken', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: 'Token rafraîchi avec succès',
      token: newToken,
      user: {
        _id: currentUser._id,
        email: currentUser.email,
        name: currentUser.name,
        username: currentUser.username,
        isVerified: currentUser.isVerified,
        role: currentUser.role,
        avatar: currentUser.avatar,
      },
    });

  } catch (error) {
    console.error('Error refreshing token:', error);
    
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du rafraîchissement du token',
    });
  }
};

/**
 * Controller pour vérifier la validité d'une session
 */
export const checkSession = async (req, res) => {
  try {
    // Récupérer le token depuis les cookies ou headers
    const token = req.cookies?.userToken || 
                  req.headers?.authorization?.split(' ')[1];

    if (!token) {
      return res.status(200).json({
        success: true,
        isValid: false,
        message: 'Aucune session active',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        // Pour checkSession, on considère les tokens expirés comme invalides
        // mais on les renvoie pour permettre le rafraîchissement côté client
        return res.status(200).json({
          success: true,
          isValid: false,
          message: 'Token expiré',
          requiresRefresh: true,
          canRefresh: true,
        });
      }
      
      return res.status(200).json({
        success: true,
        isValid: false,
        message: 'Token invalide',
      });
    }

    const foundUser = await User.findById(decoded.id)
      .select('name email username isValid role avatar tokens');

    if (!foundUser) {
      return res.status(200).json({
        success: true,
        isValid: false,
        message: 'Utilisateur non trouvé',
      });
    }

    // Vérifier si le token existe dans la liste des tokens
    const userToken = foundUser.tokens?.find(t => t.token === token);
    
    if (!userToken) {
      return res.status(200).json({
        success: true,
        isValid: false,
        message: 'Session non trouvée',
      });
    }

    if (userToken.revoked) {
      return res.status(200).json({
        success: true,
        isValid: false,
        message: 'Session révoquée',
      });
    }

    // Vérifier l'état du compte
    if (!foundUser.isValid) {
      return res.status(200).json({
        success: true,
        isValid: false,
        message: 'Compte non vérifié',
        requiresVerification: true,
        user: {
          _id: foundUser._id,
          email: foundUser.email,
          name: foundUser.name,
          username: foundUser.username,
          isVerified: foundUser.isVerified,
          role: foundUser.role,
          avatar: foundUser.avatar,
        },
      });
    }

    // Calculer le temps d'expiration (24h)
    const tokenExpiry = decoded.exp ? new Date(decoded.exp * 1000) : null;
    const timeRemaining = tokenExpiry ? tokenExpiry.getTime() - Date.now() : null;
    
    // Définir quand rafraîchir automatiquement (1h avant expiration)
    const shouldRefresh = timeRemaining && timeRemaining < 60 * 60 * 1000; // < 1 heure
    const requiresRefresh = timeRemaining && timeRemaining < 30 * 60 * 1000; // Moins de 30 minutes

    // Mettre à jour lastUsed
    userToken.lastUsed = new Date();
    await foundUser.save();

    return res.status(200).json({
      success: true,
      isValid: true,
      requiresRefresh: requiresRefresh,
      message: 'Session valide',
      user: {
        _id: foundUser._id,
        email: foundUser.email,
        name: foundUser.name,
        username: foundUser.username,
        isVerified: foundUser.isVerified,
        role: foundUser.role,
        avatar: foundUser.avatar,
      },
      session: {
        expiresAt: tokenExpiry,
        timeRemaining: timeRemaining,
        expiresInHours: timeRemaining ? Math.ceil(timeRemaining / (60 * 60 * 1000)) : null,
        shouldRefresh: shouldRefresh,
        device: userToken.device,
        ip: userToken.ip,
        lastActivity: userToken.lastUsed,
      },
    });

  } catch (error) {
    console.error('Error checking session:', error);
    return res.status(200).json({
      success: false,
      isValid: false,
      message: 'Erreur serveur',
    });
  }
};

export const getActiveSessions = async (req, res) => {
  try {
    if (!req.rootUserId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié',
      });
    }

    const foundUser = await User.findById(req.rootUserId)
      .select('tokens username email name avatar');

    if (!foundUser) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
      });
    }

    const activeSessions = foundUser.tokens
      .filter(token => !token.revoked)
      .map((token, index) => ({
        id: index.toString(), // ID basé sur l'index pour faciliter la révocation
        token: token.token.substring(0, 20) + '...', // Ne pas renvoyer le token complet
        device: token.device || 'Unknown',
        ip: token.ip || 'Unknown',
        createdAt: token.createdAt,
        lastUsed: token.lastUsed || token.createdAt,
        isCurrent: token.token === req.token,
        isExpired: token.lastUsed && 
          (Date.now() - new Date(token.lastUsed).getTime()) > 24 * 60 * 60 * 1000, // > 24h
      }));

    // Trier par lastUsed décroissant
    activeSessions.sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed));

    res.status(200).json({
      success: true,
      sessions: activeSessions,
      total: activeSessions.length,
      user: {
        username: foundUser.username,
        email: foundUser.email,
        // name: foundUser.name,
        avatar: foundUser.avatar,
      },
    });

  } catch (error) {
    console.error('Error getting active sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
};

/**
 * Controller pour révoquer une session spécifique
 * @route DELETE /api/auth/sessions/:sessionId
 * @access Private
 */
export const revokeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!req.rootUserId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié',
      });
    }

    // Trouver l'utilisateur
    const foundUser = await User.findById(req.rootUserId);
    
    if (!foundUser) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
      });
    }

    // Convertir sessionId en nombre (index)
    const sessionIndex = parseInt(sessionId, 10);
    if (isNaN(sessionIndex) || sessionIndex < 0 || sessionIndex >= foundUser.tokens.length) {
      return res.status(400).json({
        success: false,
        message: 'ID de session invalide',
      });
    }

    const tokenToRevoke = foundUser.tokens[sessionIndex];

    // Vérifier si le token existe déjà révoqué
    if (tokenToRevoke.revoked) {
      return res.status(400).json({
        success: false,
        message: 'Session déjà révoquée',
      });
    }

    // Ne pas permettre de révoquer la session actuelle
    if (tokenToRevoke.token === req.token) {
      return res.status(400).json({
        success: false,
        message: 'Impossible de révoquer la session actuelle',
        suggestion: 'Utilisez plutôt la fonctionnalité "Se déconnecter de tous les appareils"',
      });
    }

    // Marquer le token comme révoqué
    tokenToRevoke.revoked = true;
    tokenToRevoke.revokedAt = new Date();
    
    await foundUser.save();

    res.status(200).json({
      success: true,
      message: 'Session révoquée avec succès',
      revokedSession: {
        device: tokenToRevoke.device,
        ip: tokenToRevoke.ip,
        revokedAt: tokenToRevoke.revokedAt,
      },
    });

  } catch (error) {
    console.error('Error revoking session:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'ID de session invalide',
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
};

/**
 * Controller pour révoquer toutes les sessions sauf la session actuelle
 * @route DELETE /api/auth/sessions
 * @access Private
 */
export const revokeAllOtherSessions = async (req, res) => {
  try {
    if (!req.rootUserId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié',
      });
    }

    const foundUser = await User.findById(req.rootUserId);
    
    if (!foundUser) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
      });
    }

    let revokedCount = 0;
    const currentTime = new Date();

    // Révoquer tous les tokens sauf le token actuel
    foundUser.tokens = foundUser.tokens.map(token => {
      if (token.token === req.token || token.revoked) {
        return token; // Garder le token actuel ou déjà révoqué
      }
      
      revokedCount++;
      return {
        ...token,
        revoked: true,
        revokedAt: currentTime,
      };
    });

    await foundUser.save();

    res.status(200).json({
      success: true,
      message: revokedCount > 0 
        ? `${revokedCount} session(s) ont été révoquées` 
        : 'Aucune session à révoquer',
      revokedCount,
      currentSession: {
        device: foundUser.tokens.find(t => t.token === req.token)?.device,
        ip: foundUser.tokens.find(t => t.token === req.token)?.ip,
      },
    });

  } catch (error) {
    console.error('Error revoking all other sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
};

/**
 * Controller pour obtenir des informations sur la session actuelle
 * @route GET /api/auth/session/current
 * @access Private
 */
export const getCurrentSession = async (req, res) => {
  try {
    if (!req.rootUserId || !req.token) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié',
      });
    }

    const foundUser = await User.findById(req.rootUserId);
    
    if (!foundUser) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
      });
    }

    const currentToken = foundUser.tokens.find(t => t.token === req.token);
    
    if (!currentToken) {
      return res.status(404).json({
        success: false,
        message: 'Session actuelle non trouvée',
      });
    }

    let tokenExpiry;
    try {
      const decoded = jwt.decode(req.token);
      tokenExpiry = decoded?.exp ? new Date(decoded.exp * 1000) : null;
    } catch (error) {
      tokenExpiry = null;
    }

    res.status(200).json({
      success: true,
      session: {
        device: currentToken.device,
        ip: currentToken.ip,
        createdAt: currentToken.createdAt,
        lastUsed: currentToken.lastUsed,
        isExpired: tokenExpiry && tokenExpiry < new Date(),
        expiresAt: tokenExpiry,
        isCurrentDevice: true,
      },
      user: {
        _id: foundUser._id,
        // name: foundUser.name,
        email: foundUser.email,
        username: foundUser.username,
        avatar: foundUser.avatar,
      },
    });

  } catch (error) {
    console.error('Error getting current session:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
};

export const searchUsers = async (req, res) => {
  // const { search } = req.query;
  const search = req.query.search
    ? {
      $or: [
        { name: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
      ],
    }
    : {};

  const users = await User.find(search).find({ _id: { $ne: req.rootUserId } });
  res.status(200).send(users);
};
export const getUserById = async (req, res) => {
  const { id } = req.params;
  try {
    // const selectedUser = await user.findById(id);
    const selectedUser = await User.findOne({ _id: id }).select('-password');
    res.status(200).json(selectedUser);
  } catch (error) {
    res.status(500).json({ error: error });
  }
};

export const updateInfo = async (req, res) => {
  const { id } = req.params;
  const { bio, username } = req.body;
  const updatedUser = await User.findByIdAndUpdate(id, { username, bio });
  return updatedUser;
};

export const getUser = async (req, res) => {
  try {
    const item = await User.find();
    res.send(item); // Envoyer l'élément trouvé
  } catch (err) {
    res.status(500).send('Erreur lors de la récupération');
  }
}

// export const updateUserRole = async (req, res) => {
//   const { id } = req.params;
//   const { role } = req.body;

//   try {
//     const updatedUser = await User.findByIdAndUpdate(
//       id,
//       { role },
//       { new: true } // Return the updated document
//     );

//     if (!updatedUser) {
//       return res.status(404).json({ message: 'User not found' });
//     }

//     res.status(200).json(updatedUser);
//   } catch (error) {
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// }

export const createUser = async (req, res) => {
  const {
    firstname,
    lastname,
    username,
    email,
    password,
    phoneNumber,
    profession,
    role

  } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const fullname = firstname + ' ' + lastname;
    const users = new User({
      name: fullname,
      username,
      email,
      password: hashedPassword,
      role,
      phoneNumber,
      profession,
    });
    await users.save();
    res.status(201).json({ message: 'User created successfully', users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export const sendUserId = async (req, res) => {
  try {
    const userId = req.params.id;
    // const filePath = req.file.filename;

    // const usa = await user.findById(userId);
    // if (!usa) {
    //   return res.status(404).json({ message: 'User not found' });
    // }
    const result = await cloudinary.uploader.upload(req.file.path);

    // Update user avatar URL in the database
    const data = await User.findByIdAndUpdate(
      userId,
      { file: result.secure_url },
      { new: true }
    );

    if (!data) {
      return res.status(404).json({ message: 'User not found' });
    }
    // await data.save();

    res.status(200).json({
      message: 'Fichier ajouter avec success',
      data,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating',
      error: error.message,
    });
  }
};

export const updateUserAvatar = async (req, res) => {
  try {
    const { id } = req.params;

    // Upload image to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path);

    // Update user avatar URL in the database
    const data = await User.findByIdAndUpdate(
      id,
      { avatar: result.secure_url },
      { new: true }
    );

    if (!data) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export const validUserAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const { isValid } = req.body;

    // Find the user by ID and update the `isValid` field
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { isValid, isRejet: false }, // Update the `isValid` field
      { new: true } // Return the updated document
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).send({ message: "Compte valider avec succes", updatedUser });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
}

export const rejetUserAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const { isRejet } = req.body;

    // Find the user by ID and update the `isValid` field
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { isRejet, file: null, isValid: false }, // Update the `isValid` field
      { new: true } // Return the updated document
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).send({ message: "Compte rejeter avec succes", updatedUser });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
}

export const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    // Find the post by ID and delete it
    const deletedUser = await User.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({ message: 'News not found' });
    }

    res.status(200).json({ message: 'Utilisateur supprimer avec succès', deletedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong' });
  }
}

export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const users = await User.findOne({ email });
    if (!users) return res.status(404).json({ message: 'User not found' });

    const resetToken = crypto.randomBytes(20).toString('hex');
    users.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    users.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    await users.save();

    // const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
    const resetUrl = `${process.env.BASE_URL}/reset-password/${resetToken}`;
    const message = `
    <!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Réinitialisation de mot de passe</title>
    <style>
         body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            padding-bottom: 20px;
            border-bottom: 1px solid #ddd;
        }
        .header h1 {
            color: #333;
            font-size: 24px;
        }
        .content {
            padding: 20px 0;
        }
        .content p {
            color: #555;
            font-size: 16px;
            line-height: 1.6;
        }
        .button {
            display: inline-block;
            margin: 20px 0;
            padding: 10px 20px;
            background-color: #007bff;
            color: #ffffff;
            text-decoration: none;
            border-radius: 5px;
            font-size: 16px;
        }
        .footer {
            text-align: center;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            color: #777;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>Réinitialisation de mot de passe</h1>
        </div>
        <div class="content">
            <p>Vous recevez cet e-mail car vous avez demandé une réinitialisation de votre mot de passe. Veuillez cliquer sur le bouton ci-dessous pour réinitialiser votre mot de passe :</p>
            <a href="${resetUrl}" class="button">Réinitialiser mon mot de passe</a>
            <p>Si vous n'avez pas demandé cette réinitialisation, veuillez ignorer cet e-mail.</p>
        </div>
        <div class="footer">
            <p>&copy; 2025 DiasporaTogo. Tous droits réservés.</p>
        </div>
    </div>
</body>
</html>
    `;

    await sendEmail({
      email: users.email,
      subject: 'Demande de réinitialisation du mot de passe',
      html: message,
    });

    res.status(200).json({ message: 'Demande Envoyer par mail' });
  } catch (error) {
    console.log('err', error)
    res.status(500).json({ message: 'Erreur lors de l\'envoi de l\'e-mail', error });
  }
};

export const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  try {
    const users = await User.findOne({
      resetPasswordToken: crypto.createHash('sha256').update(token).digest('hex'),
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!users) return res.status(400).json({ message: 'Jeton non valide ou expiré' });

    users.password = password;
    users.resetPasswordToken = undefined;
    users.resetPasswordExpire = undefined;
    await users.save();

    res.status(200).json({ message: 'Réinitialisation du mot de passe réussie' });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la réinitialisation du mot de passe', error });
  }
};



// export const register = async (req, res) => {
//   const {
//     firstname,
//     lastname,
//     username,
//     email,
//     password,
//     phoneNumber,
//     profession,
//     country,
//     town,
//     typeUser
//   } = req.body;

//   try {
//     let existingUser = await User.findOne({ email });

//     if (existingUser && existingUser.isValid) {
//       return res.status(400).json({ message: "L'utilisateur existe déjà" });
//     }

//     if (!existingUser) {
//       existingUser = new User({
//         email,
//         name: `${firstname} ${lastname}`,
//         phoneNumber,
//         profession,
//         username,
//         password,
//         country,
//         town,
//         typeUser,
//       });
//     } else {
//       existingUser.password = password;
//       existingUser.otp = undefined;
//       existingUser.otpExpires = undefined;
//       existingUser.paymentVerified = false;
//     }

//     await existingUser.save();


//     const paymentIntent = await createStripePaymentIntent(email, `${firstname} ${lastname}`);

//     res.status(200).json({
//       message: "Veuillez compléter le paiement de vérification",
//       clientSecret: paymentIntent.clientSecret,
//       customerId: paymentIntent.customerId,
//       paymentIntentId: paymentIntent.paymentIntentId
//     });

//   } catch (error) {
//     console.log('Error in register ' + error);
//     res.status(500).send(error);
//   }
// };

async function createStripePaymentIntent(email, name) {
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { temp_user_email: email }
  });

  const paymentIntent = await stripe.paymentIntents.create({
    amount: 100,
    currency: 'eur',
    customer: customer.id,
    automatic_payment_methods: { enabled: true },
    metadata: { customer_email: email, purpose: 'account_verification' }
  });

  return {
    clientSecret: paymentIntent.client_secret,
    customerId: customer.id,
    paymentIntentId: paymentIntent.id
  };
}


// export const createPaymentIntent = async (req, res) => {
//   const { email, name } = req.body;

//   try {
//     const customer = await stripe.customers.create({
//       email: email,
//       name: name,
//       metadata: { temp_user_email: email }
//     });

//     const paymentIntent = await stripe.paymentIntents.create({
//       amount: 100,
//       currency: 'eur',
//       customer: customer.id,
//       automatic_payment_methods: {
//         enabled: true,
//       },
//       metadata: {
//         customer_email: email,
//         purpose: 'account_verification'
//       }
//     });

//     res.status(200).json({
//       clientSecret: paymentIntent.client_secret,
//       customerId: customer.id,
//       paymentIntentId: paymentIntent.id
//     });

//   } catch (error) {
//     console.error('Erreur création payment intent:', error);
//     res.status(500).json({
//       error: 'Erreur lors de la création du paiement',
//       details: error.message
//     });
//   }
// };


export const verifyCode = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // 1. Validation des entrées
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email et code OTP sont requis",
        code: "MISSING_FIELDS"
      });
    }

    // Validation du format OTP (6 chiffres)
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Le code OTP doit contenir exactement 6 chiffres",
        code: "INVALID_OTP_FORMAT"
      });
    }

    // 2. Recherche de l'utilisateur avec les champs de vérification
    const user = await User.findOne({ email })
      .select('+verificationCode +verificationCodeExpires +verificationAttempts +lockUntil +password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Aucun compte trouvé avec cet email",
        code: "USER_NOT_FOUND",
        suggestion: "Vérifiez l'email ou inscrivez-vous d'abord"
      });
    }

    // 3. Vérifier si le compte est déjà vérifié
    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Le compte est déjà vérifié",
        code: "ALREADY_VERIFIED",
        redirectTo: "/auth/login"
      });
    }

    // 4. Vérifier le verrouillage du compte
    if (user.lockUntil && user.lockUntil > new Date()) {
      const timeLeft = Math.ceil((user.lockUntil - new Date()) / (1000 * 60));
      return res.status(429).json({
        success: false,
        message: "Trop de tentatives échouées. Compte temporairement verrouillé",
        code: "ACCOUNT_LOCKED",
        lockDuration: `${timeLeft} minutes`,
        unlockTime: user.lockUntil,
        redirectTo: "/auth/login" // Indiquer de se connecter après déverrouillage
      });
    }

    // 5. Vérifier s'il y a un code actif
    if (!user.verificationCode) {
      return res.status(400).json({
        success: false,
        message: "Aucun code OTP actif",
        code: "NO_ACTIVE_OTP",
        suggestion: "Demandez un nouveau code OTP",
        redirectTo: "/auth/resend-otp"
      });
    }

    // 6. Vérifier l'expiration du code
    if (new Date() > user.verificationCodeExpires) {
      // Supprimer le code expiré
      user.verificationCode = undefined;
      user.verificationCodeExpires = undefined;
      await user.save();
      
      return res.status(400).json({
        success: false,
        message: "Le code OTP a expiré",
        code: "OTP_EXPIRED",
        suggestion: "Demandez un nouveau code",
        redirectTo: "/auth/resend-otp"
      });
    }

    // 7. Vérifier si le code correspond
    if (user.verificationCode !== otp) {
      // Utiliser votre méthode d'instance existante
      await user.incrementVerificationAttempts();
      
      // Vérifier si le compte doit être verrouillé
      if (user.verificationAttempts >= 3) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        await user.save();
        
        return res.status(429).json({
          success: false,
          message: "Code OTP incorrect. Compte verrouillé pour 15 minutes",
          code: "ACCOUNT_LOCKED",
          attemptsLeft: 0,
          isLocked: true,
          lockDuration: "15 minutes",
          redirectTo: "/auth/login" // Après déverrouillage
        });
      }
      
      const attemptsLeft = 3 - user.verificationAttempts;
      
      return res.status(400).json({
        success: false,
        message: "Code OTP incorrect",
        code: "INVALID_OTP",
        attemptsLeft,
        isLocked: false,
        // Pas de redirection ici - l'utilisateur peut réessayer
      });
    }

    // 8. Vérifier le statut de paiement pour les entreprises
    if (user.userType === 'Entreprise' && user.paymentStatus !== 'completed') {
      return res.status(400).json({
        success: false,
        message: "Paiement non complété. Veuillez finaliser le paiement avant la vérification.",
        code: "PAYMENT_REQUIRED",
        userType: user.userType,
        paymentStatus: user.paymentStatus,
        redirectTo: "/auth/payment" // Rediriger vers la page de paiement
      });
    }

    // 9. Code OTP valide - Utiliser votre méthode d'instance
    const verificationResult = user.verifyCode(otp);
    
    if (!verificationResult.valid) {
      return res.status(400).json({
        success: false,
        message: verificationResult.message,
        code: "VERIFICATION_FAILED"
      });
    }

    // Ajouter la date de vérification
    user.verifiedAt = new Date();
    
    // Nettoyer les champs de vérification
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    user.verificationAttempts = 0;
    user.lockUntil = undefined;
    
    await user.save();

    // 10. Envoyer l'email de bienvenue
    try {
      await sendWelcomeEmail(user.email, `${user.firstName} ${user.lastName}`);
    } catch (emailError) {
      console.warn("Email de bienvenue non envoyé:", emailError.message);
      // Ne pas bloquer la réponse en cas d'erreur d'email
    }

    // 11. Envoyer un email de confirmation de vérification
    try {
      await sendVerificationConfirmationEmail(
        user.email, 
        `${user.firstName} ${user.lastName}`,
        user.userType
      );
    } catch (emailError) {
      console.warn("Email de confirmation non envoyé:", emailError.message);
    }

    // 12. Journalisation
    console.log(`✅ Compte vérifié: ${user.email} (${user.userType}) - ${new Date().toISOString()}`);

    // 13. Réponse de succès SANS TOKEN
    res.status(200).json({
      success: true,
      message: "Compte vérifié avec succès ! Vous pouvez maintenant vous connecter.",
      code: "VERIFICATION_SUCCESS",
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          email: user.email,
          userType: user.userType,
          isVerified: user.isVerified,
          isActive: user.isActive,
          paymentStatus: user.paymentStatus,
          verifiedAt: user.verifiedAt
        },
        // Indications pour le frontend
        nextSteps: {
          message: "Redirection vers la page de connexion",
          redirectTo: "/auth/login",
          autoRedirect: true,
          redirectDelay: 2000 // 2 secondes
        },
        // Ajouter un message clair pour l'utilisateur
        userMessage: `Bonjour ${user.firstName}, votre compte a été activé avec succès. Vous pouvez maintenant vous connecter avec votre adresse email et votre mot de passe.`
      }
    });

  } catch (error) {
    console.error("❌ Erreur lors de la vérification OTP:", error);
    
    res.status(500).json({
      success: false,
      message: "Erreur interne du serveur",
      code: "SERVER_ERROR",
      errorId: `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...(process.env.NODE_ENV === 'development' && { 
        detail: error.message,
        stack: error.stack 
      })
    });
  }
};

// Fonction helper pour l'email de confirmation (optionnel)
const sendVerificationConfirmationEmail = async (email, fullName, userType) => {
  // Implémentez cette fonction selon votre service d'email
  console.log(`📧 Email de confirmation envoyé à ${email} (${userType})`);
};

// export const resendOTP = async (req, res) => {
// 	const { email } = req.body;
	
// 	try {
// 	  const usa = await User.findOne({ email });
// 	  // console.log("usz",user)
// 	  if (!usa) {
// 		return res.status(404).json({ message: "L'utilisateur n'existe pas" });
// 	  }
  
// 	  const otp = Math.floor(100000 + Math.random() * 900000).toString();
// 	  const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
	  
// 	  usa.otp = otp;
// 	  usa.otpExpires = otpExpires;
	  
// 	  await usa.save();
// 	   await transporter.sendMail({
//       from: "diasporatogocontact@gmail.com",
//       to: email,
//       subject: "Vérifiez votre compte",
//       text: `Votre code est ${otp}. Il expire dans 10 minutes.`,
//     });

// 	  res.status(200).json({ 
// 		message: 'Un nouveau code de vérification a été envoyé à votre email.' 
// 	  });
// 	} catch (error) {
// 	  console.error('Error resending OTP:', error);
// 	  res.status(500).json({ 
// 		error: error.message || 'Erreur interne du serveur' 
// 	  });
// 	}
//   }

// export const verifyPayment = async (req, res) => {
//   const { paymentIntentId, email, customerId } = req.body;

//   try {
//     // VÉRIFIER LE VRAI STATUT STRIPE
//     const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

//     if (paymentIntent.status === 'succeeded') {
//       let userData = await user.findOne({ email });

//       if (userData) {
//         userData.stripeCustomerId = customerId;
//         userData.paymentVerified = true;
//         userData.paymentIntentId = paymentIntentId;
//         await userData.save();

//         const otp = otpGenerator.generate(5, { 
//           digits: true, 
//           alphabets: false, 
//           specialChars: false 
//         });
//         const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

//         userData.otp = otp;
//         userData.otpExpires = otpExpires;
//         await userData.save();

//         await transporter.sendMail({
//           from: "support@diasporatogo.com",
//           to: email,
//           subject: "Vérifiez votre compte - Code OTP",
//           text: `Votre code de vérification est ${otp}. Il expire dans 10 minutes.`,
//         });

//         return res.status(200).json({
//           success: true,
//           message: "Paiement vérifié et OTP envoyé",
//           paymentStatus: 'succeeded'
//         });
//       } else {
//         return res.status(404).json({
//           success: false,
//           message: "Utilisateur non trouvé"
//         });
//       }
//     } else {
//       return res.status(400).json({
//         success: false,
//         message: "Paiement non réussi",
//         paymentStatus: paymentIntent.status
//       });
//     }

//   } catch (error) {
//     console.error('Error verifying payment:', error);
//     res.status(500).json({ 
//       error: 'Erreur lors de la vérification du paiement',
//       details: error.message 
//     });
//   }
// };


export const register = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      username,
      email,
      password,
      phoneNumber,
      profession,
      country,
      city,
      userType,
      acceptTerms,
      marketingOptIn
    } = req.body;

    // Valider que username n'est pas null
    if (!username || username.trim() === '') {
      // Générer un username basé sur l'email
      const generatedUsername = email.split('@')[0] + Math.floor(Math.random() * 1000);
      req.body.username = generatedUsername;
    }

    // 1. Vérifier si l'email existe déjà
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'Un compte avec cet email existe déjà'
      });
    }

    // 2. Vérifier si le userName existe déjà
    const existingUserName = await User.findOne({ 
      username: req.body.username 
    });
    if (existingUserName) {
      return res.status(400).json({
        success: false,
        message: 'Ce nom d\'utilisateur est déjà pris'
      });
    }

    // 2. Déterminer le statut selon le type d'utilisateur
    const isParticulier = userType === 'Particulier';
    
    // 3. Créer l'utilisateur avec les bons paramètres initiaux
    const userData = {
      firstName,
      lastName,
      username,
      email,
      password,
      phoneNumber,
      profession,
      country,
      city,
      userType,
      acceptTerms,
      marketingOptIn,
      isActive: isParticulier, // Actif immédiatement pour Particulier
      isVerified: isParticulier, // Vérifié immédiatement pour Particulier
      paymentStatus: isParticulier ? 'completed' : 'pending'
    };

    const user = await User.create(userData);

    // 4. LOGIQUE PAR TYPE D'UTILISATEUR
    if (isParticulier) {
      // 🔹 CAS PARTICULIER (GRATUIT)
      
      // Générer un token JWT
      const token = user.generateAuthToken();
      
      // Envoyer email de bienvenue (à implémenter)
      // await sendWelcomeEmail(user.email, `${user.firstName} ${user.lastName}`);

      return res.status(201).json({
        success: true,
        message: 'Inscription réussie. Compte activé.',
        data: {
          userId: user._id.toString(),
          email: user.email,
          token: token,
          requiresPayment: false,
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
            email: user.email,
            userType: user.userType,
            isVerified: user.isVerified,
            isActive: user.isActive
          }
        }
      });

    } else {
      // 🔹 CAS ENTREPRISE (PAYANT)
      
      // 4.1 Créer un customer Stripe
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        phone: user.phoneNumber,
        metadata: {
          userId: user._id.toString(),
          userType: user.userType,
          source: 'registration'
        }
      });

      // 4.2 Créer un Payment Intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 500, // 5€ en centimes
        currency: 'eur',
        customer: customer.id,
        metadata: {
          userId: user._id.toString(),
          email: user.email,
          userType: user.userType,
          purpose: 'account_verification'
        },
        description: `Vérification compte ${userType} - ${username}`,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      // 4.3 Mettre à jour l'utilisateur avec les infos Stripe
      user.stripeCustomerId = customer.id;
      user.paymentIntentId = paymentIntent.id;
      await user.save();

      // 4.4 Réponse avec toutes les données nécessaires
      return res.status(201).json({
        success: true,
        message: 'Inscription réussie. Procédez au paiement.',
        data: {
          userId: user._id.toString(),
          email: user.email,
          stripeCustomerId: customer.id,
          paymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret, // IMPORTANT !
          requiresPayment: true,
          amount: 5, // €
          currency: 'eur'
        }
      });
    }

  } catch (error) {
    console.error('Erreur lors de l\'inscription:', error);
    
    // Gestion d'erreurs spécifiques Stripe
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        success: false,
        message: 'Erreur de configuration du paiement',
        code: 'STRIPE_ERROR',
        detail: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'inscription',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      code: 'SERVER_ERROR'
    });
  }
};

// Étape 2: Créer l'intention de paiement
// export const createPaymentIntent = async (req, res) => {
//   try {
//     const { userId, email } = req.body;

//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: 'Utilisateur non trouvé'
//       });
//     }

//     if (user.isVerified) {
//       return res.status(400).json({
//         success: false,
//         message: 'Utilisateur déjà vérifié'
//       });
//     }

//     // Créer un Payment Intent
//     const paymentIntent = await stripe.paymentIntents.create({
//       amount: 500, // 5€ en centimes
//       currency: 'eur',
//       customer: user.stripeCustomerId,
//       metadata: {
//         userId: user._id.toString(),
//         email: user.email,
//         purpose: 'account_verification'
//       },
//       description: 'Vérification de compte - Paiement unique',
//       automatic_payment_methods: {
//         enabled: true,
//       },
//     });

//     user.paymentIntentId = paymentIntent.id;
//     await user.save();

//     res.status(200).json({
//       success: true,
//       clientSecret: paymentIntent.client_secret,
//       paymentIntentId: paymentIntent.id,
//       amount: paymentIntent.amount,
//       currency: paymentIntent.currency
//     });

//   } catch (error) {
//     console.error('Erreur création Payment Intent:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Erreur lors de la création du paiement'
//     });
//   }
// };

// Étape 3: Vérifier le paiement et envoyer l'OTP
export const verifyPayment = async (req, res) => {
  try {
    const { paymentIntentId, email } = req.body;

    // 1. D'abord, récupérer le Payment Intent
    let paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    console.log(`État initial: ${paymentIntent.status}`);
    
    // 2. Définir une URL de retour valide
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const returnUrl = `${frontendUrl}/payment-complete`;
    
    // S'assurer que l'URL a un schéma valide
    if (!returnUrl.startsWith('http://') && !returnUrl.startsWith('https://')) {
      throw new Error(`URL de retour invalide: ${returnUrl}. Doit commencer par http:// ou https://`);
    }

    // 3. Si le Payment Intent nécessite une action
    if (paymentIntent.status === 'requires_action' || 
        paymentIntent.status === 'requires_confirmation') {
      
      // Pour les tests, utiliser une carte sans 3D Secure
      paymentIntent = await stripe.paymentIntents.confirm(
        paymentIntentId,
        {
          payment_method: 'pm_card_visa',
          return_url: returnUrl
        }
      );
      
      console.log(`État après confirmation: ${paymentIntent.status}`);
      
      if (paymentIntent.status === 'requires_action') {
        // Si c'est pour 3D Secure, retourner les infos pour redirection
        return res.status(200).json({
          success: false,
          message: 'Authentification 3D Secure requise',
          requires3DSecure: true,
          redirectUrl: paymentIntent.next_action?.redirect_to_url?.url,
          paymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret
        });
      }
    }
    
    // 4. Si le Payment Intent n'est pas encore confirmé
    if (paymentIntent.status === 'requires_payment_method') {
      paymentIntent = await stripe.paymentIntents.confirm(
        paymentIntentId,
        { 
          payment_method: 'pm_card_visa',
          return_url: returnUrl
        }
      );
    }

    // 5. Vérifier le statut final
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: `Paiement en statut: ${paymentIntent.status}`,
        status: paymentIntent.status,
        paymentIntentId: paymentIntent.id
      });
    }

    // 6. Trouver l'utilisateur
    const user = await User.findOne({ 
      email: email.toLowerCase().trim(),
      paymentIntentId 
    });

    if (!user) {
      // Chercher par email seulement pour déboguer
      const anyUser = await User.findOne({ email: email.toLowerCase().trim() });
      if (anyUser) {
        console.log(`Utilisateur trouvé mais paymentIntentId différent. 
          User: ${anyUser.paymentIntentId}, 
          Request: ${paymentIntentId}`);
      }
      
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé avec ces identifiants'
      });
    }

    // 7. Vérifier si déjà vérifié
    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Compte déjà vérifié',
        userStatus: {
          isVerified: user.isVerified,
          paymentStatus: user.paymentStatus
        }
      });
    }

    // 8. Mettre à jour et générer OTP
    user.paymentStatus = 'completed';
    user.paymentDate = new Date();
    user.amountPaid = paymentIntent.amount / 100;

    const verificationCode = user.generateVerificationCode();
    await user.save();

    await sendVerificationEmail(
      user.email, 
      verificationCode, 
      `${user.firstName} ${user.lastName}`
    );

    console.log(`✅ Paiement vérifié et OTP envoyé à: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Paiement vérifié. Code OTP envoyé par email.',
      data: {
        email: user.email,
        userType: user.userType,
        codeExpiresIn: '10 minutes',
        debugCode: process.env.NODE_ENV === 'development' ? verificationCode : undefined,
        paymentDetails: {
          amount: user.amountPaid,
          date: user.paymentDate,
          stripePaymentId: paymentIntentId
        }
      }
    });

  } catch (error) {
    console.error('❌ Erreur vérification paiement:', error.message);
    
    let message = 'Erreur lors de la vérification du paiement';
    let statusCode = 500;
    
    if (error.type === 'StripeInvalidRequestError') {
      statusCode = 400;
      
      if (error.message.includes('Invalid URL')) {
        message = 'Configuration incorrecte: URL de retour invalide';
        message += '\nVérifiez que FRONTEND_URL est défini dans .env (ex: http://localhost:3000)';
      } else if (error.code === 'payment_intent_unexpected_state') {
        message = `Le Payment Intent ne peut pas être confirmé dans cet état`;
      }
    }
    
    res.status(statusCode).json({
      success: false,
      message,
      errorType: error.type,
      errorCode: error.code,
      ...(process.env.NODE_ENV === 'development' && { 
        detail: error.message,
        suggestion: 'Définissez FRONTEND_URL=http://localhost:3000 dans votre .env'
      })
    });
  }
};


// Renvoyer l'OTP
export const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Compte déjà vérifié'
      });
    }

    if (user.paymentStatus !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Paiement non complété'
      });
    }

    // Générer un nouveau code
    const verificationCode = user.generateVerificationCode();
    await user.save();

    // Envoyer le nouvel email
    await sendVerificationEmail(user.email, verificationCode, user.name);

    res.status(200).json({
      success: true,
      message: 'Nouveau code OTP envoyé',
      data: {
        email: user.email,
        codeExpiresIn: '10 minutes',
        debugCode: process.env.NODE_ENV === 'development' ? verificationCode : undefined
      }
    });

  } catch (error) {
    console.error('Erreur renvoi OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du renvoi du code'
    });
  }
};