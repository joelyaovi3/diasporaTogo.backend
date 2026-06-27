// scripts/encryptExistingData.js
//
// Migration unique : chiffre en AES-256-GCM les messages et les informations
// utilisateurs sensibles déjà présents en base (créés avant l'activation du
// chiffrement). Les documents déjà chiffrés (préfixe "enc:v1:") sont ignorés,
// le script peut donc être relancé sans risque (idempotent).
//
// Usage : node scripts/encryptExistingData.js
// Pré-requis : ENCRYPTION_KEY doit être définie dans .env (la même clé que
// celle utilisée par l'application).
//
// IMPORTANT : faites une sauvegarde de la base avant de lancer ce script.

import 'dotenv/config';
import mongoose from 'mongoose';
import Message from '../models/messageModel.js';
import User from '../models/userModel.js';
import { encrypt, isEncrypted } from '../utils/encryption.js';

const ENCRYPTED_USER_FIELDS = [
  'phoneNumber',
  'country',
  'city',
  'companyName',
  'businessDomain',
  'website'
];

// On passe par le driver MongoDB natif (Model.collection) plutôt que par les
// requêtes Mongoose, pour lire/écrire les valeurs brutes sans déclencher les
// getters/setters/hooks du schéma (évite tout risque de double chiffrement
// ou d'effets de bord comme la mise à jour de updatedAt).
async function migrateMessages() {
  const cursor = Message.collection.find({});
  let scanned = 0;
  let updated = 0;

  for await (const doc of cursor) {
    scanned++;
    const set = {};

    if (doc.content && !isEncrypted(doc.content)) {
      set.content = encrypt(doc.content);
    }

    if (Array.isArray(doc.attachments) && doc.attachments.length > 0) {
      let attachmentsChanged = false;
      const newAttachments = doc.attachments.map((attachment) => {
        const next = { ...attachment };
        if (attachment.filename && !isEncrypted(attachment.filename)) {
          next.filename = encrypt(attachment.filename);
          attachmentsChanged = true;
        }
        if (attachment.url && !isEncrypted(attachment.url)) {
          next.url = encrypt(attachment.url);
          attachmentsChanged = true;
        }
        return next;
      });
      if (attachmentsChanged) set.attachments = newAttachments;
    }

    if (Array.isArray(doc.editHistory) && doc.editHistory.length > 0) {
      let historyChanged = false;
      const newHistory = doc.editHistory.map((entry) => {
        if (entry.content && !isEncrypted(entry.content)) {
          historyChanged = true;
          return { ...entry, content: encrypt(entry.content) };
        }
        return entry;
      });
      if (historyChanged) set.editHistory = newHistory;
    }

    if (Object.keys(set).length > 0) {
      await Message.collection.updateOne({ _id: doc._id }, { $set: set });
      updated++;
    }
  }

  console.log(`Messages : ${updated}/${scanned} document(s) chiffré(s)`);
}

async function migrateUsers() {
  const cursor = User.collection.find({});
  let scanned = 0;
  let updated = 0;

  for await (const doc of cursor) {
    scanned++;
    const set = {};

    for (const field of ENCRYPTED_USER_FIELDS) {
      const value = doc[field];
      if (typeof value === 'string' && value !== '' && !isEncrypted(value)) {
        set[field] = encrypt(value);
      }
    }

    if (Object.keys(set).length > 0) {
      await User.collection.updateOne({ _id: doc._id }, { $set: set });
      updated++;
    }
  }

  console.log(`Utilisateurs : ${updated}/${scanned} document(s) chiffré(s)`);
}

async function run() {
  if (!process.env.ENCRYPTION_KEY) {
    console.error('ENCRYPTION_KEY est manquante dans .env. Migration annulée.');
    process.exit(1);
  }

  if (!process.env.URL) {
    console.error('URL (chaîne de connexion MongoDB) est manquante dans .env. Migration annulée.');
    process.exit(1);
  }

  console.log('Connexion à MongoDB...');
  await mongoose.connect(process.env.URL);
  console.log('Connecté. Démarrage de la migration...\n');

  try {
    await migrateMessages();
    await migrateUsers();
    console.log('\nMigration terminée avec succès.');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('Erreur durant la migration :', error);
  process.exit(1);
});
