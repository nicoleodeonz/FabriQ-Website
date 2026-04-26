# Authentication Setup Inventory

This document describes the actual authentication implementation in this repository as of April 6, 2026.

## Frontend Files

### `frontend/src/App.tsx`
- Owns authenticated app state: `authToken`, `currentUser`, `isLoggedIn`, `isAdmin`, `showAuth`, `showForgotPassword`, `pendingView`.
- Restores auth state from `localStorage` and validates the token through `GET /api/auth/me`.
- Handles login completion, signup verification completion, logout, and forced reauthentication after password changes.

### `frontend/src/components/AuthModal.tsx`
- Main login and customer signup UI.
- Supports three states:
  - Sign in
  - Sign up
  - Signup email verification
- Frontend validation rules:
  - First name required for signup
  - Last name required for signup
  - Email must be valid
  - Phone is optional, but if present must be a PH mobile number in `+63XXXXXXXXXX` format
  - Signup password must have 8+ characters, uppercase, lowercase, number, and one of `@$!%*?&`
- Signup sends a verification code, then verifies it before the account becomes active.

### `frontend/src/components/ForgotPasswordModal.tsx`
- Real backend-driven forgot-password flow.
- Steps:
  - Request reset code by email
  - Verify 6-digit code
  - Submit new password
- Uses the same password strength rules as signup.

### `frontend/src/services/authAPI.ts`
- Auth service module for all auth network calls.
- Exported methods:
  - `signUp(payload)`
  - `verifySignUp(payload)`
  - `login(payload)`
  - `logout(token)`
  - `getMe(token)`
  - `changePassword(token, payload)`
  - `requestPasswordReset(payload)`
  - `verifyPasswordResetCode(payload)`
  - `resetPassword(payload)`

### `frontend/vite.config.ts`
- Proxies `/api` and `/uploads` to `http://localhost:5000` during development.

## Backend Files

### `backend/server.js`
- Starts the Express API.
- Loads `.env` through `dotenv`.
- Mounts auth routes under `/api/auth`.

### `backend/routes/auth.js`
- Auth endpoints:
  - `POST /api/auth/signup`
  - `POST /api/auth/signup/verify`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
  - `POST /api/auth/verify-password`
  - `PUT /api/auth/change-password`
  - `POST /api/auth/change-password`
  - `POST /api/auth/forgot-password/request`
  - `POST /api/auth/forgot-password/verify`
  - `POST /api/auth/forgot-password/reset`

### `backend/controllers/authController.js`
- Core auth controller.
- Handles:
  - Customer signup request with verification code email delivery
  - Customer signup verification and token issuance
  - Login for `admin`, `staff`, and `customer`
  - Logout
  - Authenticated password change
  - Current password verification
  - Forgot-password request, code verification, and final password reset
- Important behaviors:
  - Customer accounts are created in `pending_verification` state until the signup code is verified
  - Customers with `pending_verification` status cannot log in
  - Password changes and password resets increment `tokenVersion`, which invalidates old JWTs

### `backend/middleware/authMiddleware.js`
- Requires a `Bearer` token.
- Verifies JWT signature and token expiry.
- Loads the account by role-specific collection.
- Rejects archived accounts.
- Rejects stale tokens when the token payload `tokenVersion` no longer matches the stored account value.

### `backend/services/emailService.js`
- Server-side EmailJS integration through the EmailJS REST API.
- Uses one EmailJS template for both account verification and password reset emails.
- Distinguishes content with a `purpose` template param:
  - `account_verification`
  - `password_reset`
- Supports test mode by logging the outgoing code payload instead of sending email.

### `backend/models/Customer.js`
- Customer auth/account model.
- Important fields:
  - `firstName`
  - `lastName`
  - `email`
  - `password`
  - `phoneNumber`
  - `preferredBranch`
  - `address`
  - `tokenVersion`
  - `status` with values `pending_verification`, `active`, `archived`
  - `signupVerificationCodeHash`
  - `signupVerificationExpiresAt`
  - `signupVerificationSentAt`
  - `resetPasswordCodeHash`
  - `resetPasswordCodeExpiresAt`
  - `resetPasswordVerifiedAt`
  - `resetPasswordSentAt`
- Passwords are hashed with `bcryptjs` in the pre-save hook.

