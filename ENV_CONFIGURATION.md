# Environment Configuration Guide

## Frontend .env File

The frontend uses a `.env` file to configure the backend API URL.

### Current Configuration

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api
```

This is configured for Android emulator.

### Configuration Options

#### For Android Emulator
```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api
```
Android emulator uses `10.0.2.2` to access the host machine's localhost.

#### For iOS Simulator
```env
EXPO_PUBLIC_API_URL=http://localhost:3000/api
```
iOS simulator can access localhost directly.

#### For Physical Device
```env
EXPO_PUBLIC_API_URL=http://192.168.1.100:3000/api
```
Replace `192.168.1.100` with your computer's actual IP address on the local network.

To find your IP:
- Windows: `ipconfig` (look for IPv4 Address)
- Mac/Linux: `ifconfig` or `ip addr`

### How It Works

The environment variable is used in:
- `hooks/useGoogleAuth.ts` - For Google OAuth backend communication
- Other API calls throughout the app

The code reads it like this:
```typescript
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
```

### Important Notes

1. **Restart Required**: After changing `.env`, restart Expo:
   ```bash
   npx expo start -c
   ```

2. **EXPO_PUBLIC_ Prefix**: Environment variables must start with `EXPO_PUBLIC_` to be accessible in the app.

3. **Backend Must Be Running**: Make sure your backend is running on port 3000:
   ```bash
   cd delivery-backend
   npm run start:dev
   ```

4. **Firewall**: If using a physical device, make sure your firewall allows connections on port 3000.

### Testing Connectivity

To test if your device can reach the backend:

1. Make sure backend is running
2. In your app, try any API call (like login)
3. Check the console for errors
4. If you see "Network request failed", the URL is incorrect

### Current Setup

✅ Backend running on: `http://localhost:3000/api`
✅ Frontend configured for: Android emulator (`http://10.0.2.2:3000/api`)
✅ Google Auth uses the same URL from environment variable

### Switching Between Devices

If you switch from emulator to physical device:

1. Find your computer's IP address
2. Update `.env`:
   ```env
   EXPO_PUBLIC_API_URL=http://YOUR_IP:3000/api
   ```
3. Restart Expo: `npx expo start -c`
4. Test the connection

### Troubleshooting

**Problem**: "Network request failed"
**Solution**: 
- Check backend is running
- Verify the URL in `.env` is correct
- For Android emulator, use `10.0.2.2`
- For physical device, use your computer's IP
- Check firewall settings

**Problem**: "Connection refused"
**Solution**:
- Backend might not be running
- Port 3000 might be blocked
- Try accessing `http://YOUR_URL` in a browser

**Problem**: Changes not taking effect
**Solution**:
- Restart Expo with clear cache: `npx expo start -c`
- Make sure you saved the `.env` file
- Check the variable name starts with `EXPO_PUBLIC_`

### Google Sign-In on Android (`DEVELOPER_ERROR`, code 10)

**What are SHA-1 / SHA-256 here?**  
They are short **fingerprints** (hashes) of your **signing certificate** — the key pair used to sign your APK. Google Sign-In checks: “Does this fingerprint belong to an app we registered for this Firebase project?” It is **not** your API URL or localhost; it only depends on **which keystore** signed the binary.

| Mode | What signs the app | What to register in Firebase |
|------|-------------------|-------------------------------|
| **Dev** (`expo run:android`, USB) | **Debug keystore** on your PC (`~/.android/debug.keystore`) | **SHA-1** (and optionally SHA-256) from **Variant: debug** in `signingReport` |
| **Production** (Play Store install) | **Google Play App Signing** uses Google’s key for users (your upload key uploads the bundle) | Add **App signing key certificate** SHA-1 from Play Console → **App integrity** (not only your debug SHA) |

Firebase’s “Add fingerprint” accepts **SHA-1** and **SHA-256**; either works for registration — use what Google Cloud shows for each certificate.

Play Store / EAS release builds use **release/upload** keys; `npx expo run:android` uses the **debug** keystore. Google only allows Sign-In if fingerprints for **each** signing path you use are registered for **`com.localsmartdelivery.app`** in **Firebase** (same project as `google-services.json`).

1. From `delivery-frontend`, run `npm run android:signing-report` (Windows), or:
   ```bash
   cd android
   ./gradlew signingReport
   ```
   (Windows: `gradlew.bat signingReport`.)
2. Under **Variant: debug** for the **app** module, copy the **SHA1** line (you can also add **SHA-256** if Firebase offers both fields).
3. Firebase Console → **Project settings** → **Your apps** → Android app with package **`com.localsmartdelivery.app`** → **Add fingerprint** → paste SHA-1.
4. Wait a few minutes. Optionally download **`google-services.json`** again and replace `delivery-frontend/google-services.json`, then rebuild (`npx expo run:android --device`).

For **Play releases**, also add the **App signing certificate SHA-1** from Play Console (App integrity) if Google Sign-In fails only on store installs — debug SHA alone does not cover Play App Signing.
