# FabriQ Backend Setup Guide

## Prerequisites
- Node.js (v16 or higher)
- MongoDB (v4.0 or higher)
- npm or yarn

## Installation Steps

### 1. Install MongoDB

**Windows:**
- Download MongoDB Community Edition from [mongodb.com](https://www.mongodb.com/try/download/community)
- Run the installer and follow the setup wizard
- MongoDB will be installed as a Windows Service and automatically start

**macOS:**
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install -y mongodb
sudo systemctl start mongod
```

### 2. Set Up Backend

```bash
# Navigate to the backend directory
cd backend

# Install dependencies
npm install

# Create .env file from example
copy .env.example .env
# On macOS/Linux: cp .env.example .env

# Seed the database with sample data
npm run seed

# Start the backend server (development mode)
npm run dev

# Or for production
npm start
```

The backend server will run on `http://localhost:5000`

### 3. Verify MongoDB Connection

To check if MongoDB is running:

**Windows (Command Prompt):**
```bash
mongosh
```

**macOS/Linux:**
```bash
mongosh
```

Once connected, you can verify the database:
```bash
use fabriQ
db.customers.find()
```

### 4. API Endpoints

The backend provides the following REST API endpoints:

#### Customer Profile
- `GET /api/customers/:id` - Get customer profile
- `POST /api/customers` - Create new customer
- `PUT /api/customers/:id` - Update customer profile
- `DELETE /api/customers/:id` - Delete customer

#### Measurements
- `GET /api/customers/:id/measurements` - Get measurements
- `PUT /api/customers/:id/measurements` - Update measurements

#### Favorites
- `GET /api/customers/:id/favorites` - Get favorites
- `POST /api/customers/:id/favorites` - Add favorite
- `DELETE /api/customers/:id/favorites/:favoriteId` - Remove favorite

#### Order History
- `GET /api/customers/:id/history` - Get order history

#### Health Check
- `GET /api/health` - Server health check

### 5. Frontend Setup

The frontend is already configured to connect to the backend at `http://localhost:5000`.

```bash
# In the FabriQ directory
cd FabriQ

# Install dependencies
npm install

# Start the development server
npm run dev
```

The frontend will run on `http://localhost:5173`

## Environment Variables

Create a `.env` file in the backend directory:

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/fabriQ
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

## Troubleshooting

### MongoDB Connection Issues
- Make sure MongoDB service is running
- Check if port 27017 is not blocked by firewall
- Verify the connection string in .env

### CORS Errors
- Make sure the frontend URL matches `CORS_ORIGIN` in .env
- Default frontend URL: `http://localhost:5173`

### Port Already in Use
- Backend default port: 5000
- Frontend default port: 5173
- To use different ports, update `.env` and vite config accordingly

## Development Tips

- The backend uses ES modules (`"type": "module"` in package.json)
- Use `npm run dev` for development with auto-reload (requires nodemon)
- MongoDB uses `_id` field as the primary key (ObjectId)
- All timestamps are stored in ISO 8601 format


## Testing the Backend

Use curl, Postman, or any HTTP client:

```bash
# Test health check
curl http://localhost:5000/api/health

# Get customer (replace with actual customer ID)
curl http://localhost:5000/api/customers/demo-customer-001

# Create a new customer
curl -X POST http://localhost:5000/api/customers \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+63 912 345 6789",
    "address": "123 Street",
    "preferredBranch": "Taguig Main"
  }'
```

## Notes

- The demo customer ID used in the frontend is `demo-customer-001`
- If the customer doesn't exist in the database, the frontend will display default data
- To persist changes, make sure the backend server is running and connected to MongoDB
- The seed.js script creates a sample customer with ID that you can use for testing
