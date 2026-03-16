# FabriQ - Customer Profile CRUD System 🎉

Welcome to your newly implemented FabriQ customer profile management system with full CRUD functionality and MongoDB database integration!

---

## 📖 Documentation Index

Start here based on your needs:

### 🚀 **Getting Started**
- **[QUICK_START.md](QUICK_START.md)** ← Start here if you just want to run it!
  - Fast setup guide
  - Testing checklist
  - Common issues & fixes

### 🏗️ **Architecture & Design**
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture overview
  - Data flow diagrams
  - Component structure
  - Technology stack
  - Future deployment architecture

### 💻 **Development Setup**
- **[BACKEND_SETUP.md](BACKEND_SETUP.md)** - Complete backend setup guide
  - Installation steps for MongoDB, Node.js
  - Environment configuration
  - API endpoint documentation
  - Troubleshooting

- **[FabriQ/PROFILE_CRUD_README.md](FabriQ/PROFILE_CRUD_README.md)** - Frontend implementation
  - Feature overview
  - Component descriptions
  - How to test the features
  - Next steps

### 📋 **Command Reference**
- **[COMMANDS.md](COMMANDS.md)** - All useful commands
  - Startup commands
  - Database commands
  - Testing commands
  - Debugging tips

### 📝 **Implementation Details**
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - What was built
  - Complete file listing
  - Database schema
  - Testing checklist
  - Next steps for production

---

## 🎯 Quick Navigation

### "I want to start coding right now"
1. Double-click → `start-dev.bat`
2. Wait for both terminals
3. Open → http://localhost:5173
4. Go to "My Profile" tab

### "I want to understand the architecture"
→ Read [ARCHITECTURE.md](ARCHITECTURE.md)

### "I'm getting errors"
→ Check [QUICK_START.md](QUICK_START.md) troubleshooting section

### "I need command reference"
→ See [COMMANDS.md](COMMANDS.md)

### "Tell me what was built"
→ Read [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)

---

## ✨ What's New

### Backend (Node.js + Express + MongoDB)
✅ REST API with complete CRUD operations
✅ MongoDB database with customer profiles
✅ 10+ API endpoints for managing:
  - Customer information
  - Measurements
  - Favorites
  - Order history
✅ Error handling and validation
✅ CORS enabled for frontend

### Frontend (React + TypeScript)
✅ Edit Profile Modal component
✅ API integration layer
✅ Load/save customer data
✅ Real-time updates
✅ Error handling with fallbacks

### Documentation
✅ 5 comprehensive guides
✅ Architecture diagrams
✅ Command reference
✅ Quick start guide
✅ Setup troubleshooting

---

## 📁 Project Structure

```
FabriQ/
├── 📄 Documentation Files (START HERE)
│   ├── QUICK_START.md           ⭐ Quick setup
│   ├── ARCHITECTURE.md          📊 System design
│   ├── BACKEND_SETUP.md         🛠️ Backend guide
│   ├── COMMANDS.md              📝 Command reference
│   └── IMPLEMENTATION_SUMMARY.md ✨ What was built
│
├── 🚀 Startup Script
│   └── start-dev.bat           One-click startup (Windows)
│
├── 🔧 Backend Server
│   └── backend/
│       ├── server.js           Express server
│       ├── seed.js             Sample data
│       ├── config/
│       ├── models/
│       ├── controllers/
│       ├── routes/
│       ├── package.json
│       └── .env
│
├── 💻 Frontend Application
│   └── FabriQ/
│       ├── src/
│       │   ├── components/
│       │   │   ├── CustomerProfile.tsx    ✨ Updated
│       │   │   └── EditProfileModal.tsx   ✨ NEW
│       │   └── services/
│       │       └── customerAPI.ts         ✨ NEW
│       └── package.json
│
└── 🐳 Optional
    └── docker-compose.yml     Docker setup
```

---

## 🚀 Getting Started (3 Steps)

### Step 1: Ensure MongoDB is Running
Windows: Should start automatically
macOS/Linux: Run `mongosh` in a terminal

### Step 2: Start Servers
**Option A (Easiest - Windows):**
- Double-click `start-dev.bat`

**Option B (Manual):**
```bash
# Terminal 1
cd backend && npm install && npm run seed && npm run dev

# Terminal 2
cd FabriQ && npm install && npm run dev
```

