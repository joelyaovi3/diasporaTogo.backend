import express from 'express';
import {
  register,
  login,
  validUser,
  googleAuth,
  logout,
  searchUsers,
  updateInfo,
  getUserById,
  getUser,
  createUser,
  updateUserAvatar,
  updateUserRole,
  sendUserId,
  validUserAccount,
  deleteUser,
  rejetUserAccount,
  forgotPassword,
  resetPassword,
  verifyCode,
  // createPaymentIntent,      
  verifyPayment,  
  resendOTP,
  refreshToken,
  checkSession,
  getActiveSessions,
  revokeSession,
  revokeAllOtherSessions,
  registerFree
} from '../controllers/user.js'; 
import { Auth } from '../middleware/user.js';

const router = express.Router();

router.use(express.json());

// Routes d'authentification avec Stripe
router.post('/auth/register/free', registerFree); 
router.post('/auth/register', register);
router.post('/auth/verify-payment', verifyPayment);   
router.post('/auth/login', login);
// router.post('/create-payment-intent', createPaymentIntent); // Étape 2: Paiement
router.post('/auth/verify-otp', verifyCode);
// router.post('/verify-payment', verifyPayment);         
router.post('/auth/resend', resendOTP)           
router.post('/auth/logout', Auth, logout);
// router.post('/auth/create-payment-intent', createPaymentIntent);

// Routes existantes (gardez-les comme avant)
router.get('/auth/valid', Auth, validUser);

// Dans votre fichier de routes (routes/auth.js)
router.post('/auth/refresh', Auth, refreshToken); // Rafraîchir le token
router.get('/check-auth', Auth, async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      user: req.rootUser,
      isAuthenticated: true
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});
router.get('/auth/check', checkSession); // VÉRIFICATION DE SESSION SANS MIDDLEWARE AUTH
router.get('/auth/sessions', Auth, getActiveSessions); // Obtenir les sessions actives
router.delete('/auth/sessions/:sessionId', Auth, revokeSession); 
router.delete('/auth/sessions', Auth, revokeAllOtherSessions);

router.post('/auth/google', googleAuth);
router.get('/user?', Auth, searchUsers);
router.get('/users/:id', getUserById);
router.patch('/users/update/:id', Auth, updateInfo);
router.get("/getAllUser", Auth ,getUser);
router.post("/create/new/user", createUser);
router.put("/:id/role", updateUserRole);
router.put("/update/user/id/:id", validUserAccount);
router.put("/rejet/user/id/:id", rejetUserAccount);
router.delete("/remove/user/:id", deleteUser);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);

export default router;