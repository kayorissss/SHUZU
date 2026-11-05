package com.shuzu.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.VpnService;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

import hev.htproxy.TProxyService;

/**
 * VPN-служба SHUZU.
 *
 * Схема: VpnService создаёт TUN → hev-socks5-tunnel перекладывает пакеты в
 * локальный SOCKS5 → sing-box (встроенное ядро) отправляет их на сервер по
 * подписке. Свой собственный трафик исключаем через addDisallowedApplication,
 * поэтому SOCKS-соединение не зацикливается.
 */
public class ShuzuVpnService extends VpnService {

    public static final String ACTION_START = "com.shuzu.app.VPN_START";
    public static final String ACTION_STOP = "com.shuzu.app.VPN_STOP";
    public static final String ACTION_UPDATE = "com.shuzu.app.VPN_UPDATE";

    public static final String EXTRA_CONFIG = "singbox_config";
    public static final String EXTRA_SOCKS_PORT = "socks_port";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_SUBTITLE = "subtitle";

    private static final String CHANNEL_ID = "shuzu_vpn";
    private static final int NOTIFICATION_ID = 0x5A17;

    private static volatile boolean active = false;
    private static volatile long startedAt = 0;
    private static volatile String title = "SHUZU";
    private static volatile String subtitle = "Подключение…";
    private static volatile String lastError = null;

    private ParcelFileDescriptor tunFd;
    private Thread tunnelThread;

    /* ------------------------- публичное состояние ------------------------ */

    public static boolean isActive() {
        return active;
    }

    public static long startedAt() {
        return startedAt;
    }

    public static String lastError() {
        return lastError;
    }

    /** Статистика туннеля: [rxBytes, txBytes]. */
    public static long[] stats() {
        try {
            long[] s = TProxyService.TProxyGetStats();
            // порядок: tx_packets, tx_bytes, rx_packets, rx_bytes
            if (s != null && s.length >= 4) return new long[]{s[3], s[1]};
        } catch (Throwable ignored) {
        }
        return new long[]{0, 0};
    }

    public static void stop(Context ctx) {
        Intent intent = new Intent(ctx, ShuzuVpnService.class);
        intent.setAction(ACTION_STOP);
        ctx.startService(intent);
    }