### Step 3: Open Browser
Navigate to: **http://localhost:5173**

---

## 🎯 Testing the Feature

1. Click on "My Profile" in navigation
2. View customer information from database
3. Click "Edit Profile" button
4. Update any field (e.g., phone number)
5. Click "Save Changes"
6. Data is saved to MongoDB ✅
7. Refresh page and changes persist ✅

---

## 📊 Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB |
| **Communication** | REST API (JSON) |
| **Tools** | Git, npm |

---

## 🔌 API Endpoints

Base URL: `http://localhost:5000/api`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/customers/:id` | Get profile |
| POST | `/customers` | Create profile |
| PUT | `/customers/:id` | Update profile |
| DELETE | `/customers/:id` | Delete profile |
| PUT | `/customers/:id/measurements` | Update measurements |
| POST | `/customers/:id/favorites` | Add favorite |
| DELETE | `/customers/:id/favorites/:id` | Remove favorite |
| GET | `/customers/:id/history` | Get order history |

---

## 💾 Database Schema

```javascript
Customer {
  _id: ObjectId,
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  address: String,
  preferredBranch: String,
  measurements: {...},
  favorites: [{...}],
  orderHistory: [{...}],
  createdAt: Date,
  updatedAt: Date
}
```

---

## 🎓 Demo Account

Created when running `npm run seed`:
- **ID**: demo-customer-001
- **Name**: Sarah Johnson
- **Email**: sarah.johnson@email.com
- **Phone**: +63 912 345 6789

This account is automatically loaded in the frontend.

---

## 🔑 Key Features Implemented

### ✅ Create
- New customer profile creation via API

### ✅ Read
- Load customer data on page load
- Display all customer information
- Fetch favorites and order history

### ✅ Update
- Edit profile information via modal
- Save changes to MongoDB
- Real-time data refresh

### ✅ Delete
- Delete customer profile endpoint
- Remove favorites
- (UI implementation available)

---

## 🚦 Next Steps

After confirming everything works:

1. **Authentication**
   - Implement user login/signup
   - Protect endpoints with JWT

2. **More CRUD Features**
   - Custom Orders management
   - Rental bookings system
   - Inventory management

3. **File Uploads**
   - Profile pictures
   - Dress sketches

4. **Advanced Features**
   - Search and filtering
   - Pagination
   - Admin dashboard

---

## ❓ FAQ

**Q: Where is the database?**
A: MongoDB running locally at `mongodb://localhost:27017/fabriQ`

**Q: How do I reset the data?**
A: Run `npm run seed` in the backend folder

**Q: Can I use a different customer ID?**
A: Yes, edit the `DEMO_CUSTOMER_ID` in `CustomerProfile.tsx`

**Q: What if MongoDB isn't installed?**
A: See [BACKEND_SETUP.md](BACKEND_SETUP.md) for installation instructions

**Q: Can I use Docker?**
A: Yes, see `docker-compose.yml` for Docker setup

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot connect to MongoDB" | Start MongoDB service |
| "Port 5000 already in use" | Another app using it; change PORT in .env |
| "Module not found" | Run `npm install` |
| "CORS error" | Ensure backend is running on port 5000 |
| "Customer not found" | Run `npm run seed` |

See [QUICK_START.md](QUICK_START.md) for more solutions.

---

## 📞 Support Resources

- **MongoDB Docs**: https://docs.mongodb.com
- **Express.js Docs**: https://expressjs.com
- **React Documentation**: https://react.dev
- **Node.js Documentation**: https://nodejs.org/docs

---

## 🎉 Summary

You now have:
- ✅ Full backend with MongoDB
- ✅ REST API with CRUD operations
- ✅ React frontend with edit functionality
- ✅ Complete documentation
- ✅ Sample data and easy setup
- ✅ Windows startup automation

**Start with [QUICK_START.md](QUICK_START.md) and you'll be up and running in minutes!**

---

## 📄 File References

All documentation files are in the root `FabriQ/` directory:
- [QUICK_START.md](QUICK_START.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [BACKEND_SETUP.md](BACKEND_SETUP.md)
- [COMMANDS.md](COMMANDS.md)
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)

Backend code in: `FabriQ/backend/`
Frontend code in: `FabriQ/FabriQ/`

---

## 🎊 Happy Coding!

You're all set to start developing. Double-click `start-dev.bat` and enjoy building! 🚀
