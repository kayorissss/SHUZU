package com.shuzu.app;

import android.content.Context;
import android.os.Build;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Запуск встроенного ядра sing-box.
 *
 * Ядро лежит в APK как jniLibs/libsingbox_<abi>.so — Android разрешает
 * исполнять файлы из nativeLibraryDir (в отличие от каталога данных),
 * поэтому бинарник упакован именно так и запускается оттуда.
 */
final class CoreRunner {

    private static volatile Process process;
    private static Thread reader;
    private static final Deque<String> LOGS = new ArrayDeque<>();
    private static volatile String lastError;
    private static File workDir;

    private CoreRunner() {}

    static File binary(Context ctx) {
        String abi = Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "arm64-v8a";
        String name;
        if (abi.contains("arm64")) name = "libsingbox_arm64.so";
        else if (abi.contains("armeabi") || abi.equals("arm")) name = "libsingbox_arm.so";
        else if (abi.contains("x86_64")) name = "libsingbox_x64.so";
        else name = "libsingbox_x86.so";
        return new File(ctx.getApplicationInfo().nativeLibraryDir, name);
    }

    static File dir(Context ctx) {
        if (workDir == null) {
            workDir = new File(ctx.getFilesDir(), "core");
            if (!workDir.exists()) workDir.mkdirs();
        }
        return workDir;
    }

    static boolean isAvailable(Context ctx) {
        File f = binary(ctx);
        return f.exists() && f.canExecute();
    }

    static synchronized void log(String line) {
        synchronized (LOGS) {
            LOGS.addLast(line);
            while (LOGS.size() > 600) LOGS.removeFirst();
        }
    }

    static String[] logs() {
        synchronized (LOGS) {
            return LOGS.toArray(new String[0]);
        }
    }

    static String lastError() {
        return lastError;
    }

    static boolean isRunning() {
        return process != null && process.isAlive();
    }

    /** Запускает ядро с готовым конфигом и ждёт, пока откроется SOCKS-порт. */
    static synchronized boolean start(Context ctx, String configJson, int socksPort) {
        stop();
        lastError = null;
        File bin = binary(ctx);
        if (!bin.exists()) {
            lastError = "Ядро не найдено в APK (" + bin.getName() + "). Переустановите приложение.";
            log("ERROR " + lastError);
            return false;
        }
        if (!bin.canExecute()) {
            // на некоторых прошивках права снимаются — пытаемся вернуть
            //noinspection ResultOfMethodCallIgnored
            bin.setExecutable(true, false);
        }
        try {
            File cfg = new File(dir(ctx), "config.json");
            try (FileOutputStream out = new FileOutputStream(cfg)) {
                out.write(configJson.getBytes(StandardCharsets.UTF_8));
            }
            ProcessBuilder pb = new ProcessBuilder(
                    bin.getAbsolutePath(), "run", "-c", cfg.getAbsolutePath(), "-D", dir(ctx).getAbsolutePath());
            pb.directory(dir(ctx));
            pb.redirectErrorStream(true);
            pb.environment().put("ENABLE_DEPRECATED_LEGACY_DNS_SERVERS", "true");
            pb.environment().put("ENABLE_DEPRECATED_OUTBOUND_DOMAIN_RESOLVER", "true");
            process = pb.start();
            log("INFO ядро запущено: " + bin.getName());

            final Process p = process;
            reader = new Thread(() -> {
                try (BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = br.readLine()) != null) {
                        log(line);
                        String lower = line.toLowerCase();
                        if (lower.contains("error") || lower.contains("fatal")) {
                            lastError = line.length() > 300 ? line.substring(0, 300) : line;
                        }
                    }
                } catch (IOException ignored) {
                }
            }, "shuzu-core-log");
            reader.setDaemon(true);
            reader.start();

            // ждём готовности SOCKS-порта
            long deadline = System.currentTimeMillis() + 10000;
            while (System.currentTimeMillis() < deadline) {
                if (!process.isAlive()) {
                    lastError = lastError != null ? lastError : "Ядро завершилось при запуске";
                    return false;
                }
                if (portOpen(socksPort)) {
                    log("INFO ядро готово, порт " + socksPort);
                    return true;
                }
                try {
                    Thread.sleep(120);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
            lastError = lastError != null ? lastError : "Ядро не открыло локальный порт";
            stop();
            return false;
        } catch (IOException e) {
            lastError = "Не удалось запустить ядро: " + e.getMessage();
            log("ERROR " + lastError);
            stop();
            return false;
        }
    }

    private static boolean portOpen(int port) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress("127.0.0.1", port), 250);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    static synchronized void stop() {
        if (process != null) {
            try {
                process.destroy();
            } catch (Exception ignored) {
            }
            process = null;
        }
        log("INFO ядро остановлено");
    }
}
