import { MongoClient } from 'mongodb'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const envPath = path.join(__dirname, '.env')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf8')
  content.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const idx = trimmed.indexOf('=')
    if (idx === -1) return
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (!process.env[key]) process.env[key] = value.replace(/^"|"$/g, '')
  })
}

loadEnv()

const MONGO_URI = process.env.MONGO_URI
const DB_NAME = process.env.DB_NAME || 'abhihar'

if (!MONGO_URI) {
  console.error('Error: MONGO_URI not set in .env file')
  process.exit(1)
}

async function setupMongoDB() {
  const client = new MongoClient(MONGO_URI)
  try {
    await client.connect()
    const db = client.db(DB_NAME)
    
    console.log(`Connecting to database: ${DB_NAME}`)
    
    // Create users collection if it doesn't exist
    try {
      await db.createCollection('users')
      console.log('✓ Created users collection')
    } catch (e) {
      if (e.codeName !== 'NamespaceExists') {
        throw e
      }
      console.log('✓ Users collection already exists')
    }
    
    // Create unique index on email
    try {
      await db.collection('users').createIndex({ email: 1 }, { unique: true })
      console.log('✓ Created unique index on users.email')
    } catch (e) {
      if (e.codeName !== 'IndexAlreadyExists') {
        throw e
      }
      console.log('✓ Unique index on users.email already exists')
    }
    
    // Create orders collection if it doesn't exist
    try {
      await db.createCollection('orders')
      console.log('✓ Created orders collection')
    } catch (e) {
      if (e.codeName !== 'NamespaceExists') {
        throw e
      }
      console.log('✓ Orders collection already exists')
    }
    
    // Create index on user_id
    try {
      await db.collection('orders').createIndex({ user_id: 1 })
      console.log('✓ Created index on orders.user_id')
    } catch (e) {
      if (e.codeName !== 'IndexAlreadyExists') {
        throw e
      }
      console.log('✓ Index on orders.user_id already exists')
    }
    
    // Create index on email
    try {
      await db.collection('orders').createIndex({ email: 1 })
      console.log('✓ Created index on orders.email')
    } catch (e) {
      if (e.codeName !== 'IndexAlreadyExists') {
        throw e
      }
      console.log('✓ Index on orders.email already exists')
    }
    
    console.log('\n✅ MongoDB setup completed successfully!')
    console.log(`Database: ${DB_NAME}`)
    console.log('Collections: users, orders')
    
  } catch (error) {
    console.error('❌ MongoDB setup failed:', error.message)
    process.exit(1)
  } finally {
    await client.close()
  }
}

setupMongoDB()
