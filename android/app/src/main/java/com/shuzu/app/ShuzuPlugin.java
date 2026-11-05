package com.shuzu.app;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.net.VpnService;
import android.os.Build;
import android.os.PowerManager;
import androidx.activity.result.ActivityResult;
import androidx.core.app.NotificationCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.zip.GZIPInputStream;

/**
 * Нативный мост Android для SHUZU.
 *
 * В WebView нет ни raw-TCP, ни доступа к VPN, поэтому все «системные» операции
 * (загрузка подписок, замер TCP-пинга, запуск туннеля, уведомления) живут здесь.
 */
@CapacitorPlugin(name = "Shuzu")
public class ShuzuPlugin extends Plugin {

    private static final String CHANNEL_ID = "shuzu_service";

    /* --------------------------------- info -------------------------------- */

    @PluginMethod
    public void info(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            ret.put("version", info.versionName);
            ret.put("versionCode", Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode);
        } catch (Exception e) {
            ret.put("version", "0.0.0");
        }
        ret.put("platform", "android");
        ret.put("sdk", Build.VERSION.SDK_INT);
        ret.put("device", Build.MANUFACTURER + " " + Build.MODEL);
        ret.put("abi", Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "");
        ret.put("coreReady", CoreRunner.isAvailable(getContext()));
        ret.put("corePath", CoreRunner.binary(getContext()).getAbsolutePath());
        ret.put("vpnActive", ShuzuVpnService.isActive());
        call.resolve(ret);
    }

    /* ------------------------------- http ---------------------------------- */

    @PluginMethod
    public void httpGet(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("url required");
            return;
        }
        String method = call.getString("method", "GET");
        int timeout = call.getInt("timeout", 20000);
        JSObject headersObj = call.getObject("headers", new JSObject());
        try {
            JSObject result = doHttp(url, method, headersObj, timeout);
            call.resolve(result);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "network error", "network", e);
        }
    }

    private JSObject doHttp(String url, String method, JSObject headers, int timeout) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(timeout);
        conn.setReadTimeout(timeout);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("User-Agent", "SHUZU/1.0 (Android)");
        conn.setRequestProperty("Accept-Encoding", "gzip");
        if (headers != null) {
            java.util.Iterator<String> headerKeys = headers.keys();
            while (headerKeys.hasNext()) {
                String key = headerKeys.next();
                Object v = headers.get(key);
                if (v != null) conn.setRequestProperty(key, String.valueOf(v));
            }
        }
        int status = conn.getResponseCode();
        InputStream raw;
        if (status >= 400) {
            raw = conn.getErrorStream();
        } else {
            raw = conn.getInputStream();
        }
        String body = "";
        if (raw != null) {
            String encoding = conn.getContentEncoding();
            InputStream in = "gzip".equalsIgnoreCase(encoding) ? new GZIPInputStream(raw) : raw;
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int read;
            while ((read = in.read(chunk)) > 0) {
                buffer.write(chunk, 0, read);
            }
            in.close();
            body = buffer.toString("UTF-8");
        }

        JSObject out = new JSObject();
        out.put("status", status);
        out.put("body", body);
        JSObject respHeaders = new JSObject();
        for (Map.Entry<String, List<String>> e : conn.getHeaderFields().entrySet()) {
            if (e.getKey() == null || e.getValue() == null || e.getValue().isEmpty()) continue;
            respHeaders.put(e.getKey().toLowerCase(), e.getValue().get(0));
        }
        out.put("headers", respHeaders);
        conn.disconnect();
        return out;
    }

    /* -------------------------------- ping --------------------------------- */

    @PluginMethod
    public void tcpPing(PluginCall call) {
        JSArray targets = call.getArray("targets");
        if (targets == null) {
            call.reject("targets required");
            return;
        }
        int timeout = call.getInt("timeout", 4000);
        try {
            int count = targets.length();
            final JSArray results = new JSArray();
            ExecutorService pool = Executors.newFixedThreadPool(Math.min(8, Math.max(1, count)));
            final CountDownLatch latch = new CountDownLatch(count);
            final JSObject[] slots = new JSObject[count];

            for (int i = 0; i < count; i++) {
                final int index = i;
                final JSObject target = JSObject.fromJSONObject(targets.getJSONObject(i));
                pool.submit(() -> {
                    String host = target.getString("host");
                    int port = target.optInt("port", 443);
                    JSObject r = new JSObject();
                    r.put("host", host);
                    r.put("port", port);
                    long started = System.nanoTime();
                    try (Socket socket = new Socket()) {
                        socket.connect(new InetSocketAddress(host, port), timeout);
                        r.put("ms", (int) ((System.nanoTime() - started) / 1_000_000));
                    } catch (Exception e) {
                        r.put("ms", (Object) null);
                        r.put("error", e.getMessage() != null ? e.getMessage() : "connect failed");
                    }
                    slots[index] = r;
                    latch.countDown();
                });
            }
            latch.await(timeout + 3000L, TimeUnit.MILLISECONDS);
            pool.shutdownNow();
            for (JSObject slot : slots) {
                if (slot != null) results.put(slot);
            }
            JSObject out = new JSObject();
            out.put("results", results);
            call.resolve(out);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "ping failed");
        }
    }

    @PluginMethod
    public void dnsResolve(PluginCall call) {
        String host = call.getString("host");
        if (host == null) {
            call.reject("host required");
            return;
        }
        try {
            long started = System.nanoTime();
            InetAddress[] addresses = InetAddress.getAllByName(host);
            JSArray list = new JSArray();
            for (InetAddress a : addresses) {
                list.put(a.getHostAddress());
            }
            JSObject out = new JSObject();
            out.put("addresses", list);
            out.put("ms", (int) ((System.nanoTime() - started) / 1_000_000));
            call.resolve(out);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "dns failed");
        }
    }

    /* ------------------------------- VPN ----------------------------------- */

    @PluginMethod
    public void ensureVpnPermission(PluginCall call) {
        try {
            Intent intent = VpnService.prepare(getContext());
            JSObject out = new JSObject();
            if (intent == null) {
                out.put("granted", true);
                call.resolve(out);
                return;
            }
            startActivityForResult(call, intent, "vpnPermissionResult");
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "vpn permission failed");
        }
    }

    @ActivityCallback
    public void vpnPermissionResult(PluginCall call, ActivityResult result) {
        JSObject out = new JSObject();
        out.put("granted", result.getResultCode() == Activity.RESULT_OK);
        if (call != null) call.resolve(out);
    }

    @PluginMethod
    public void startVpn(PluginCall call) {
        String config = call.getString("config");
        Integer socksPort = call.getInt("socksPort", 10808);
        String title = call.getString("title", "SHUZU");
        String subtitle = call.getString("subtitle", "Подключение…");
        if (config == null) {
            call.reject("config required");
            return;
        }
        try {
            Intent intent = new Intent(getContext(), ShuzuVpnService.class);
            intent.setAction(ShuzuVpnService.ACTION_START);
            intent.putExtra(ShuzuVpnService.EXTRA_CONFIG, config);
            intent.putExtra(ShuzuVpnService.EXTRA_SOCKS_PORT, socksPort);
            intent.putExtra(ShuzuVpnService.EXTRA_TITLE, title);
            intent.putExtra(ShuzuVpnService.EXTRA_SUBTITLE, subtitle);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            JSObject out = new JSObject();
            out.put("started", true);
            call.resolve(out);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "start failed");
        }
    }

    @PluginMethod
    public void stopVpn(PluginCall call) {
        try {
            ShuzuVpnService.stop(getContext());
            JSObject out = new JSObject();
            out.put("stopped", true);
            call.resolve(out);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "stop failed");
        }
    }

    @PluginMethod
    public void vpnState(PluginCall call) {
        JSObject out = new JSObject();
        out.put("active", ShuzuVpnService.isActive());
        out.put("startedAt", ShuzuVpnService.startedAt());
        out.put("error", ShuzuVpnService.lastError());
        long[] stats = ShuzuVpnService.stats();
        out.put("rx", stats[0]);
        out.put("tx", stats[1]);
        out.put("coreRunning", CoreRunner.isRunning());
        out.put("coreError", CoreRunner.lastError());
        call.resolve(out);
    }

    @PluginMethod
    public void logs(PluginCall call) {
        JSArray arr = new JSArray();
        for (String line : CoreRunner.logs()) arr.put(line);
        JSObject out = new JSObject();
        out.put("lines", arr);
        call.resolve(out);
    }

    @PluginMethod
    public void updateNotification(PluginCall call) {
        // обновляем текст плашки (например, когда стал известен пинг), туннель не трогаем
        String subtitle = call.getString("subtitle");
        String title = call.getString("title");
        if (ShuzuVpnService.isActive() && (subtitle != null || title != null)) {
            Intent intent = new Intent(getContext(), ShuzuVpnService.class);
            intent.setAction(ShuzuVpnService.ACTION_UPDATE);
            if (subtitle != null) intent.putExtra(ShuzuVpnService.EXTRA_SUBTITLE, subtitle);
            if (title != null) intent.putExtra(ShuzuVpnService.EXTRA_TITLE, title);
            try {
                getContext().startService(intent);
            } catch (Exception ignored) {
            }
        }
        call.resolve(new JSObject());
    }

    /** Разрешение на уведомления (Android 13+): нужно для плашки со статусом VPN. */
    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        JSObject out = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            out.put("granted", true);
            call.resolve(out);
            return;
        }
        boolean granted = androidx.core.content.ContextCompat.checkSelfPermission(getContext(),
                android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED;
        out.put("granted", granted);
        call.resolve(out);
    }

    /* --------------------------- уведомления ------------------------------- */

    @PluginMethod
    public void notify(PluginCall call) {
        String title = call.getString("title", "SHUZU");
        String body = call.getString("body", "");
        try {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) {
                call.resolve(new JSObject());
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "SHUZU", NotificationManager.IMPORTANCE_DEFAULT);
                nm.createNotificationChannel(channel);
            }
            NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_stat_shuzu)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT);
            nm.notify((int) (System.currentTimeMillis() % 100000), builder.build());
        } catch (Exception ignored) {
        }
        call.resolve(new JSObject());
    }

    /* ----------------------------- обновления ------------------------------ */

    @PluginMethod
    public void downloadApk(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName", "shuzu-update.apk");
        if (url == null) {
            call.reject("url required");
            return;
        }
        try {
            File dir = getContext().getExternalFilesDir("updates");
            if (dir == null) dir = getContext().getCacheDir();
            if (!dir.exists()) dir.mkdirs();
            File out = new File(dir, fileName);
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(60000);
            conn.setRequestProperty("User-Agent", "SHUZU-updater");
            conn.setInstanceFollowRedirects(true);
            try (InputStream in = conn.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                byte[] buffer = new byte[16384];
                int read;
                while ((read = in.read(buffer)) > 0) {
                    os.write(buffer, 0, read);
                }
            }
            JSObject ret = new JSObject();
            ret.put("path", out.getAbsolutePath());
            ret.put("size", out.length());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "download failed");
        }
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("path required");
            return;
        }
        try {
            File file = new File(path);
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject());
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "install failed");
        }
    }

    /* ----------------------------- системное ------------------------------- */

    @PluginMethod
    public void batteryOptimization(PluginCall call) {
        JSObject out = new JSObject();
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            out.put("ignoring", Build.VERSION.SDK_INT >= 23 && pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        } catch (Exception e) {
            out.put("ignoring", false);
        }
        call.resolve(out);
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        try {
            Intent intent = new Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception ignored) {
        }
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url != null) {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } catch (Exception ignored) {
            }
        }
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void quitApp(PluginCall call) {
        call.resolve(new JSObject());
        try {
            // сначала гасим туннель, иначе служба останется висеть в статус-баре
            ShuzuVpnService.stop(getContext());
        } catch (Exception ignored) {
        }
        try {
            getActivity().finishAffinity();
            System.exit(0);
        } catch (Exception ignored) {
        }
    }
}
