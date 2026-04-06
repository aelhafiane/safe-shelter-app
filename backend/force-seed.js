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

async function forceSeed() {
  try {
    console.log("--- INITIATING NUCLEAR SEED ---");
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('admin123', salt);
    
    // 1. N-ms7ouh ila kan m-kherb9
    await pool.query(`DELETE FROM utilisateurs WHERE email = 'admin@safe-shelter.ma'`);
    
    // 2. N-joutiwh 3la n9a b l-Hash s7i7
    await pool.query(
      `INSERT INTO utilisateurs (email, mot_de_passe_hash, mot_de_passe_salt, role, zone_id) 
       VALUES ($1, $2, $3, 'admin', 1)`,
      ['admin@safe-shelter.ma', hash, salt]
    );
    
    // 3. N-t2kdou bli rah wsel
    const check = await pool.query(`SELECT email, role FROM utilisateurs WHERE email = 'admin@safe-shelter.ma'`);
    
    if (check.rows.length > 0) {
        console.log("✅ BOOM! Admin injected successfully into Database:", check.rows[0]);
        console.log("🔑 Email: admin@safe-shelter.ma | Pass: admin123");
    } else {
        console.log("❌ CRITICAL: Database refused the insert. Check your PostgreSQL connection!");
    }
  } catch (err) {
    console.error("❌ Crash:", err.message);
  } finally {
    pool.end();
  }
}

forceSeed();