import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
  // Champs communs
  userType: {
    type: String,
    enum: ['Entreprise', 'Particulier'],
    default: 'Particulier'
  },
  
  // Champs pour Particulier
  firstName: {
    type: String,
    required: function() {
      return this.userType === 'Particulier';
    },
    default: null
  },
  lastName: {
    type: String,
    required: function() {
      return this.userType === 'Particulier';
    },
    default: null
  },
  userName: { // Note: j'ai changé username en userName pour correspondre au frontend
    type: String,
    required: function() {
      return this.userType === 'Particulier';
    },
    trim: true,
    lowercase: true,
    default: null
  },
  
  // Champs pour Entreprise
  companyName: {
    type: String,
    required: function() {
      return this.userType === 'Entreprise';
    },
    default: null
  },
  businessDomain: {
    type: String,
    required: function() {
      return this.userType === 'Entreprise';
    },
    default: null
  },
   website: {
    type: String,
    // default: null,
    trim: true,
    sparse: true,
    index: true,
    required: function() {
      // Ne pas rendre required si l'utilisateur est un particulier
      return this.userType === 'Entreprise';
    },
    validate: {
      validator: function(v) {
        // Si c'est une entreprise et que le champ est fourni, valider
        if (this.userType === 'Entreprise' && v) {
          return /^(https?:\/\/)?([a-z0-9-]+(\.[a-z0-9-]+)+)(\/.*)?$/i.test(v);
        }
        // Pour les particuliers ou si vide, c'est OK
        return true;
      },
      message: props => `${props.value} n'est pas une URL valide!`
    }
  },
  
  cfe: {
    type: String,
    // default: null,
    trim: true,
    uppercase: true,
    sparse: true,
    unique: true,
    required: function() {
      // Ne pas rendre required si l'utilisateur est un particulier
      return this.userType === 'Entreprise';
    },
    validate: {
      validator: function(v) {
        // Si c'est une entreprise et que le champ est fourni, valider
        if (this.userType === 'Entreprise' && v) {
          return /^[A-Z0-9\-]{3,30}$/.test(v);
        }
        // Pour les particuliers ou si vide, c'est OK
        return true;
      },
      message: props => `${props.value} n'est pas un identifiant CFE valide`
    }
  },

  // Champs communs
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Email invalide']
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
  country: String,
  city: String,
  
  role: { 
    type: String, 
    default: 'Users', 
    enum: ['Users','Support','admin','Moderator', 'Supervisor']
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
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      // Supprimer champs sensibles/techniques
      delete ret.password;
      delete ret.verificationCode;
      delete ret.verificationCodeExpires;
      delete ret.revokedTokens;
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Middleware pre-save modifié
userSchema.pre('save', async function(next) {
  const user = this;
  
  // Mettre à jour updatedAt
  this.updatedAt = Date.now();
  
  // Gestion du nom d'utilisateur selon le type
  if (user.userType === 'Particulier') {
    // Pour les particuliers, utiliser userName
    if (!user.userName || user.userName.trim() === '') {
      // Générer un userName basé sur l'email
      const baseUserName = user.email ? user.email.split('@')[0] : 'user';
      const cleanUserName = baseUserName.replace(/[^a-z0-9]/g, '');
      const finalUserName = cleanUserName || 'user';
      user.userName = `${finalUserName}${Math.floor(Math.random() * 1000)}`;
    }
    
    // Nettoyer et formater le userName
    user.userName = user.userName.toLowerCase().trim();
    
    // Vérifier l'unicité du userName pour les particuliers
    if (user.isModified('userName')) {
      try {
        let attempts = 0;
        let isUnique = false;
        
        while (!isUnique && attempts < 5) {
          const existingUser = await mongoose.model('User').findOne({
            userName: user.userName,
            _id: { $ne: user._id }
          });
          
          if (!existingUser) {
            isUnique = true;
          } else {
            const randomSuffix = Math.floor(Math.random() * 90000) + 10000;
            user.userName = user.userName.replace(/\d+$/, '') + randomSuffix;
            attempts++;
          }
        }
        
        if (!isUnique) {
          user.userName = `${user.userName}_${Date.now()}`;
        }
      } catch (err) {
        return next(err);
      }
    }
  }
  
  // Pour les entreprises, on pourrait générer un nom d'utilisateur basé sur le nom de l'entreprise
  if (user.userType === 'Entreprise' && (!user.userName || user.userName.trim() === '')) {
    if (user.companyName) {
      const cleanCompanyName = user.companyName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 15);
      user.userName = `${cleanCompanyName}${Math.floor(Math.random() * 1000)}`;
    } else {
      user.userName = `company${Date.now()}${Math.floor(Math.random() * 1000)}`;
    }
  }
  
  // Hasher le mot de passe
  if (!user.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(user.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Middleware pre-validate modifié
userSchema.pre('validate', function(next) {
  // Générer un userName si vide selon le type
  if (!this.userName || this.userName.trim() === '') {
    if (this.userType === 'Particulier') {
      if (this.email) {
        const baseUserName = this.email.split('@')[0]
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .substring(0, 20);
        
        if (baseUserName && baseUserName.length > 0) {
          this.userName = `${baseUserName}${Math.floor(Math.random() * 1000)}`;
        } else {
          this.userName = `user${Math.floor(Math.random() * 9000 + 1000)}`;
        }
      } else {
        this.userName = `user${Date.now()}${Math.floor(Math.random() * 1000)}`;
      }
    } else if (this.userType === 'Entreprise') {
      if (this.companyName) {
        const cleanCompanyName = this.companyName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .substring(0, 15);
        this.userName = `${cleanCompanyName}${Math.floor(Math.random() * 1000)}`;
      } else {
        this.userName = `company${Date.now()}${Math.floor(Math.random() * 1000)}`;
      }
    }
  }
  
  // Trim et lowercase pour userName
  if (this.userName) {
    this.userName = this.userName.toLowerCase().trim();
  }

  // Normalisation du website et du cfe
  if (this.website) {
    this.website = this.website.trim();
    if (!/^https?:\/\//i.test(this.website)) {
      this.website = `https://${this.website}`;
    }
  }

  if (this.cfe) {
    this.cfe = this.cfe.toUpperCase().replace(/[^A-Z0-9\-]/g, '');
  }
  
  next();
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

// Indexes pour optimiser les requêtes et garantir unicité lorsque pertinent
userSchema.index({ userName: 1 }, { unique: true, sparse: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ website: 1 }, { sparse: true });
userSchema.index({ cfe: 1 }, { unique: true, sparse: true });

const User = mongoose.model('User', userSchema);
export default User;