# 📱 Chat-Ko Android APK Build Guide (Bubblewrap TWA)

This guide explains how to generate the signed `.apk` file for **Chat-Ko E2EE Messenger** using Google Bubblewrap CLI (Option C).

---

## 🚀 Step 1: Pre-requisites
Ensure you have the following installed on your machine:
1. **Node.js** (v18 or newer)
2. **Java Development Kit (JDK 17 or 21)**
3. **Android SDK / Command Line Tools**

---

## 🛠️ Step 2: Initialize Bubblewrap Project

Open your terminal in `apps/web` and run:

```bash
npx @bubblewrap/cli init --manifest=https://chatko-45fa7.web.app/manifest.json
```

Bubblewrap will read the web manifest from `https://chatko-45fa7.web.app/manifest.json` and generate the Android project files automatically.

---

## 📦 Step 3: Build the Signed APK

Run the build command:

```bash
npx @bubblewrap/cli build
```

When prompted:
1. Enter your keystore password (e.g. `chatko12345`).
2. Bubblewrap will compile the project and generate **`app-release-signed.apk`**.

---

## 📤 Step 4: Share with Friends

Once the build finishes, you will find `app-release-signed.apk` in your project folder.
- Share `app-release-signed.apk` directly over WhatsApp, Telegram, or Google Drive.
- Friends can tap the `.apk` file on their Android phone to install Chat-Ko instantly!

---

## ⚡ Instant Online 1-Click APK Generator (Alternative to CLI)

If you don't have JDK/Android SDK setup locally:
1. Go to **[PWABuilder.com](https://www.pwabuilder.com)**
2. Type `https://chatko-45fa7.web.app`
3. Click **Package for Android** -> **Generate APK**
4. Download the ready-to-share `.apk` file!
