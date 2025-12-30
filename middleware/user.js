import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';

export const Auth = async (req, res, next) => {
  // console.log("=== DEBUG Auth Middleware ===");
  
  try {
    // 1. Vérifier comment le token est reçu
    const authHeader = req.headers?.authorization;
    const cookieToken = req.cookies?.userToken;
    const authToken = req.cookies?.auth_token; // Vérifiez aussi ce cookie
    
    // console.log("Auth Header:", authHeader);
    // console.log("Cookie userToken:", cookieToken ? "Présent" : "Absent");
    // console.log("Cookie auth_token:", authToken ? "Présent" : "Absent");
    
    // Essayer différentes sources
    let token = cookieToken || 
                authToken ||
                (authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);
    
    // console.log("Token extrait:", token ? `${token.substring(0, 20)}...` : "NULL");
    
    if (!token) {
      // console.log("❌ Aucun token trouvé");
      return res.status(401).json({ error: 'Token manquant' });
    }

    let decoded;
    try {
      // 2. Vérifier la clé secrète
      const secret = process.env.SECRET;
      // console.log("Secret utilisé:", secret ? "Défini" : "Non défini");
      
      decoded = jwt.verify(token, secret);
      // console.log("✅ Token valide");
      // console.log("Decoded:", {
      //   id: decoded.id || decoded.userId,
      //   email: decoded.email,
      //   exp: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null
      // });
      
      req.tokenExpired = false;
    } catch (error) {
      // console.log("❌ Erreur de vérification:", error.message);
      
      if (error.name === 'TokenExpiredError') {
        // console.log("Token expiré, tentative de décodage...");
        decoded = jwt.decode(token);
        
        if (!decoded || !decoded.id) {
          // console.log("Token expiré et invalide");
          return res.status(401).json({ 
            error: 'Token expiré et invalide',
            details: 'Le token a expiré et ne peut pas être décodé'
          });
        }
        
        // console.log("Token décodé (expiré):", decoded);
        req.tokenExpired = true;
      } else {
        console.log("Autre erreur:", error.name);
        return res.status(401).json({ 
          error: 'Token invalide',
          details: error.message
        });
      }
    }

    // 3. Rechercher l'utilisateur
    // console.log("Recherche utilisateur avec ID:", decoded.id || decoded.userId);
    
    const rootUser = await User
      .findOne({ _id: decoded.id || decoded.userId })
      .select('-password')
      .select('username email avatar role userType isVerified isActive firstName lastName');
    
    if (!rootUser) {
      // console.log("❌ Utilisateur non trouvé en base");
      return res.status(404).json({ 
        error: 'Utilisateur non trouvé',
        userId: decoded.id || decoded.userId
      });
    }
    
    // console.log("✅ Utilisateur trouvé:", rootUser.email);
    
    req.token = token;
    req.rootUser = rootUser;
    req.rootUserId = rootUser._id;
    req.userInfo = {
      username: rootUser.username,
      email: rootUser.email,
      avatar: rootUser.avatar,
      role: rootUser.role,
      id: rootUser._id
    };
    
    // console.log("=== FIN DEBUG Auth ===");
    next();
  } catch (error) {
    // console.error('❌ Auth middleware error:', error);
    res.status(401).json({ 
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