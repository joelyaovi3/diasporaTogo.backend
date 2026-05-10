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
import stripeService from '../utils/stripe.js';
// import Stripe from 'stripe';

const ALLOWED_ROLES = ['Users', 'Support', 'admin', 'Moderator', 'Supervisor'];

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', 
  port: 465, 
  secure: true, 
  auth: {
    user: 'diasporatogocontact@gmail.com',
    pass: 'xmsaeefvcfozrqzo',
  },
});

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
      if (!user.userName || user.userName.trim() === '') {
        const baseUserName = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        let finalUserName = `${baseUserName || 'user'}${Math.floor(Math.random() * 1000)}`;
        
        let isUnique = false;
        let attempts = 0;
        
        while (!isUnique && attempts < 10) {
          const existingUser = await User.findOne({ 
            userName: finalUserName,
            _id: { $ne: user._id }
          });
          
          if (!existingUser) {
            isUnique = true;
          } else {
            finalUserName = `${baseUserName || 'user'}${Math.floor(Math.random() * 9000 + 1000)}`;
            attempts++;
          }
        }
        
        // Mise à jour sans déclencher la validation complète
        await User.findByIdAndUpdate(
          user._id,
          { $set: { userName: finalUserName } },
          { runValidators: false }
        );
        
        user.userName = finalUserName; // Mettre à jour l'objet en mémoire aussi
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
          userName: user.userName,
          companyName: user.companyName,
          businessDomain: user.businessDomain,
          website: user.website,
          phoneNumber: user.phoneNumber,
          profession: user.profession,
          country: user.country,
          city: user.city,
          bio: user.bio,
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


// export const updateUserRole = async (req, res) => {
//   const { userId, newRole } = req.body;
  
//   try {
//     const user = await User.findById(userId);
    
//     if (!user) {
//       return res.status(404).json({ message: "Utilisateur non trouvé" });
//     }
    
//     // Vérifier si le nouveau rôle est valide
//     const validRoles = ['User', 'Individual', 'Company', 'Freelancer', 'Support', 'Admin', 'Moderator', 'Supervisor'];
//     if (!validRoles.includes(newRole)) {
//       return res.status(400).json({ 
//         message: "Rôle invalide",
//         validRoles 
//       });
//     }
    
//     // Mettre à jour le rôle
//     user.role = newRole;
//     await user.save();
    
//     res.status(200).json({
//       message: "Rôle mis à jour avec succès",
//       user: {
//         id: user._id,
//         name: user.name,
//         email: user.email,
//         role: user.role,
//         typeUser: user.typeUser
//       }
//     });
    
//   } catch (error) {
//     console.error('Erreur lors de la mise à jour du rôle:', error);
//     res.status(500).json({ 
//       message: "Erreur lors de la mise à jour du rôle" 
//     });
//   }
// };


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
  try {
    const { q, search } = req.query;
    const searchTerm = q || search;
    
    if (!searchTerm || searchTerm.trim() === '') {
      return res.status(200).json({
        success: true,
        users: [],
        message: 'Veuillez entrer un terme de recherche'
      });
    }

    const searchQuery = {
      $or: [
        { firstName: { $regex: searchTerm, $options: 'i' } },
        { lastName: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
        { username: { $regex: searchTerm, $options: 'i' } }
      ]
    };

    const users = await User.find(searchQuery)
      .find({ _id: { $ne: req.user._id } }) // Exclure l'utilisateur courant
      .select('firstName lastName username userName userType companyName email avatar isOnline lastSeen')
      .limit(10);

    res.status(200).json({
      success: true,
      users,
      count: users.length
    });
  } catch (error) {
    console.error('Erreur recherche utilisateurs:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la recherche'
    });
  }
};

export const getRecentUsers = async (req, res) => {
  try {
    // Récupérer les derniers utilisateurs actifs
    const recentUsers = await User.find({
      _id: { $ne: req.user._id },
      isActive: true,
      lastLogin: { $exists: true }
    })
      .sort({ lastLogin: -1 })
      .select('firstName lastName username userName userType companyName email avatar isOnline lastSeen')
      .limit(6);

    res.status(200).json({
      success: true,
      users: recentUsers
    });
  } catch (error) {
    console.error('Erreur récupération utilisateurs récents:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération'
    });
  }
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

