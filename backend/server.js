require('dotenv').config()

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const { Pool } = require('pg')

const app = express()
const PORT = Number(process.env.PORT) || 5000

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
})

const RISK_QUERY =
  'BEGIN; CALL sp_indice_risque_penurie(\'cursor_risque\'); FETCH ALL IN "cursor_risque"; COMMIT;'

function parseBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback
  }

  return (
    value === true ||
    value === 1 ||
    value === '1' ||
    value === 'true' ||
    value === 't'
  )
}

function normalizeUserRole(value) {
  if (value === undefined || value === null) {
    return null
  }

  const normalized = String(value).trim().toLowerCase()

  if (normalized === 'admin') {
    return 'admin'
  }

  if (normalized === 'manager' || normalized === 'operateur' || normalized === 'operator') {
    return 'operateur'
  }

  if (normalized === 'observateur' || normalized === 'observer') {
    return 'observateur'
  }

  return null
}

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())
app.use(helmet())

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: {
    error: 'ALERTE SÉCURITÉ : Déni de Service (DoS) détecté. IP bloquée.',
  },
})

app.use(globalLimiter)

const reservationsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: {
    error: 'ALERTE SÉCURITÉ : Spam de réservation bloqué.',
  },
})

app.get('/api/zones', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT zone_id, nom, capacite_max, occupation_actuelle, statut, latitude, longitude, is_hub FROM zones_regroupement ORDER BY occupation_actuelle DESC;'
    )

    res.status(200).json(rows)
  } catch (error) {
    console.error('Error fetching zones:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

app.post('/api/zones', async (req, res) => {
  const { nom, capacite_max, latitude, longitude, is_hub, occupation_actuelle } = req.body
  const normalizedIsHub = parseBooleanFlag(is_hub, false)
  const initialOccupation = Number.isFinite(Number(occupation_actuelle))
    ? Number(occupation_actuelle)
    : 0

  if (
    nom === undefined ||
    capacite_max === undefined ||
    latitude === undefined ||
    longitude === undefined
  ) {
    return res
      .status(400)
      .json({ message: 'nom, capacite_max, latitude and longitude are required' })
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO zones_regroupement (nom, capacite_max, occupation_actuelle, latitude, longitude, is_hub) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;',
      [nom, capacite_max, initialOccupation, latitude, longitude, normalizedIsHub]
    )

    res.status(201).json(rows[0])
  } catch (error) {
    console.error('Error creating zone:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

app.put('/api/zones/:id', async (req, res) => {
  const { id } = req.params
  const { nom, capacite_max, latitude, longitude, is_hub } = req.body
  const normalizedIsHub = parseBooleanFlag(is_hub, false)

  if (
    nom === undefined ||
    capacite_max === undefined ||
    latitude === undefined ||
    longitude === undefined
  ) {
    return res
      .status(400)
      .json({ message: 'nom, capacite_max, latitude and longitude are required' })
  }

  try {
    const { rows } = await pool.query(
      'UPDATE zones_regroupement SET nom = $1, capacite_max = $2, latitude = $3, longitude = $4, is_hub = $5 WHERE zone_id = $6 RETURNING *;',
      [nom, capacite_max, latitude, longitude, normalizedIsHub, id]
    )

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Zone not found' })
    }

    res.status(200).json(rows[0])
  } catch (error) {
    console.error('Error updating zone:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

app.delete('/api/zones/:id', async (req, res) => {
  const { id } = req.params

  try {
    const result = await pool.query(
      'DELETE FROM zones_regroupement WHERE zone_id = $1 RETURNING *;',
      [id]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Zone non trouvée' })
    }

    res.status(200).json({ message: 'Zone supprimée' })
  } catch (error) {
    console.error('Error deleting zone:', error)
    res.status(500).json({ message: 'Iternal server error' })
  }
})

app.get('/api/users', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT u.*, z.nom AS zone_nom FROM utilisateurs u LEFT JOIN zones_regroupement z ON u.zone_id = z.zone_id;'
    )

    const sanitizedRows = rows.map((row) => {
      const {
        mot_de_passe,
        mot_de_passe_hash,
        password,
        password_hash,
        ...safeRow
      } = row
      const resolvedUserId =
        row?.utilisateur_id ?? row?.id ?? row?.user_id ?? row?.id_utilisateur

      return {
        ...safeRow,
        user_id: resolvedUserId,
      }
    })

    res.status(200).json(sanitizedRows)
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

app.post('/api/users', async (req, res) => {
  const { email, mot_de_passe, role, zone_id } = req.body
  const normalizedRole = normalizeUserRole(role)

  if (
    email === undefined ||
    mot_de_passe === undefined ||
    role === undefined ||
    zone_id === undefined
  ) {
    return res.status(400).json({
      message: 'email, mot_de_passe, role and zone_id are required',
    })
  }

  if (!normalizedRole) {
    return res.status(400).json({
      message: 'role must be admin, operateur, or observateur',
    })
  }

  try {
    const safeZoneId =
      zone_id === '' || zone_id === 'null' || !zone_id
        ? null
        : Number.parseInt(zone_id, 10)
    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(mot_de_passe, salt)
    const { rows } = await pool.query(
      'INSERT INTO utilisateurs (email, mot_de_passe_hash, mot_de_passe_salt, role, zone_id) VALUES ($1, $2, $3, $4, $5) RETURNING user_id, email, role, zone_id;',
      [email, passwordHash, salt, normalizedRole, safeZoneId]
    )

    res.status(201).json(rows[0])
  } catch (error) {
    console.error('Error creating user:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params
  const { email, mot_de_passe, role, zone_id } = req.body
  const normalizedRole = normalizeUserRole(role)

  if (
    email === undefined ||
    role === undefined ||
    zone_id === undefined
  ) {
    return res.status(400).json({
      message: 'email, role and zone_id are required',
    })
  }

  if (!normalizedRole) {
    return res.status(400).json({
      message: 'role must be admin, operateur, or observateur',
    })
  }

  try {
    const safeZoneId =
      zone_id === '' || zone_id === 'null' || !zone_id
        ? null
        : Number.parseInt(zone_id, 10)
    const shouldUpdatePassword =
      mot_de_passe !== undefined && String(mot_de_passe).trim() !== ''

    if (shouldUpdatePassword) {
      const salt = await bcrypt.genSalt(10)
      const passwordHash = await bcrypt.hash(mot_de_passe, salt)
      const { rows } = await pool.query(
        'UPDATE utilisateurs SET email = $1, role = $2, zone_id = $3, mot_de_passe_hash = $4, mot_de_passe_salt = $5 WHERE user_id = $6 RETURNING user_id, email, role, zone_id;',
        [email, normalizedRole, safeZoneId, passwordHash, salt, id]
      )

      if (rows.length === 0) {
        return res.status(404).json({ message: 'User not found' })
      }

      return res.status(200).json(rows[0])
    }

    const { rows } = await pool.query(
      'UPDATE utilisateurs SET email = $1, role = $2, zone_id = $3 WHERE user_id = $4 RETURNING user_id, email, role, zone_id;',
      [email, normalizedRole, safeZoneId, id]
    )

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.status(200).json(rows[0])
  } catch (error) {
    console.error('Error updating user:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params

  try {
    const { rows } = await pool.query(
      'DELETE FROM utilisateurs WHERE user_id = $1 RETURNING *;',
      [id]
    )

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.status(200).json({ message: 'User deleted successfully' })
  } catch (error) {
    console.error('Error deleting user:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

app.get('/api/stocks', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT s.*, z.nom AS zone_nom FROM stocks s JOIN zones_regroupement z ON s.zone_id = z.zone_id ORDER BY s.stock_id DESC;'
    )

    res.status(200).json(rows)
  } catch (error) {
    console.error('Error fetching stocks:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

app.post('/api/stocks', async (req, res) => {
  const { zone_id, type_ressource, quantite_disponible, seuil_alerte } = req.body

  if (
    zone_id === undefined ||
    type_ressource === undefined ||
    quantite_disponible === undefined ||
    seuil_alerte === undefined
  ) {
    return res.status(400).json({
      message:
        'zone_id, type_ressource, quantite_disponible and seuil_alerte are required',
    })
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO stocks (zone_id, type_ressource, quantite_disponible, seuil_alerte) VALUES ($1, $2, $3, $4) RETURNING *;',
      [zone_id, type_ressource, quantite_disponible, seuil_alerte]
    )

    res.status(201).json(rows[0])
  } catch (error) {
    console.error('Error creating stock:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

app.put('/api/stocks/:stockId', async (req, res) => {
  const { stockId } = req.params
  const { zone_id, type_ressource, quantite_disponible, seuil_alerte } = req.body

  if (
    zone_id === undefined ||
    type_ressource === undefined ||
    quantite_disponible === undefined ||
    seuil_alerte === undefined
  ) {
    return res.status(400).json({
      message:
        'zone_id, type_ressource, quantite_disponible and seuil_alerte are required',
    })
  }

  try {
    const { rows } = await pool.query(
      'UPDATE stocks SET zone_id = $1, type_ressource = $2, quantite_disponible = $3, seuil_alerte = $4 WHERE stock_id = $5 RETURNING *;',
      [zone_id, type_ressource, quantite_disponible, seuil_alerte, stockId]
    )

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Stock not found' })
    }

    res.status(200).json(rows[0])
  } catch (error) {
    console.error('Error updating stock:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

app.delete('/api/stocks/:stockId', async (req, res) => {
  const { stockId } = req.params

  try {
    const { rows } = await pool.query(
      'DELETE FROM stocks WHERE stock_id = $1 RETURNING *;',
      [stockId]
    )

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Stock not found' })
    }

    res.status(200).json({ message: 'Stock deleted successfully' })
  } catch (error) {
    console.error('Error deleting stock:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

app.get('/api/risks', async (req, res) => {
  try {
    const queryResult = await pool.query(RISK_QUERY)
    const queryResults = Array.isArray(queryResult) ? queryResult : [queryResult]
    const fetchResult = queryResults.find((result) => result.command === 'FETCH')
    const riskRows = fetchResult ? fetchResult.rows : []
    const { rows: zoneRows } = await pool.query(
      'SELECT z.* FROM zones_regroupement z;'
    )
    const zonesById = new Map(
      zoneRows.map((zone) => [String(zone.zone_id), zone])
    )
    const enrichedRisks = riskRows.map((risk) => {
      const zone = zonesById.get(String(risk.zone_id)) || {}
      const isHubValue = zone?.is_hub ?? risk?.is_hub

      return {
        ...zone,
        ...risk,
        is_hub: isHubValue,
      }
    })

    res.status(200).json(enrichedRisks)
  } catch (error) {
    console.error('Error fetching risks:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

app.get('/api/activity-logs', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM activity_logs ORDER BY action_time DESC LIMIT 10;'
    )

    res.status(200).json(rows)
  } catch (error) {
    console.error('Error fetching activity logs:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

app.post('/api/distributions', async (req, res) => {
  const { stock_id, user_id, quantite_distribuee } = req.body

  if (
    stock_id === undefined ||
    user_id === undefined ||
    quantite_distribuee === undefined
  ) {
    return res
      .status(400)
      .json({ message: 'stock_id, user_id and quantite_distribuee are required' })
  }

  try {
    await pool.query(
      'INSERT INTO distributions (stock_id, user_id, quantite_distribuee) VALUES ($1, $2, $3);',
      [stock_id, user_id, quantite_distribuee]
    )

    res.status(201).json({ message: 'Distribution recorded successfully' })
  } catch (error) {
    console.error('Error creating distribution:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

app.post('/api/dispatch', async (req, res) => {
  const { hub_id, zone_id, type_ressource, quantite } = req.body

  if (
    hub_id === undefined ||
    zone_id === undefined ||
    type_ressource === undefined ||
    quantite === undefined
  ) {
    return res
      .status(400)
      .json({ message: 'hub_id, zone_id, type_ressource and quantite are required' })
  }

  try {
    await pool.query('CALL sp_dispatch_stock($1, $2, $3, $4);', [
      hub_id,
      zone_id,
      type_ressource,
      quantite,
    ])

    res.status(200).json({ message: 'Dispatch completed successfully' })
  } catch (error) {
    console.error('Error dispatching stock:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body

  console.log('--- LOGIN ATTEMPT ---')
  console.log('1. Payload received:', { email, passwordLength: password?.length })

  try {
    const result = await pool.query('SELECT * FROM utilisateurs WHERE email = $1;', [
      email,
    ])
    console.log('2. DB User Found:', result.rows.length > 0)

    const user = result.rows[0]

    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' })
    }

    const isMatch = await bcrypt.compare(password, user.mot_de_passe_hash)
    console.log('3. Password Match Result:', isMatch)

    if (isMatch === false) {
      return res.status(401).json({ error: 'Mot de passe incorrect' })
    }

    console.log('4. JWT Secret Exists:', !!process.env.JWT_SECRET)

    const token = jwt.sign(
      {
        id: user.user_id,
        role: user.role,
        zoneId: user.zone_id,
      },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '12h' }
    )

    return res.status(200).json({ token })
  } catch (err) {
    console.error('5. CRASH IN LOGIN:', err.message)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/api/reservations', reservationsLimiter, async (req, res) => {
  const { zoneId, emplacementNumero, cin } = req.body

  if (zoneId === undefined || emplacementNumero === undefined || cin === undefined) {
    return res
      .status(400)
      .json({ message: 'zoneId, emplacementNumero and cin are required' })
  }

  try {
    await pool.query(
      "INSERT INTO reservations_tentes (zone_id, emplacement_numero, cin_sinistre, statut) VALUES ($1, $2, $3, 'active') RETURNING *;",
      [zoneId, emplacementNumero, cin]
    )

    res.status(201).json({ message: 'Reservation created successfully' })
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        error:
          'CRITICAL QA TRIGGERED: Double réservation bloquée par l-Index Partiel (409 Conflict).',
      })
    }

    console.error('Error creating reservation:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

async function startServer() {
  try {
    await pool.query('SELECT 1;')
    console.log('DB Connected successfully')

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()