### `backend/models/Admin.js`
### `backend/models/Staff.js`
- Elevated account models used for login and password reset.
- Important auth fields:
  - `email`
  - `password`
  - `tokenVersion`
  - `status`
  - `resetPasswordCodeHash`
  - `resetPasswordCodeExpiresAt`
  - `resetPasswordVerifiedAt`
  - `resetPasswordSentAt`

## Service Modules

### Frontend
- `frontend/src/services/authAPI.ts`: HTTP client for all auth actions.

### Backend
- `backend/services/emailService.js`: EmailJS-backed delivery for signup verification and password reset codes.

## NPM Dependencies

### Frontend
- Existing auth-related runtime dependencies:
  - `react`
  - `react-dom`
  - `lucide-react`
  - `sonner`
- No extra frontend dependency was needed for EmailJS because email delivery is handled server-side.

### Backend
- Existing auth-related runtime dependencies in `backend/package.json`:
  - `express`
  - `cors`
  - `dotenv`
  - `jsonwebtoken`
  - `mongoose`
  - `bcryptjs`
- No extra EmailJS package was added because the backend uses the EmailJS REST API through Node's built-in `fetch`.

## Environment Variables

### Backend `.env`
- Required or strongly recommended:
  - `PORT`
  - `MONGODB_URI`
  - `MONGODB_DB_NAME`
  - `CORS_ORIGIN`
  - `JWT_SECRET`
  - `JWT_EXPIRES_IN`
  - `EMAILJS_ENABLED`
  - `EMAILJS_TEST_MODE`
  - `EMAILJS_PUBLIC_KEY`
  - `EMAILJS_SERVICE_ID`
  - `EMAILJS_TEMPLATE_ID`
  - `EMAILJS_FROM_NAME`
  - `EMAIL_APP_NAME`

### Frontend
- No auth-specific environment variables are currently required because the frontend uses a relative `/api` base path and the Vite proxy in development.

## Email Templates

The backend expects one EmailJS template.

### Shared Verification Template
- Environment variable: `EMAILJS_TEMPLATE_ID`
- Supported template params:
  - `to_email`
  - `email`
  - `purpose`
  - `subject`
  - `message_body`
  - `code`
  - `name`
  - `business_name`
  - `from_name`
  - `app_name`
  - `expiry_minutes`
  - `expiry_hours`

## Data Structures

### Signup Request Payload
```ts
{
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phoneNumber?: string;
}
```

### Signup Request Response
```ts
{
  message: string;
  email: string;
  expiresInMinutes: number;
}
```

### Signup Verification Payload
```ts
{
  email: string;
  code: string;
}
```

### Login Payload
```ts
{
  email: string;
  password: string;
}
```

### Forgot Password Request Payload
```ts
{
  email: string;
}
```

### Forgot Password Verify Payload
```ts
{
  email: string;
  code: string;
}
```

### Forgot Password Reset Payload
```ts
{
  email: string;
  code: string;
  newPassword: string;
}
```

### Auth Response
```ts
{
  token: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    phoneNumber?: string;
    address?: string;
    preferredBranch?: string;
  };
}
```

### JWT Payload
```ts
{
  id: string;
  email: string;
  role: 'admin' | 'staff' | 'customer';
  tokenVersion: number;
}
```

## Flow Summary

### Signup Flow
1. User completes signup form in `AuthModal`.
2. Frontend calls `POST /api/auth/signup`.
3. Backend validates uniqueness, creates or refreshes a `pending_verification` customer account, generates a 6-digit code, and sends it through EmailJS.
4. User enters the code in the verification step.
5. Frontend calls `POST /api/auth/signup/verify`.
6. Backend validates the code, activates the account, and returns JWT + user data.

### Login Flow
1. User submits email and password.
2. Frontend calls `POST /api/auth/login`.
3. Backend loads admin, staff, or customer account and verifies the bcrypt hash.
4. Backend rejects `pending_verification` customers until email verification is complete.
5. Frontend stores `authToken` and `authUser` in `localStorage`.

### Forgot Password Flow
1. User requests a reset code from `ForgotPasswordModal`.
2. Frontend calls `POST /api/auth/forgot-password/request`.
3. Backend generates a 6-digit code, stores its hash and expiry, and sends it via EmailJS.
4. User verifies the code.
5. Frontend calls `POST /api/auth/forgot-password/verify`.
6. User submits a new password.
7. Frontend calls `POST /api/auth/forgot-password/reset`.
8. Backend validates the code again, hashes the new password through the model hook, increments `tokenVersion`, clears reset fields, and returns success.