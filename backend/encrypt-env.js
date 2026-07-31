const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const algorithm = 'aes-256-cbc';
const password = '16542005'; // The password to protect the file
const key = crypto.scryptSync(password, 'salt', 32);
const iv = crypto.randomBytes(16);

// Read the .env file
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

// Encrypt
const cipher = crypto.createCipheriv(algorithm, key, iv);
let encrypted = cipher.update(envContent, 'utf8', 'hex');
encrypted += cipher.final('hex');

// Save encrypted file with IV prepended
const encryptedPath = path.join(__dirname, '.env.enc');
fs.writeFileSync(encryptedPath, iv.toString('hex') + ':' + encrypted);

console.log('.env file encrypted successfully as .env.enc');
console.log('Password required: 16542005');
