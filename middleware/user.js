// middleware/user.js
import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';

export const Auth = async (req, res, next) => {
  try {
    // 1. Vérifier comment le token est reçu
    const authHeader = req.headers?.authorization;
    const cookieToken = req.cookies?.userToken;
    const authToken = req.cookies?.auth_token;
    
    // Essayer différentes sources
    let token = cookieToken || 
                authToken ||
                (authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'Token manquant' 
      });
    }

    let decoded;
    try {
      const secret = process.env.SECRET;
      decoded = jwt.verify(token, secret);
      req.tokenExpired = false;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        decoded = jwt.decode(token);
        
        if (!decoded || !decoded.id) {
          return res.status(401).json({ 
            success: false,
            error: 'Token expiré et invalide'
          });
        }
        req.tokenExpired = true;
      } else {
        return res.status(401).json({ 
          success: false,
          error: 'Token invalide',
          details: error.message
        });
      }
    }

    // Rechercher l'utilisateur
    const user = await User
      .findOne({ _id: decoded.id || decoded.userId })
      .select('-password')
      .select('username email avatar role userType isVerified isActive firstName lastName _id');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }
    
    // Définir l'utilisateur sur req.user (important pour la compatibilité)
    req.user = user; // ← CECI EST LE CHANGEMENT IMPORTANT
    req.token = token;
    req.userId = user._id; // Alias pour compatibilité
    
    // Garder les anciens noms pour compatibilité avec le code existant
    req.rootUser = user;
    req.rootUserId = user._id;
    req.userInfo = {
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      id: user._id
    };
    
    console.log('✅ Auth middleware - User authenticated:', {
      id: user._id,
      email: user.email,
      username: user.username
    });
    
    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    res.status(401).json({ 
      success: false,
      error: 'Authentification échouée',
      details: error.message 
    });
  }
};

export const OptionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies?.userToken || 
                 req.cookies?.auth_token ||
                 (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') 
                  ? req.headers.authorization.split(' ')[1] : null);
    
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.SECRET);
        const user = await User
          .findOne({ _id: decoded.id || decoded.userId })
          .select('-password')
          .select('username email avatar role');
        
        if (user) {
          req.user = user;
          req.userId = user._id;
        }
      } catch (error) {
        // Token invalide ou expiré, mais ce n'est pas bloquant
        console.log('Token optionnel invalide:', error.message);
      }
    }
    
    next();
  } catch (error) {
    // Erreur non bloquante pour l'auth optionnelle
    console.error('OptionalAuth error:', error);
    next();
  }
};