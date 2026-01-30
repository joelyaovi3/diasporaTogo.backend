import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const fixNow = async () => {
  try {
    console.log('Connexion à MongoDB...');
    await mongoose.connect(process.env.URL);
    
    const db = mongoose.connection.db;
    const collection = db.collection('users');
    
    console.log('Étape 1: Liste des index...');
    const indexes = await collection.indexes();
    console.log('Index existants:');
    indexes.forEach(idx => console.log(`- ${idx.name}: ${JSON.stringify(idx.key)}`));
    
    console.log('\nÉtape 2: Suppression des index problématiques...');
    // Essayer de supprimer tous les index possibles sur username/userName
    const indexNames = ['userName_1', 'username_1', 'username_unique'];
    for (const indexName of indexNames) {
      try {
        await collection.dropIndex(indexName);
        console.log(`✓ Index ${indexName} supprimé`);
      } catch (err) {
        if (err.codeName === 'IndexNotFound') {
          console.log(`- Index ${indexName} non trouvé`);
        }
      }
    }
    
    console.log('\nÉtape 3: Correction des usernames null...');
    // Trouver tous les documents avec username problématique
    const badUsers = await collection.find({
      $or: [
        { username: null },
        { username: { $exists: false } },
        { username: '' }
      ]
    }).toArray();
    
    console.log(`Documents à corriger: ${badUsers.length}`);
    
    for (const user of badUsers) {
      // Générer un username unique
      const base = user.email ? user.email.split('@')[0].toLowerCase() : 'user';
      const cleanBase = base.replace(/[^a-z0-9]/g, '') || 'user';
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 1000);
      const newUsername = `${cleanBase}${timestamp}${random}`;
      
      await collection.updateOne(
        { _id: user._id },
        { $set: { username: newUsername } }
      );
      
      console.log(`Corrigé ${user.email || user._id}: ${newUsername}`);
    }
    
    console.log('\nÉtape 4: Vérification des doublons...');
    const duplicates = await collection.aggregate([
      { $match: { username: { $ne: null, $exists: true } } },
      { $group: { _id: "$username", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();
    
    if (duplicates.length > 0) {
      console.log('ATTENTION: Doublons trouvés:');
      for (const dup of duplicates) {
        console.log(`- ${dup._id}: ${dup.count} fois`);
      }
    } else {
      console.log('✓ Aucun doublon trouvé');
    }
    
    console.log('\nÉtape 5: Création du nouvel index...');
    await collection.createIndex(
      { username: 1 },
      { 
        unique: true,
        name: 'username_1',
        partialFilterExpression: { 
          username: { $exists: true, $ne: null, $type: 'string', $ne: '' }
        },
        background: true
      }
    );
    
    console.log('\nÉtape 6: Vérification finale...');
    const finalIndexes = await collection.indexes();
    const usernameIndex = finalIndexes.find(idx => idx.name === 'username_1');
    if (usernameIndex) {
      console.log('✓ Index créé avec succès');
      console.log('Options:', JSON.stringify(usernameIndex, null, 2));
    } else {
      console.log('✗ Index non créé');
    }
    
    console.log('\n✅ CORRECTION TERMINÉE !');
    console.log('Redémarrez votre application maintenant.');
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ ERREUR:', error);
    process.exit(1);
  }
};

fixNow();