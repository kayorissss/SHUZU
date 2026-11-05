package com.shuzu.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import android.webkit.PermissionRequest;
import android.webkit.WebView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Главная активити: только WebView-интерфейс + разрешения, которые нужны
 * для VPN, уведомлений и сканирования QR-кода камерой.
 */
public class MainActivity extends BridgeActivity {

    private static final int REQ_NOTIFICATIONS = 1001;
    private static final int REQ_CAMERA = 1002;

    private PermissionRequest pendingCameraRequest;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShuzuPlugin.class);
        super.onCreate(savedInstanceState);

        // тёмные системные панели в тон интерфейсу — без белых полос на стыке
        getWindow().setStatusBarColor(Color.parseColor("#08080A"));
        getWindow().setNavigationBarColor(Color.parseColor("#08080A"));
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(decor.getSystemUiVisibility() & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }

        try {
            WebView web = getBridge().getWebView();
            web.setBackgroundColor(Color.parseColor("#08080A"));
            web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        } catch (Throwable ignored) {
        }

        // WebView должен уметь отдавать камеру в getUserMedia (сканирование QR)
        try {
            getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> {
                        if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                                != PackageManager.PERMISSION_GRANTED) {
                            pendingCameraRequest = request;
                            ActivityCompat.requestPermissions(MainActivity.this,
                                    new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                        } else {
                            request.grant(request.getResources());
                        }
                    });
                }
            });
        } catch (Throwable ignored) {
            // если внутренний API изменится — QR-скан просто не откроется, остальное работает
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA && pendingCameraRequest != null) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                pendingCameraRequest.grant(pendingCameraRequest.getResources());
            } else {
                pendingCameraRequest.deny();
            }
            pendingCameraRequest = null;
        }
    }
}
