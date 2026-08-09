package com.eliteNotebook.app;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentSender;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import java.util.ArrayList;
import java.util.List;

// Requests a Drive-scoped OAuth access token using Google Play Services'
// native Authorization API — NOT the Google Identity Services web/WebView
// popup used for the app's own login (see src/lib/googleDrive.js). This
// runs entirely outside any WebView, so it shows every Google account
// actually signed into the device (not a stale/capped WebView snapshot)
// and has no limit on how many accounts can be linked.
//
// Requires an OAuth Client ID of type "Android" registered in Google Cloud
// Console, bound to this app's package name (com.eliteNotebook.app) and
// its signing certificate's SHA-1 fingerprint. Google matches the calling
// app to that client automatically via the signature — no client ID is
// passed in code, unlike the web flow's VITE_GOOGLE_CLIENT_ID.
@CapacitorPlugin(name = "DriveAuth")
public class DriveAuthPlugin extends Plugin {

    private static final int REQUEST_CODE = 55231;
    private PluginCall pendingCall;

    @PluginMethod
    public void authorize(PluginCall call) {
        List<String> scopeStrings = new ArrayList<>();
        JSArray scopesArg = call.getArray("scopes");
        try {
            if (scopesArg != null) {
                for (Object o : scopesArg.toList()) scopeStrings.add(String.valueOf(o));
            }
        } catch (Exception ignored) {}
        if (scopeStrings.isEmpty()) {
            scopeStrings.add("https://www.googleapis.com/auth/drive");
            scopeStrings.add("email");
            scopeStrings.add("profile");
        }

        List<Scope> scopes = new ArrayList<>();
        for (String s : scopeStrings) scopes.add(new Scope(s));

        AuthorizationRequest request = AuthorizationRequest.builder()
            .setRequestedScopes(scopes)
            .build();

        Identity.getAuthorizationClient(getActivity())
            .authorize(request)
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    launchResolution(call, result);
                } else {
                    resolveWithResult(call, result);
                }
            })
            .addOnFailureListener(e -> call.reject("authorize-failed: " + e.getMessage()));
    }

    private void launchResolution(PluginCall call, AuthorizationResult result) {
        try {
            pendingCall = call;
            Activity activity = getActivity();
            IntentSender sender = result.getPendingIntent().getIntentSender();
            activity.startIntentSenderForResult(sender, REQUEST_CODE, null, 0, 0, 0);
        } catch (IntentSender.SendIntentException e) {
            pendingCall = null;
            call.reject("send-intent-failed: " + e.getMessage());
        }
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_CODE) return;
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;

        try {
            AuthorizationResult result = Identity.getAuthorizationClient(getActivity())
                .getAuthorizationResultFromIntent(data);
            resolveWithResult(call, result);
        } catch (ApiException e) {
            call.reject("authorize-cancelled-or-failed: " + e.getMessage());
        }
    }

    private void resolveWithResult(PluginCall call, AuthorizationResult result) {
        JSObject ret = new JSObject();
        ret.put("accessToken", result.getAccessToken());
        // AuthorizationResult doesn't carry profile info — the JS side
        // fetches email/name/picture from Google's userinfo endpoint using
        // this token, same as the previous web flow did.
        call.resolve(ret);
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        // Play Services caches authorization per-scope per-account; there's
        // no client-side "disconnect" call needed here — removing the
        // account from the JS-side accounts list is sufficient, matching
        // how the previous web flow's disconnect worked (local only).
        call.resolve();
    }
}
