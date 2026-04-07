// API configuration for deployment
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const isVercel = window.location.hostname.includes('vercel.app');

const API_BASE = isLocalhost 
  ? 'http://localhost:5000' 
  : 'https://health-oueu-backend.onrender.com';

// Make it available globally
window.API_BASE = API_BASE;