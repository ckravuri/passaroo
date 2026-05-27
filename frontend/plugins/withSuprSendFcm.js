// Expo config plugin for SuprSend native FCM handling (Android background/killed).
// See Emergent push playbook.
const {
  withAndroidManifest,
  withDangerousMod,
  withAppBuildGradle,
} = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

function buildKotlinSource(packageName) {
  return (
    'package ' + packageName + '\n' +
    '\n' +
    'import android.app.NotificationChannel\n' +
    'import android.app.NotificationManager\n' +
    'import android.app.PendingIntent\n' +
    'import android.content.Context\n' +
    'import android.content.Intent\n' +
    'import android.os.Build\n' +
    'import androidx.core.app.NotificationCompat\n' +
    'import com.google.firebase.messaging.FirebaseMessagingService\n' +
    'import com.google.firebase.messaging.RemoteMessage\n' +
    'import org.json.JSONObject\n' +
    '\n' +
    'class SuprSendMessagingService : FirebaseMessagingService() {\n' +
    '\n' +
    '    override fun onMessageReceived(remoteMessage: RemoteMessage) {\n' +
    '        val payload = remoteMessage.data["supr_send_n_pl"] ?: return\n' +
    '        try {\n' +
    '            val json = JSONObject(payload)\n' +
    '            val title = json.optString("notificationTitle",\n' +
    '                json.optString("title", "Notification"))\n' +
    '            val body = json.optString("shortDescription",\n' +
    '                json.optString("longDescription",\n' +
    '                    json.optString("body", json.optString("message", ""))))\n' +
    '            if (title.isNotBlank() || body.isNotBlank()) {\n' +
    '                postNotification(title, body)\n' +
    '            }\n' +
    '        } catch (ex: Exception) {\n' +
    '            // ignore\n' +
    '        }\n' +
    '    }\n' +
    '\n' +
    '    private fun postNotification(title: String, body: String) {\n' +
    '        val channelId = "default"\n' +
    '        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager\n' +
    '        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {\n' +
    '            nm.createNotificationChannel(\n' +
    '                NotificationChannel(channelId, "Default", NotificationManager.IMPORTANCE_HIGH)\n' +
    '                    .apply { enableVibration(true) }\n' +
    '            )\n' +
    '        }\n' +
    '        val launchIntent: Intent? = packageManager.getLaunchIntentForPackage(packageName)\n' +
    '        val pi: PendingIntent? = if (launchIntent != null) {\n' +
    '            PendingIntent.getActivity(this, 0, launchIntent, PendingIntent.FLAG_IMMUTABLE)\n' +
    '        } else null\n' +
    '        val iconId: Int = resources.getIdentifier("ic_stat_notify", "drawable", packageName)\n' +
    '            .takeIf { it != 0 } ?: applicationInfo.icon\n' +
    '        val builder = NotificationCompat.Builder(this, channelId)\n' +
    '            .setSmallIcon(iconId)\n' +
    '            .setContentTitle(title)\n' +
    '            .setContentText(body)\n' +
    '            .setStyle(NotificationCompat.BigTextStyle().bigText(body))\n' +
    '            .setAutoCancel(true)\n' +
    '            .setPriority(NotificationCompat.PRIORITY_HIGH)\n' +
    '        if (pi != null) builder.setContentIntent(pi)\n' +
    '        nm.notify(System.currentTimeMillis().toInt(), builder.build())\n' +
    '    }\n' +
    '}\n'
  );
}

function withSuprSendFcm(config) {
  config = withAppBuildGradle(config, (config) => {
    const dep = "    implementation 'com.google.firebase:firebase-messaging:24.0.1'";
    if (!config.modResults.contents.includes('firebase-messaging')) {
      config.modResults.contents = config.modResults.contents.replace(
        /dependencies\s*\{/,
        'dependencies {\n' + dep
      );
    }
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    (config) => {
      const packageName = config.android?.package ?? 'com.passaroo.app';
      const packagePath = packageName.split('.').join(path.sep);
      const javaRoot = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'java'
      );
      if (fs.existsSync(javaRoot)) {
        const cleanup = (dir) => {
          try {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) cleanup(full);
              else if (entry.name === 'SuprSendMessagingService.kt') {
                const expected = path.join(javaRoot, packagePath, 'SuprSendMessagingService.kt');
                if (full !== expected) fs.unlinkSync(full);
              }
            }
          } catch (_) {}
        };
        cleanup(javaRoot);
      }
      const kotlinDir = path.join(javaRoot, packagePath);
      fs.mkdirSync(kotlinDir, { recursive: true });
      fs.writeFileSync(
        path.join(kotlinDir, 'SuprSendMessagingService.kt'),
        buildKotlinSource(packageName)
      );
      return config;
    },
  ]);

  config = withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    if (!app.service) app.service = [];
    const serviceName = '.SuprSendMessagingService';
    if (!app.service.some((s) => s.$?.['android:name'] === serviceName)) {
      app.service.push({
        $: { 'android:name': serviceName, 'android:exported': 'false' },
        'intent-filter': [
          {
            $: { 'android:priority': '1' },
            action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }],
          },
        ],
      });
    }
    return config;
  });

  return config;
}

module.exports = withSuprSendFcm;
