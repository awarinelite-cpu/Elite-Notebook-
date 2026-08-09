import { registerPlugin } from '@capacitor/core'

// Bridges to android/app/src/main/java/com/eliteNotebook/app/DriveAuthPlugin.java.
// Only functional when running as the native Android app (Capacitor);
// on web/PWA this plugin isn't registered and calling it will reject,
// which googleDrive.js handles by falling back to the browser OAuth flow.
const DriveAuth = registerPlugin('DriveAuth')

export async function authorizeDriveNative(scopes) {
  const result = await DriveAuth.authorize({ scopes })
  return result.accessToken
}
