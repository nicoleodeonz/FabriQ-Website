# Customer Profile CRUD Implementation

## What's New

### Backend (Node.js + Express + MongoDB)
✅ Complete REST API for customer profile management
✅ MongoDB models and schemas
✅ CRUD operations for:
  - Customer profile (Create, Read, Update, Delete)
  - Measurements (Update, Read)
  - Favorites (Add, Remove, Read)
  - Order History (Read)

### Frontend (React + TypeScript)
✅ Edit Profile Modal Component
✅ API Service Layer (`customerAPI.ts`)
✅ Updated CustomerProfile Component with:
  - Data loading from backend
  - Edit functionality with modal
  - Live data display
  - Fallback to mock data if backend is unavailable

## Project Structure

```
FabriQ/
├── backend/
│   ├── config/
│   │   └── database.js           # MongoDB connection
│   ├── controllers/
│   │   └── customerController.js # Business logic
│   ├── models/
│   │   └── Customer.js           # MongoDB schema
│   ├── routes/
│   │   └── customers.js          # API endpoints
│   ├── server.js                 # Express server
│   ├── seed.js                   # Sample data seeding
│   ├── package.json
│   └── .env.example
│
├── FabriQ/ (Frontend)
│   └── src/
│       ├── components/
│       │   ├── CustomerProfile.tsx    # Updated with API integration
│       │   └── EditProfileModal.tsx   # New: Edit form modal
│       └── services/
│           └── customerAPI.ts         # New: API client
```

## Getting Started

### 1. Start MongoDB
```bash
# Windows: MongoDB should start automatically as a service
# macOS: brew services start mongodb-community
# Linux: sudo systemctl start mongod
```

### 2. Set Up Backend
```bash
cd backend
npm install
npm run seed      # Initialize database with sample data
npm run dev       # Start backend (port 5000)
```

### 3. Start Frontend
```bash
cd FabriQ
npm install
npm run dev       # Start frontend (port 5173)
```

### 4. Open in Browser
Navigate to `http://localhost:5173` and click "My Profile" to see the profile page.

## Features

### Edit Profile
- Click "Edit Profile" button on the profile card or in the profile tab
- A modal opens with editable fields
- Fill in the changes and click "Save Changes"
- Data is persisted to MongoDB via the backend API

### View Profile
- Profile information is loaded from MongoDB on page load
- Displays customer name, email, phone, and address
- Shows all associated information (measurements, favorites, history)

### Tabs
- **Profile Info**: View/edit personal information
- **Measurements**: View body measurements
- **Favorites**: View and manage favorite gowns
- **History**: View order and rental history

## API Endpoints

### Base URL: `http://localhost:5000/api`

**Customer Operations:**
- `GET /customers/:id` - Fetch customer
- `POST /customers` - Create customer
- `PUT /customers/:id` - Update customer
- `DELETE /customers/:id` - Delete customer

**Measurements:**
- `GET /customers/:id/measurements`
- `PUT /customers/:id/measurements`

**Favorites:**
- `GET /customers/:id/favorites`
- `POST /customers/:id/favorites`
- `DELETE /customers/:id/favorites/:favoriteId`

**History:**
- `GET /customers/:id/history`

## Demo Customer

A demo customer is seeded during setup with ID `demo-customer-001`:
- **Name**: Sarah Johnson
- **Email**: sarah.johnson@email.com
- **Phone**: +63 912 345 6789
- **Address**: 123 Fashion Street, Taguig City, Metro Manila

## Next Steps

After confirming the edit profile feature works:
1. Add authentication system for user login
2. Create additional CRUD features for:
   - Custom Orders management
   - Rental history and bookings
   - Measurements history tracking
3. Add file uploads for profile pictures
4. Implement search and filtering
5. Add validation and error handling
6. Create admin dashboard for order management

## Troubleshooting

**Issue: "Customer not found" error**
- Make sure backend is running (`npm run dev` in backend folder)
- Verify MongoDB is running
- Run `npm run seed` to create sample data

**Issue: CORS errors**
- Check that backend CORS_ORIGIN matches frontend URL
- Default: `http://localhost:5173`

**Issue: Port already in use**
- Backend uses port 5000
- Frontend uses port 5173
- Change in `.env` (backend) or `vite.config.ts` (frontend) if needed

## File Locations

- [Backend Setup Guide](../../BACKEND_SETUP.md)
- [Edit Profile Modal](src/components/EditProfileModal.tsx)
- [Customer API Service](src/services/customerAPI.ts)
- [Updated Customer Profile](src/components/CustomerProfile.tsx)
- [Backend Server](../../backend/server.js)
- [Customer Model](../../backend/models/Customer.js)
