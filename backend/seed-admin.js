require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function patchAdmin() {
  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('admin123', salt); // Ton mot de passe sera: admin123
    
    // On met à jour le faux hash par le vrai cryptage
    await pool.query(
      `UPDATE utilisateurs SET mot_de_passe_hash = $1, mot_de_passe_salt = $2 WHERE email = $3`,
      [hash, salt, 'admin@safe-shelter.ma']
    );
    console.log("✅ Admin Patché avec succès ! Email: admin@safe-shelter.ma | Pass: admin123");
  } catch (err) {
    console.error("❌ Erreur:", err.message);
  } finally {
    pool.end();
  }
}

patchAdmin();