# Whisper — WhatsApp-Style E2EE Real-Time Chat (Firebase & Firestore Edition)

Whisper is a production-grade, real-time, end-to-end encrypted (E2EE) messaging Progressive Web App (PWA) inspired by WhatsApp, powered by **Google Cloud Firestore DB**, **Firebase Auth**, and standard Web Crypto **Signal Protocol (X3DH + Double Ratchet)**.

---

## 🌟 Key Architecture & Pillars

1. **End-to-End Encryption (Signal Protocol):**
   - **X3DH (Extended Triple Diffie-Hellman):** Key agreement protocol for initializing encrypted session between devices.
   - **Double Ratchet Algorithm:** Provides forward secrecy and self-healing session re-keying on every message turn.
   - **Client-Side Key Storage:** Identity private keys and ratchet session states are generated and stored strictly inside the client browser's IndexedDB (`Dexie.js`).
   - **Zero-Knowledge Firestore Persistence:** Firestore stores ONLY encrypted ciphertext payloads, initialization vectors (IVs), and ephemeral public keys — **never plaintext messages or private keys**.
2. **Firebase Auth + Phone Number Verification:**
   - Phone-number-based login (via Firebase Auth Phone Provider / SMS verification).
   - Includes a Development Test OTP Mode (`123456`) for instant local testing without SMS costs.
3. **Firestore Real-Time Engine:**
   - Replaces traditional websockets with native Firestore `onSnapshot` real-time collection listeners for instant zero-latency message synchronization, read/delivery ticks (✓, ✓✓, blue ✓✓), and user presence.
4. **WhatsApp-Grade Modern UI/UX:**
   - Dark theme (`#0b141a` / `#111b21`), emerald accent (`#00a884`), tail-styled message bubbles, date dividers, typing indicators, and 60-digit Safety Code fingerprint verification dialog.
5. **Firebase Hosting Deployment:**
   - Single command deployment to Firebase Hosting and Firestore Security Rules enforcement.

---

## 📁 Repository Structure

```
chatting/
├── firebase.json                  # Firebase Hosting & Firestore deployment configuration
├── firestore.rules                # Security rules for Firestore collections & sub-collections
├── package.json                   # Root monorepo workspace configuration (npm/pnpm)
├── README.md                      # Setup & deployment documentation
├── packages/
│   ├── shared-types/              # Shared TypeScript interfaces (Auth, User, MessageDTO)
│   └── crypto/                    # Double Ratchet & X3DH Web Crypto engine + Automated Jest test suite
└── apps/
    ├── server/                    # Express + Prisma server (Optional alternative backend)
    └── web/                       # Next.js 14+ PWA Client + Firebase Auth + Firestore + Dexie
```

---

## ⚙️ Firestore Database Collections Schema

1. **`users` Collection**
   - Document ID: `userId`
   - Data: `{ id, phoneNumber, name, avatarUrl, bio, status, lastSeen, createdAt }`
2. **`keyBundles` Collection**
   - Document ID: `userId`
   - Data: `{ identityPublicKey, signedPreKey, oneTimePreKeys, updatedAt }`
3. **`conversations` Collection**
   - Document ID: `conversationId`
   - Data: `{ isGroup, name, participantIds, lastMessage, updatedAt }`
4. **`conversations/{conversationId}/messages` Sub-Collection**
   - Document ID: `messageId`
   - Data: `{ id, conversationId, senderId, recipientId, encryptedPayload, messageType, status, createdAt }`

---

## 🚀 Quickstart — Local Development Setup

### 1. Prerequisites
- **Node.js**: v18+ or v22+
- **npm**: v10+

### 2. Install Dependencies
```bash
npm install
```

### 3. Build Shared Packages
```bash
npm run build --workspace=packages/shared-types
npm run build --workspace=packages/crypto
```

### 4. Run Automated Crypto Engine Unit Tests
```bash
npm test
```

### 5. Start Frontend Client Server
```bash
npm run dev:web
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing the Firestore E2EE Chat Flow

1. Open [http://localhost:3000](http://localhost:3000) in **Window A**.
2. Enter phone number `+1 555-0100`, click **Send Verification Code**, click **Auto-fill** (Test OTP: `123456`), and save profile name `Alice`.
3. Open [http://localhost:3000](http://localhost:3000) in **Incognito Window B**.
4. Enter phone number `+1 555-0200`, verify test OTP `123456`, and save profile name `Bob`.
5. In **Window A (Alice)**, click **New Chat** (top left), enter phone `+1 555-0200`, and click **Start Chat**.
6. Send messages back and forth:
   - Firestore `onSnapshot` real-time updates deliver messages instantly.
   - Inspect Firebase Console -> Firestore Database to verify **ONLY encrypted ciphertexts** and IVs are stored — zero plaintext content.
   - Click **Verify Safety Code** in header to inspect the 60-digit Signal protocol fingerprint.

---

## 🌐 Deploying to Firebase Hosting & Firestore

### 1. Install Firebase CLI
```bash
npm install -g firebase-tools
```

### 2. Login & Select Firebase Project
```bash
firebase login
firebase use --add
```

### 3. Deploy Firestore Rules & Static Export
```bash
firebase deploy --only firestore:rules,hosting
```
