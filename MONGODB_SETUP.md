# MongoDB Setup Guide for Abhihar Backend

## MongoDB Connection String
```
mongodb+srv://admin:Admin@123@cluster0.miibp4n.mongodb.net/?appName=Cluster0
```

## Database & Collections

### Database Name
```
abhihar
```

### Collections Required

#### 1. **users** Collection
Stores user account information with authentication details.

**Structure:**
```javascript
{
  _id: ObjectId,
  email: string (unique),
  role: enum ['admin', 'user'],
  password_hash: string,
  password_salt: string,
  created_at: Date
}
```

**Index to Create:**
```javascript
db.users.createIndex({ email: 1 }, { unique: true })
```

#### 2. **orders** Collection
Stores customer orders with items and pricing.

**Structure:**
```javascript
{
  _id: ObjectId,
  user_id: string (UUID from JWT),
  email: string,
  items: [
    {
      id: string,
      name: string,
      price: number,
      quantity: number,
      category: string,
      brand: string
    }
  ],
  total: number,
  created_at: Date
}
```

**Index to Create:**
```javascript
db.orders.createIndex({ user_id: 1 })
db.orders.createIndex({ email: 1 })
```

## MongoDB Atlas Setup

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Connect to your cluster at: `cluster0.miibp4n.mongodb.net`
3. Run the following in MongoDB Compass or Atlas Web Shell to create indexes:

```javascript
// Switch to abhihar database
use abhihar

// Create users collection with unique email index
db.users.createIndex({ email: 1 }, { unique: true })

// Create orders collection with user_id index
db.orders.createIndex({ user_id: 1 })
db.orders.createIndex({ email: 1 })
```

## Environment Variables

Update your `.env` file with:
```env
JWT_SECRET=your-strong-secret-key
ADMIN_EMAIL=admin@gmail.com
ADMIN_PASSWORD=Admin@123
MONGO_URI=mongodb+srv://admin:Admin@123@cluster0.miibp4n.mongodb.net/?appName=Cluster0
DB_NAME=abhihar
PORT=5177
ALLOWED_ORIGIN=*
```

## Running the Backend

```bash
# Install dependencies
npm install

# Development (local Node.js server)
npm run dev

# For production (Vercel serverless)
# Ensure backend is deployed to Vercel with env vars configured
```

## API Endpoints

All endpoints require JWT token in Authorization header: `Bearer <token>`

### Authentication
- **POST /api/login** - Login with email and password
- **POST /api/signup** - Create new user account
- **GET /api/me** - Get current user info

### Orders
- **GET /api/orders** - Get user's orders (admin sees all)
- **POST /api/orders** - Create new order
- **DELETE /api/orders/:id** - Delete order (admin only)

## Key Changes from MySQL

| Aspect | MySQL | MongoDB |
|--------|-------|---------|
| Connection | Pool-based | Client with caching |
| Queries | SQL statements | MongoDB Query Language |
| ID Type | Auto-increment integer | ObjectId (string in JWT) |
| JSON Storage | VARCHAR with parsing | Native BSON arrays/objects |
| Duplicate Check | `ER_DUP_ENTRY` error | `11000` error code |
| Item Parsing | Needed for MySQL buffers | Native support |

## Testing Commands

### Create Admin User
```bash
curl -X POST http://localhost:5177/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gmail.com","password":"Admin@123"}'
```

### Sign Up New User
```bash
curl -X POST http://localhost:5177/api/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

### Get User Orders
```bash
curl -X GET http://localhost:5177/api/orders \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

## Troubleshooting

1. **Connection Timeout**: Ensure MongoDB Atlas IP whitelist allows your IP
2. **Authentication Failed**: Check MONGO_URI credentials in .env
3. **Duplicate Email Error**: Clear users collection or verify unique index
4. **Order Not Found**: Use ObjectId format for deleting (MongoDB converts automatically)

## Migration Checklist

- ✅ Replaced mysql2 with mongodb package
- ✅ Updated all database operations to use MongoDB methods
- ✅ Added proper error handling (code 11000 for duplicates)
- ✅ Converted IDs from integers to ObjectId strings
- ✅ Removed JSON parsing helpers (MongoDB handles natively)
- ✅ Updated .env and .env.example
- ✅ No changes needed to API contracts or response formats
