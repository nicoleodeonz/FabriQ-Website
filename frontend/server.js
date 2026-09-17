const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const buildDirectory = path.join(__dirname, 'build');

const contentSecurityPolicy = [
  "default-src 'self' https:",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' blob: https: wss:"
].join('; ');

app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', contentSecurityPolicy);
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

app.use(express.static(buildDirectory));

app.get('*', (req, res) => {
  res.sendFile(path.join(buildDirectory, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Frontend server listening on port ${PORT}`);
});