// utils/encryption.js
// Chiffrement/déchiffrement AES-256-GCM pour les champs sensibles en base.
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // taille recommandée pour GCM
const PREFIX = 'enc:v1:';

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;

  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY est manquante dans les variables d\'environnement');
  }

  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY doit être une clé de 32 octets encodée en hexadécimal (64 caractères)');
  }

  cachedKey = key;
  return cachedKey;
}

// Une valeur déjà chiffrée par cette fonction commence toujours par ce préfixe.
// Sert à éviter un double chiffrement et à reconnaître les données legacy non migrées.
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encrypt(value) {
  if (value === null || value === undefined || value === '') return value;
  if (isEncrypted(value)) return value;

  const text = String(value);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(value) {
  if (value === null || value === undefined || value === '') return value;
  if (!isEncrypted(value)) return value; // valeur en clair (legacy non migrée) : on la renvoie telle quelle

  try {
    const [ivHex, authTagHex, dataHex] = value.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Erreur de déchiffrement:', error.message);
    return value;
  }
}