export const getProfile = async (req, res) => {
  try {
    const profile = await User.findById(req.rootUserId).select('-password -verificationCode -verificationCodeExpires -revokedTokens');
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }
    return res.status(200).json({ success: true, data: profile });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

// export const updateInfo = async (req, res) => {
//   const { id } = req.params;
//   const { bio, username } = req.body;
//   const updatedUser = await User.findByIdAndUpdate(id, { username, bio });
//   return updatedUser;
// };

export const updateInfo = async (req, res) => {
  try {
    const { id } = req.params;
 
    // ── 1. Sécurité : un utilisateur ne peut modifier que son propre profil ──
    //    (sauf admin — adaptez selon votre logique)
    if (req.user._id.toString() !== id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Vous ne pouvez modifier que votre propre profil.',
      });
    }
 
    // ── 2. Champs autorisés — email et role JAMAIS modifiables ici ──────────
    const ALLOWED_FIELDS = [
      'firstName', 'lastName', 'userName',
      'companyName', 'businessDomain', 'website',
      'phoneNumber', 'country', 'city', 'bio',
    ];
 
    // Construire l'objet update en filtrant uniquement les champs autorisés
    const updates = {};
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }
 
    // ── 3. Vérification qu'il y a au moins un champ à modifier ───────────────
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun champ valide fourni pour la mise à jour.',
      });
    }
 
    updates.updatedAt = new Date();
 
    // ── 4. Mise à jour ────────────────────────────────────────────────────────
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      {
        new: true,           // retourne le document mis à jour
        runValidators: true, // exécute les validateurs Mongoose
      }
    ).select('-password -verificationCode -verificationCodeExpires -revokedTokens');
 
    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur introuvable.',
      });
    }
 
    // ── 5. Réponse ─────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      message: 'Profil mis à jour avec succès.',
      data: updatedUser,
    });
  } catch (error) {
    console.error('[updateInfo]', error);
 
    // Erreur de validation Mongoose
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', '),
      });
    }
 
    // ID malformé
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'ID utilisateur invalide.',
      });
    }
 
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour du profil.',
    });
  }
};

// export const getUser = async (req, res) => {
//   try {
//     const item = await User.find();
//     res.send(item); // Envoyer l'élément trouvé
//   } catch (err) {
//     res.status(500).send('Erreur lors de la récupération');
//   }
// }