    /* ----------------------------- жизненный цикл ------------------------- */

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm == null) return;
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "VPN-соединение", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Статус защищённого соединения SHUZU");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_SECRET);
            nm.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();

        if (ACTION_STOP.equals(action)) {
            stopEverything();
            return START_NOT_STICKY;
        }

        if (ACTION_UPDATE.equals(action)) {
            // меняем только текст плашки, не трогая туннель
            String newTitle = intent.getStringExtra(EXTRA_TITLE);
            String newSubtitle = intent.getStringExtra(EXTRA_SUBTITLE);
            if (newTitle != null) title = newTitle;
            if (newSubtitle != null) subtitle = newSubtitle;
            if (active) updateNotification();
            return START_STICKY;
        }

        // 1) Сразу поднимаем foreground — система требует это в течение 5 секунд
        title = intent.getStringExtra(EXTRA_TITLE) != null ? intent.getStringExtra(EXTRA_TITLE) : "SHUZU";
        subtitle = intent.getStringExtra(EXTRA_SUBTITLE) != null ? intent.getStringExtra(EXTRA_SUBTITLE) : "Подключение…";
        startForegroundCompat(buildNotification());

        String config = intent.getStringExtra(EXTRA_CONFIG);
        int socksPort = intent.getIntExtra(EXTRA_SOCKS_PORT, 10808);
        if (config == null) {
            fail("Нет конфигурации ядра");
            return START_NOT_STICKY;
        }

        // 2) Запускаем ядро и поднимаем TUN
        new Thread(() -> connect(config, socksPort), "shuzu-connect").start();
        return START_STICKY;
    }

    private void connect(String config, int socksPort) {
        try {
            // Разрешение проверяем до любых действий: без него нет смысла поднимать ядро.
            if (prepare(this) != null) {
                fail("Нет разрешения на VPN — включите его в системных настройках");
                return;
            }

            if (!CoreRunner.start(this, config, socksPort)) {
                fail(CoreRunner.lastError() != null ? CoreRunner.lastError() : "Ядро не запустилось");
                return;
            }

            VpnService.Builder builder = new Builder();
            builder.setSession("SHUZU");
            builder.addAddress("172.19.0.1", 30);
            builder.addAddress("fdfe:dcba:9876::1", 126);
            builder.addRoute("0.0.0.0", 0);
            builder.addRoute("::", 0);
            builder.addDnsServer("1.1.1.1");
            builder.addDnsServer("8.8.8.8");
            builder.setMtu(1500);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                builder.setMetered(false);
            }
            try {
                builder.addDisallowedApplication(getPackageName());
            } catch (Exception ignored) {
                // если не удалось — трафик приложения пойдёт через туннель (может зациклиться),
                // поэтому это критично логируем
                CoreRunner.log("WARN не удалось исключить собственный трафик");
            }

            tunFd = builder.establish();
            if (tunFd == null) {
                fail("Система не дала создать VPN-интерфейс");
                return;
            }

            // 3) hev-socks5-tunnel: TUN -> локальный SOCKS5 ядра
            File hevConfig = new File(CoreRunner.dir(this), "hev.yml");
            String yaml = buildHevConfig(socksPort);
            try (FileOutputStream out = new FileOutputStream(hevConfig)) {
                out.write(yaml.getBytes(StandardCharsets.UTF_8));
            }

            final int fd = tunFd.getFd();
            // active выставляем до старта туннеля, иначе мгновенная ошибка в потоке
            // успела бы вызвать fail() раньше и состояние «залипло» бы включённым
            active = true;
            startedAt = System.currentTimeMillis();
            tunnelThread = new Thread(() -> {
                try {
                    TProxyService.TProxyStartService(hevConfig.getAbsolutePath(), fd);
                    if (active) {
                        fail("Туннель остановился неожиданно");
                    }
                } catch (Throwable t) {
                    if (active) {
                        fail("Туннель остановился: " + (t.getMessage() != null ? t.getMessage() : t.getClass().getSimpleName()));
                    }
                }
            }, "shuzu-tunnel");
            tunnelThread.start();

            lastError = null;
            subtitle = "Защищено";
            updateNotification();
            CoreRunner.log("INFO VPN активен");
        } catch (Throwable t) {
            fail(t.getMessage() != null ? t.getMessage() : "Неизвестная ошибка подключения");
        }
    }

    private String buildHevConfig(int socksPort) {
        return "tunnel:\n"
                + "  name: tun0\n"
                + "  mtu: 1500\n"
                + "  ipv4: 172.19.0.1\n"
                + "  ipv6: 'fdfe:dcba:9876::1'\n"
                + "  icmp: 'reply'\n"
                + "\n"
                + "socks5:\n"
                + "  port: " + socksPort + "\n"
                + "  address: 127.0.0.1\n"
                + "  udp: 'udp'\n"
                + "  pipeline: true\n"
                + "  tcp-fastopen: true\n"
                + "\n"
                + "misc:\n"
                + "  log-level: 'warn'\n"
                + "  log-file: 'stderr'\n"
                + "  task-stack-size: 204800\n"
                + "  connect-timeout: 8000\n"
                + "  tcp-buffer-size: 131072\n"
                + "  max-session-count: 0\n";
    }

    private void fail(String message) {
        lastError = message;
        subtitle = "Ошибка";
        CoreRunner.log("ERROR " + message);
        stopEverything();
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                        .setSmallIcon(R.drawable.ic_stat_shuzu)
                        .setContentTitle("SHUZU: не удалось подключиться")
                        .setContentText(message)
                        .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
                        .setAutoCancel(true)
                        .setPriority(NotificationCompat.PRIORITY_HIGH);
                nm.notify(NOTIFICATION_ID + 1, b.build());
            }
        } catch (Throwable ignored) {
        }
    }

    private void stopEverything() {
        active = false;
        startedAt = 0;
        try {
            TProxyService.TProxyStopService();
        } catch (Throwable ignored) {
        }
        try {
            if (tunFd != null) tunFd.close();
        } catch (Exception ignored) {
        }
        tunFd = null;
        CoreRunner.stop();
        try {
            stopForeground(true);
        } catch (Throwable ignored) {
        }
        stopSelf();
    }

    @Override
    public void onRevoke() {
        // пользователь отключил VPN в системных настройках или другой клиент перехватил
        stopEverything();
        super.onRevoke();
    }

    @Override
    public void onDestroy() {
        active = false;
        try {
            TProxyService.TProxyStopService();
        } catch (Throwable ignored) {
        }
        CoreRunner.stop();
        try {
            if (tunFd != null) tunFd.close();
        } catch (Exception ignored) {
        }
        tunFd = null;
        super.onDestroy();
    }

    /* ----------------------------- уведомление --------------------------- */

    private void startForegroundCompat(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // VPN-приложение обязано указать тип foreground-службы.
            // specialUse — документированный тип без дополнительных условий.
            startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void updateNotification() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIFICATION_ID, buildNotification());
        } catch (Throwable ignored) {
        }
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                this, 0, openIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT);

        Intent stopIntent = new Intent(this, ShuzuVpnService.class).setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(
                this, 1, stopIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT);

        RemoteViews views = new RemoteViews(getPackageName(), R.layout.notification_vpn);
        views.setTextViewText(R.id.notif_title, title);
        views.setTextViewText(R.id.notif_subtitle, subtitle);
        views.setTextViewText(R.id.notif_stop, "Отключить");
        views.setOnClickPendingIntent(R.id.notif_stop, stopPending);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_shuzu)
                .setContentTitle(title)
                .setContentText(subtitle)
                .setContentIntent(contentIntent)
                .setOngoing(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_SECRET)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setOnlyAlertOnce(true)
                .setCustomContentView(views)
                .setCustomBigContentView(views);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            builder.setCustomHeadsUpContentView(views);
        }
        return builder.build();
    }
}
