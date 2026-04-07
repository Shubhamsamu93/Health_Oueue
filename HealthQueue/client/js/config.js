// API configuration for deployment
const API_BASE = process.env.VERCEL_ENV === 'production'
  ? process.env.API_BASE || 'https://healthqueue-backend.onrender.com'
  : 'http://localhost:5000';

// Make it available globally
window.API_BASE = API_BASE;