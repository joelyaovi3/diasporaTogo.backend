import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'Le prénom est requis']
  },
  lastName: {
    type: String,
    required: [true, 'Le nom est requis']
  },
  username: {
    type: String,
    required: [true, 'Le nom d\'utilisateur est requis'],
    unique: true,
    trim: true,
    lowercase: true, // Optionnel: uniformiser la casse
    index: true // Ajouter explicitement
  },
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Email invalide']
  },
  role: { 
      type: String, 
      default: 'Users', 
      enum: ['Users','Support','admin','Moderator', 'Supervisor']
  },
  password: {
    type: String,
    required: [true, 'Le mot de passe est requis'],
    minlength: 6,
    select: false
  },
  phoneNumber: {
    type: String,
    required: [true, 'Le téléphone est requis']
  },
  profession: String,
  country: String,
  city: String,
  userType: {
    type: String,
    enum: ['Entreprise', 'Particulier'],
    default: 'Particulier'
  },
  
  // État du compte
  isActive: {
    type: Boolean,
    default: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  
  // Paiement
  stripeCustomerId: String,
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentIntentId: String,
  amountPaid: {
    type: Number,
    default: 5 // €
  },
  paymentDate: Date,
  
  // Vérification
  verificationCode: String,
  verificationCodeExpires: Date,
  verificationAttempts: {
    type: Number,
    default: 0,
    max: 3
  },
  
  // Sécurité
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,

  revokedTokens: [{
    token: String,
    revokedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Métadonnées
  signupSource: String,
  acceptTerms: {
    type: Boolean,
    default: false,
    required: [true, 'Vous devez accepter les conditions']
  },
  marketingOptIn: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Remplacer les deux middleware pre('save') par un seul
userSchema.pre('save', async function(next) {
  // Étape 1: Gérer le username
  if (!this.username || this.username.trim() === '') {
    this.username = `${this.email.split('@')[0]}${Math.floor(Math.random() * 1000)}`;
  }
  
  // Étape 2: Vérifier l'unicité du username
  if (this.isModified('username')) {
    try {
      const existingUser = await this.constructor.findOne({
        username: this.username,
        _id: { $ne: this._id }
      });
      
      if (existingUser) {
        const error = new Error('Ce nom d\'utilisateur est déjà pris');
        error.name = 'ValidationError';
        return next(error);
      }
    } catch (err) {
      return next(err);
    }
  }
  
  // Étape 3: Hasher le mot de passe si modifié
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Méthodes d'instance
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateVerificationCode = function() {
  // Générer un code à 6 chiffres
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  this.verificationCode = code;
  this.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  this.verificationAttempts = 0;
  
  return code;
};

userSchema.methods.revokeToken = async function(token) {
  try {
    // Option 1: Stocker les tokens révoqués dans un tableau
    if (!this.revokedTokens) {
      this.revokedTokens = [];
    }
    
    // Ajouter le token à la liste des tokens révoqués
    this.revokedTokens.push({
      token: token,
      revokedAt: new Date()
    });
    
    // Garder seulement les 100 derniers tokens révoqués
    if (this.revokedTokens.length > 100) {
      this.revokedTokens = this.revokedTokens.slice(-100);
    }
    
    await this.save();
    return true;
  } catch (error) {
    console.error('Erreur lors de la révocation du token:', error);
    return false;
  }
};

userSchema.methods.incrementVerificationAttempts = function() {
  this.verificationAttempts += 1;
  if (this.verificationAttempts >= 3) {
    this.verificationCode = undefined;
    this.verificationCodeExpires = undefined;
  }
  return this.save();
};

userSchema.methods.verifyCode = function(code) {
  if (!this.verificationCode || !this.verificationCodeExpires) {
    return { valid: false, message: 'Aucun code actif' };
  }
  
  if (Date.now() > this.verificationCodeExpires) {
    return { valid: false, message: 'Code expiré' };
  }
  
  if (this.verificationAttempts >= 3) {
    return { valid: false, message: 'Trop de tentatives' };
  }
  
  if (this.verificationCode !== code) {
    this.incrementVerificationAttempts();
    return { 
      valid: false, 
      message: 'Code incorrect', 
      attemptsLeft: 3 - this.verificationAttempts 
    };
  }
  
  // Code valide
  this.isVerified = true;
  this.isActive = true;
  this.verificationCode = undefined;
  this.verificationCodeExpires = undefined;
  this.verificationAttempts = 0;
  
  return { valid: true, message: 'Compte vérifié avec succès' };
};

userSchema.virtual('fullName').get(function() {
  return this.name;
});

userSchema.virtual('isPaymentRequired').get(function() {
  return !this.isVerified && this.paymentStatus === 'pending';
});

// Dans userSchema, après les virtuals existants
userSchema.virtual('requiresPayment').get(function() {
  return this.userType !== 'Particulier'; // Paiement pour Company et Freelance
});

const User = mongoose.model('User', userSchema);
export default User;