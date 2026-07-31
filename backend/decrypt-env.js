const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const algorithm = 'aes-256-cbc';
const password = '16542005'; // The password to decrypt the file
const key = crypto.scryptSync(password, 'salt', 32);

// Read the encrypted file
const encryptedPath = path.join(__dirname, '.env.enc');
const encryptedContent = fs.readFileSync(encryptedPath, 'utf8');

// Split IV and encrypted data
const parts = encryptedContent.split(':');
const iv = Buffer.from(parts[0], 'hex');
const encrypted = parts[1];

// Decrypt
const decipher = crypto.createDecipheriv(algorithm, key, iv);
let decrypted = decipher.update(encrypted, 'hex', 'utf8');
decrypted += decipher.final('utf8');

// Save decrypted file
const envPath = path.join(__dirname, '.env');
fs.writeFileSync(envPath, decrypted);

console.log('.env file decrypted successfully');