export const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
 
    // ── 1. Validation du body ─────────────────────────────────────────────
    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Le champ "role" est requis.',
      });
    }
 
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Rôle invalide. Valeurs acceptées : ${ALLOWED_ROLES.join(', ')}.`,
      });
    }
 
    // ── 2. Vérification que l'admin ne se rétrograde pas lui-même ─────────
    if (req.user && req.user._id.toString() === id) {
      return res.status(403).json({
        success: false,
        message: 'Vous ne pouvez pas modifier votre propre rôle.',
      });
    }
 
    // ── 3. Récupération de l'utilisateur cible ────────────────────────────
    const targetUser = await User.findById(id);
 
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur introuvable.',
      });
    }
 
    // ── 4. Mise à jour ────────────────────────────────────────────────────
    const previousRole = targetUser.role;
    targetUser.role = role;
    targetUser.updatedAt = new Date();
    await targetUser.save();
 
    // ── 5. Réponse ────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      message: `Rôle mis à jour : ${previousRole} → ${role}`,
      data: {
        _id: targetUser._id,
        email: targetUser.email,
        previousRole,
        newRole: role,
        updatedAt: targetUser.updatedAt,
      },
    });
  } catch (error) {
    console.error('[updateUserRole]', error);
 
    // Mongoose CastError → ID malformé
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'ID utilisateur invalide.',
      });
    }
 
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour du rôle.',
    });
  }
};

export const getUser = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -verificationCode -verificationCodeExpires -revokedTokens')
      .sort({ createdAt: -1 });
 
    return res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error('[getUser]', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des utilisateurs.',
    });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
 
    if (req.user && req.user._id.toString() === id) {
      return res.status(403).json({
        success: false,
        message: 'Vous ne pouvez pas supprimer votre propre compte.',
      });
    }
 
    const deleted = await User.findByIdAndDelete(id);
 
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur introuvable.',
      });
    }
 
    return res.status(200).json({
      success: true,
      message: 'Utilisateur supprimé avec succès.',
      data: { _id: id },
    });
  } catch (error) {
    console.error('[deleteUser]', error);
 
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'ID invalide.' });
    }
 
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression.',
    });
  }
};


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

// export const deleteUser = async (req, res) => {
//   const { id } = req.params;

//   try {
//     // Find the post by ID and delete it
//     const deletedUser = await User.findByIdAndDelete(id);

//     if (!deletedUser) {
//       return res.status(404).json({ message: 'News not found' });
//     }

//     res.status(200).json({ message: 'Utilisateur supprimer avec succès', deletedUser });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Something went wrong' });
//   }
// }

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
          userName: user.userName,
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


export const register = async (req, res) => {
  try {
    const {
      userType,
      // Champs pour Particulier
      firstName,
      lastName,
      userName,
      // Champs pour Entreprise
      companyName,
      businessDomain,
      website,
      cfe,
      // Champs communs
      email,
      password,
      phoneNumber,
      country,
      city,
      acceptTerms,
      marketingOptIn
    } = req.body;

    // Validation obligatoire
    if (!acceptTerms) {
      return res.status(400).json({
        success: false,
        message: 'Vous devez accepter les conditions d\'utilisation'
      });
    }

    // Validation du type d'utilisateur
    if (!userType || !['Entreprise', 'Particulier'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Type d\'utilisateur invalide'
      });
    }

    // Validation des champs selon le type
    if (userType === 'Particulier') {
      if (!firstName || firstName.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Le prénom est requis'
        });
      }
      if (!lastName || lastName.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Le nom est requis'
        });
      }
    } else if (userType === 'Entreprise') {
      if (!companyName || companyName.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Le nom de la société est requis'
        });
      }
      if (!businessDomain || businessDomain.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Le domaine d\'activité est requis'
        });
      }
      if (!website || website.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Le site web est requis'
        });
      }
      if (!cfe || cfe.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Le CFE est requis'
        });
      }
    }

    // 1. Vérifier si l'email existe déjà
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'Un compte avec cet email existe déjà'
      });
    }

    // 2. Vérifier l'unicité du CFE pour les entreprises
    if (userType === 'Entreprise' && cfe && cfe.trim() !== '') {
      const existingCfe = await User.findOne({ cfe: cfe.toUpperCase() });
      if (existingCfe) {
        return res.status(400).json({
          success: false,
          message: 'Un compte avec ce CFE existe déjà'
        });
      }
    }

    // 3. Préparer les données utilisateur
    const userData = {
      userType,
      email: email.toLowerCase(),
      password,
      phoneNumber,
      acceptTerms,
      marketingOptIn: marketingOptIn || false
    };

    // 4. Ajouter les champs optionnels seulement s'ils sont fournis
    if (country && country.trim() !== '') userData.country = country.trim();
    if (city && city.trim() !== '') userData.city = city.trim();

    // 5. Ajouter les champs spécifiques au type
    if (userType === 'Particulier') {
      userData.firstName = firstName.trim();
      userData.lastName = lastName.trim();
      
      // Pour les particuliers, website et cfe doivent être undefined
      // userData.website = undefined; on ne setter pas un null ou undefined
      // userData.cfe = undefined;
      
      if (userName && userName.trim() !== '') {
        userData.userName = userName.toLowerCase().trim();
      }
    } else {
      userData.companyName = companyName.trim();
      userData.businessDomain = businessDomain.trim();
      userData.website = website.trim();
      userData.cfe = cfe.toUpperCase().trim();
      
      // Pour les entreprises, firstName, lastName et userName peuvent être undefined
      userData.firstName = undefined;
      userData.lastName = undefined;
      
      if (userName && userName.trim() !== '') {
        userData.userName = userName.toLowerCase().trim();
      }
    }

    // 6. Vérifier l'unicité du userName si fourni
    if (userData.userName && userData.userName.trim() !== '') {
      const existingUserName = await User.findOne({ 
        userName: userData.userName.toLowerCase().trim() 
      });
      if (existingUserName) {
        return res.status(400).json({
          success: false,
          message: 'Ce nom d\'utilisateur est déjà pris'
        });
      }
    }

    // 7. Déterminer le statut selon le type d'utilisateur
    const isParticulier = userData.userType === 'Particulier';
    
    // 8. Ajouter les champs de statut (TOUS les utilisateurs commencent comme non vérifiés)
    Object.assign(userData, {
      isActive: false, // Désactivé jusqu'à vérification OTP
      isVerified: false, // Non vérifié par défaut
      paymentStatus: isParticulier ? 'completed' : 'pending',
      amountPaid: isParticulier ? 0 : 5
    });

    // 9. Créer l'utilisateur
    const user = await User.create(userData);

    // 10. Générer un code OTP pour TOUS les utilisateurs
    const verificationCode = user.generateVerificationCode();
    await user.save();

    // 11. Envoyer l'email de vérification OTP pour TOUS les utilisateurs
    try {
      await sendVerificationEmail(
        user.email, 
        verificationCode, 
        isParticulier ? `${user.firstName} ${user.lastName}` : user.companyName
      );
    } catch (emailError) {
      console.error('Erreur envoi email OTP:', emailError.message);
      // Continuer même si l'email échoue
    }

    // 12. Réponse selon le type d'utilisateur
    if (isParticulier) {
      // CAS PARTICULIER - PLUS DE TOKEN, REDIRECTION VERS OTP
      return res.status(201).json({
        success: true,
        message: 'Inscription réussie ! Vérifiez votre email pour le code OTP.',
        data: {
          userId: user._id.toString(),
          email: user.email,
          requiresOTP: true, // Indique que l'OTP est requis
          userType: user.userType,
          debugCode: process.env.NODE_ENV === 'development' ? verificationCode : undefined,
          redirectUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/verify`,
          otpExpiresIn: '10 minutes'
        }
      });
    } else {
      // CAS ENTREPRISE - PAIEMENT REQUIS
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(500).json({
          success: false,
          message: 'Erreur de configuration du système de paiement'
        });
      }

      const customer = await stripeService.createCustomer(user);
      const paymentIntent = await stripeService.createPaymentIntent(customer.id, user);

      // Mettre à jour l'utilisateur
      user.stripeCustomerId = customer.id;
      user.paymentIntentId = paymentIntent.id;
      await user.save();

      return res.status(201).json({
        success: true,
        message: 'Inscription réussie. Procédez au paiement.',
        data: {
          userId: user._id.toString(),
          email: user.email,
          userName: user.userName,
          companyName: user.companyName,
          website: user.website,
          cfe: user.cfe,
          stripeCustomerId: customer.id,
          paymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          requiresPayment: true,
          amount: 5,
          currency: 'eur'
        }
      });
    }

  } catch (error) {
    console.error('❌ Erreur lors de l\'inscription:', error);
    
    // Gestion d'erreurs spécifiques
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errors: messages,
        code: 'VALIDATION_ERROR'
      });
    }
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      let message = 'Une erreur est survenue';
      
      if (field === 'email') {
        message = 'Un compte avec cet email existe déjà';
      } else if (field === 'userName') {
        message = 'Ce nom d\'utilisateur est déjà pris';
      } else if (field === 'cfe') {
        message = 'Un compte avec ce CFE existe déjà';
      }
      
      return res.status(400).json({
        success: false,
        message: message,
        code: 'DUPLICATE_KEY'
      });
    }

    // Gestion spécifique des erreurs Stripe
    if (error.type && error.type.includes('Stripe')) {
      return res.status(400).json({
        success: false,
        message: 'Erreur lors de la configuration du paiement',
        code: 'STRIPE_ERROR',
        detail: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'inscription',
      code: 'SERVER_ERROR',
      detail: process.env.NODE_ENV === 'development' ? error.message : undefined
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
  console.log('🔍 Début vérification paiement:', {
    paymentIntentId: req.body.paymentIntentId,
    email: req.body.email,
    timestamp: new Date().toISOString()
  });

  try {
    const { paymentIntentId, email } = req.body;

    // Validation
    if (!paymentIntentId || !email) {
      console.warn('⚠️ Données manquantes');
      return res.status(400).json({
        success: false,
        message: 'paymentIntentId et email sont requis'
      });
    }

    // Vérifier que Stripe est configuré
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('❌ STRIPE_SECRET_KEY non configurée');
      return res.status(500).json({
        success: false,
        message: 'Service de paiement non configuré'
      });
    }

    let paymentIntent;
    try {
      // 1. Récupérer le Payment Intent
      console.log('🔍 Récupération PaymentIntent depuis Stripe...');
      paymentIntent = await stripeService.retrievePaymentIntent(paymentIntentId);
      console.log(`📊 Statut initial: ${paymentIntent.status}`);
    } catch (stripeError) {
      console.error('❌ Erreur Stripe API:', stripeError.message);
      return res.status(400).json({
        success: false,
        message: 'Impossible de récupérer les informations de paiement',
        code: 'STRIPE_API_ERROR'
      });
    }

    // 2. Vérifier si le paiement est déjà réussi
    if (paymentIntent.status === 'succeeded') {
      console.log('✅ Paiement déjà réussi');
    } else {
      console.log('🔄 Tentative de confirmation du paiement...');
      
      try {
        // Essayer de confirmer le paiement
        const confirmedIntent = await stripeService.confirmPaymentIntent(paymentIntentId);
        
        if (confirmedIntent.status !== 'succeeded') {
          console.log(`⚠️ Paiement non réussi, statut: ${confirmedIntent.status}`);
          
          // Gérer les différents états
          if (confirmedIntent.status === 'requires_action') {
            return res.status(200).json({
              success: false,
              message: 'Action supplémentaire requise',
              requiresAction: true,
              nextAction: confirmedIntent.next_action,
              clientSecret: confirmedIntent.client_secret,
              status: confirmedIntent.status
            });
          }
          
          return res.status(400).json({
            success: false,
            message: `Paiement en attente. Statut: ${confirmedIntent.status}`,
            status: confirmedIntent.status,
            paymentIntentId: paymentIntentId
          });
        }
        
        paymentIntent = confirmedIntent;
        console.log('✅ Paiement confirmé avec succès');
        
      } catch (confirmError) {
        console.error('❌ Erreur confirmation:', confirmError.message);
        
        // Si c'est un timeout, retourner une réponse spécifique
        if (confirmError.message.includes('timeout') || confirmError.code === 'ETIMEDOUT') {
          return res.status(408).json({
            success: false,
            message: 'Délai dépassé lors de la confirmation du paiement',
            code: 'PAYMENT_TIMEOUT',
            suggestion: 'Vérifiez votre connexion internet et réessayez'
          });
        }
        
        return res.status(400).json({
          success: false,
          message: 'Erreur lors de la confirmation du paiement',
          code: 'CONFIRMATION_ERROR',
          detail: process.env.NODE_ENV === 'development' ? confirmError.message : undefined
        });
      }
    }

    // 3. Trouver l'utilisateur
    console.log(`🔍 Recherche utilisateur: ${email}`);
    const user = await User.findOne({ 
      email: email.toLowerCase().trim(),
      paymentIntentId 
    });

    if (!user) {
      console.log(`⚠️ Utilisateur non trouvé avec paymentIntentId`);
      
      // Chercher par email seulement
      const anyUser = await User.findOne({ email: email.toLowerCase().trim() });
      if (anyUser) {
        console.log(`ℹ️ Utilisateur trouvé mais paymentIntentId différent:
          User paymentIntentId: ${anyUser.paymentIntentId}
          Request paymentIntentId: ${paymentIntentId}`);
      }
      
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé avec ces identifiants',
        suggestion: 'Vérifiez que l\'email et l\'ID de paiement correspondent'
      });
    }

    console.log(`✅ Utilisateur trouvé: ${user._id}`);

    // 4. Vérifier si déjà vérifié
    if (user.isVerified) {
      console.log(`ℹ️ Compte déjà vérifié`);
      return res.status(200).json({
        success: true,
        message: 'Compte déjà vérifié',
        data: {
          isVerified: true,
          requiresOTP: false,
          userType: user.userType
        }
      });
    }

    // 5. Mettre à jour l'utilisateur
    const plan = paymentIntent.metadata?.subscriptionPlan || user.subscriptionPlan || 'monthly';
    const now = new Date();
    const endDate = new Date(now);
    if (plan === 'annual') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    user.paymentStatus = 'completed';
    user.paymentDate = now;
    user.amountPaid = paymentIntent.amount / 100;
    user.subscriptionPlan = plan;
    user.subscriptionStatus = 'active';
    user.subscriptionStartDate = now;
    user.subscriptionEndDate = endDate;
    user.isActive = true;

    const verificationCode = user.generateVerificationCode();
    await user.save();

    console.log(`✅ Compte mis à jour, OTP généré: ${verificationCode}`);

    // 6. Envoyer l'email (optionnel, peut être asynchrone)
    try {
      await sendVerificationEmail(
        user.email, 
        verificationCode, 
        `${user.firstName} ${user.lastName}`
      );
      console.log(`📧 Email envoyé à: ${user.email}`);
    } catch (emailError) {
      console.error('❌ Erreur envoi email:', emailError.message);
      // Ne pas bloquer le processus si l'email échoue
    }

    // 7. Réponse succès avec redirection
    console.log('✅ Vérification paiement terminée avec succès');
    
    return res.status(200).json({
      success: true,
      message: 'Paiement vérifié avec succès',
      data: {
        email: user.email,
        userType: user.userType,
        requiresOTP: true,
        otpExpiresIn: '10 minutes',
        debugCode: process.env.NODE_ENV === 'development' ? verificationCode : undefined,
        redirectUrl: process.env.FRONTEND_URL,
          // `${process.env.FRONTEND_URL}/verify` : 
          // 'http://localhost:3000/verify',
        paymentDetails: {
          amount: user.amountPaid,
          date: user.paymentDate,
          status: 'completed'
        }
      }
    });

  } catch (error) {
    console.error('❌ Erreur vérification paiement:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      type: error.type
    });
    
    // Détecter spécifiquement les timeouts
    if (error.message.includes('timeout') || 
        error.code === 'ETIMEDOUT' || 
        error.code === 'ECONNABORTED') {
      
      return res.status(408).json({
        success: false,
        message: 'Délai de connexion dépassé avec le service de paiement',
        code: 'CONNECTION_TIMEOUT',
        suggestion: [
          'Vérifiez votre connexion internet',
          'Assurez-vous que Stripe est accessible depuis votre serveur',
          'Réessayez dans quelques instants'
        ]
      });
    }
    
    // Erreur générale
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification du paiement',
      code: 'SERVER_ERROR',
      detail: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};



// Sélection / changement de plan d'abonnement entreprise
export const selectSubscriptionPlan = async (req, res) => {
  try {
    const { email, paymentIntentId, plan } = req.body;

    if (!email || !paymentIntentId || !plan) {
      return res.status(400).json({ success: false, message: 'email, paymentIntentId et plan sont requis' });
    }

    if (!['monthly', 'annual'].includes(plan)) {
      return res.status(400).json({ success: false, message: 'Plan invalide. Choisissez monthly ou annual.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim(), paymentIntentId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }

    const updatedIntent = await stripeService.updatePaymentIntentPlan(paymentIntentId, plan);

    user.subscriptionPlan = plan;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `Plan ${plan === 'annual' ? 'annuel ($55/an)' : 'mensuel ($5/mois)'} sélectionné`,
      data: {
        plan,
        amount: updatedIntent.amount / 100,
        currency: updatedIntent.currency,
        clientSecret: updatedIntent.client_secret,
      }
    });
  } catch (error) {
    console.error('Erreur selectSubscriptionPlan:', error.message);
    res.status(500).json({ success: false, message: 'Erreur lors de la sélection du plan', detail: error.message });
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