# Quick Start Guide

## 🚀 Fast Setup (Windows)

### Step 1: Ensure MongoDB is Running
```bash
# MongoDB should be running as a Windows Service
# Check Task Manager > Services > "MongoDB Server" should be Running
# If not, open Services and start it manually
```

### Step 2: One-Command Setup
Double-click `start-dev.bat` in the FabriQ root folder

This will:
- ✅ Check for Node.js installation
- ✅ Check for MongoDB connection
- ✅ Install backend dependencies (if needed)
- ✅ Install frontend dependencies (if needed)
- ✅ Start both servers automatically

### Step 3: Open in Browser
Navigate to: **http://localhost:5173**

---

## 🛠️ Manual Setup (If you prefer)

### Terminal 1: Backend
```bash
cd backend
npm install
npm run seed    # Create sample data
npm run dev     # Start server on port 5000
```

### Terminal 2: Frontend
```bash
cd FabriQ
npm install
npm run dev     # Start on port 5173
```

---

## 📝 Testing the Profile Feature

1. Open http://localhost:5173
2. Navigate to "My Profile"
3. Click "Edit Profile" button
4. Update any field (e.g., phone number)
5. Click "Save Changes"
6. Changes should be saved to MongoDB

---

## 🔍 Verify Everything Works

### Check Backend
```bash
curl http://localhost:5000/api/health
# Should return: {"status":"Server is running"}
```

### Check MongoDB
```bash
mongosh
use fabriQ
db.customers.find()
```

---

## 📁 File Structure Overview

```
FabriQ/
├── backend/              # Node.js/Express/MongoDB
│   ├── models/          # Database schemas
│   ├── controllers/      # API logic
│   ├── routes/          # API endpoints
│   ├── server.js        # Main server file
│   └── seed.js          # Sample data
│
├── FabriQ/              # React frontend
│   └── src/
│       ├── components/
│       │   ├── CustomerProfile.tsx    ✨ Updated!
│       │   └── EditProfileModal.tsx   ✨ New!
│       └── services/
│           └── customerAPI.ts         ✨ New!
│
├── BACKEND_SETUP.md     # Detailed setup guide
└── start-dev.bat        # One-click startup (Windows)
```

---

## 🎯 What Was Added

### Backend
- Express REST API server
- MongoDB connection and models
- Customer CRUD operations
- Measurements, Favorites, History endpoints
- CORS enabled for frontend

### Frontend
- Edit Profile Modal component
- API service layer
- Data loading from backend
- Error handling with fallbacks

---

## ⚙️ Configuration

### Backend (.env)
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/fabriQ
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

### Frontend
API URL is hardcoded in `src/services/customerAPI.ts`:
```typescript
const API_BASE_URL = 'http://localhost:5000/api';
```

---

## 🐛 Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| "Cannot find module" | Run `npm install` in that directory |
| Port 5000 already in use | Another app using it; change PORT in .env |
| MongoDB connection failed | Start MongoDB service in Services.msc |
| CORS error | Ensure backend is running on port 5000 |
| "Customer not found" | Run `npm run seed` in backend folder |

---

## 📊 API Quick Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/customers/:id` | Get profile |
| POST | `/api/customers` | Create profile |
| PUT | `/api/customers/:id` | Update profile |
| DELETE | `/api/customers/:id` | Delete profile |
| PUT | `/api/customers/:id/measurements` | Update measurements |
| POST | `/api/customers/:id/favorites` | Add favorite |
| DELETE | `/api/customers/:id/favorites/:id` | Remove favorite |

Base URL: `http://localhost:5000`

---

## 💡 Demo Customer ID

The frontend uses: `demo-customer-001`

This customer is created when you run `npm run seed`

To use a different customer:
1. Edit `src/components/CustomerProfile.tsx`
2. Change: `const DEMO_CUSTOMER_ID = 'demo-customer-001';`
3. Use the MongoDB `_id` of another customer

---

## 🚦 Next Steps

After verifying everything works:

1. **Add more CRUD operations** for orders, rentals, custom orders
2. **Implement authentication** (login/signup)
3. **Add file uploads** for profile pictures
4. **Create admin dashboard** for managing inventory
5. **Add inventory management** system
6. **Implement payment processing**

---

## 📞 Support

For detailed setup instructions, see:
- `BACKEND_SETUP.md` - Complete backend documentation
- `FabriQ/PROFILE_CRUD_README.md` - Frontend implementation details

Happy coding! 🎉
