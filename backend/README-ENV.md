# Email Configuration Setup

The email credentials are stored in an encrypted file `backend/.env.enc` for security.

## To Decrypt and Use Email Credentials:

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Run the decryption script:
   ```bash
   node decrypt-env.js
   ```

3. Enter password when prompted: `16542005`

4. The decrypted `.env` file will be created with your Gmail SMTP credentials

## To Encrypt Credentials Before Committing:

1. After updating `.env`, run:
   ```bash
   node encrypt-env.js
   ```

2. This creates `backend/.env.enc` (encrypted version)

3. Commit the `.env.enc` file (NOT the .env file)

## Security Notes:
- Never commit the plain `.env` file
- The encryption password is: `16542005`
- Only authorized team members should have access to the decryption password
