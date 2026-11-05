#!/usr/bin/env bash
# Скачивание ядер в сборку.
#
# 1. sing-box CLI для Windows x64 (ядро для .exe) + wintun.dll
# 2. sing-box android-<abi> — ядро для APK (кладётся в jniLibs как libsingbox_*.so)
# 3. hev-socks5-tunnel.aar — tun2socks для Android
#
# Запускается в CI (и локально при наличии интернета). В репозитории бинарники
# не хранятся: они тянутся на этапе сборки, поэтому обновление ядра — это
# изменение одной переменной SINGBOX_VERSION.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SINGBOX_VERSION="${SINGBOX_VERSION:-1.14.4}"
HEV_VERSION="${HEV_VERSION:-3.0.1}"
OUT_WIN="$ROOT/cores/win-x64"
OUT_ANDROID="$ROOT/android/app/src/main/jniLibs"
OUT_LIBS="$ROOT/android/app/libs"
CACHE="${SHUZU_CACHE:-$ROOT/.cache/cores}"

mkdir -p "$CACHE" "$OUT_WIN" "$OUT_ANDROID" "$OUT_LIBS"

log() { echo -e "\033[36m[cores]\033[0m $*"; }
warn() { echo -e "\033[33m[cores]\033[0m $*" >&2; }

unzip_any() {
  local archive="$1" dest="$2"
  if command -v unzip >/dev/null 2>&1; then
    unzip -q -o "$archive" -d "$dest"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$archive" "$dest"
  elif command -v powershell >/dev/null 2>&1; then
    powershell -NoProfile -Command "Expand-Archive -Force -LiteralPath '$archive' -DestinationPath '$dest'"
  else
    warn "нет инструмента для распаковки $archive"
    return 1
  fi
}

fetch() {
  local url="$1" dest="$2"
  if [ -f "$dest" ] && [ -s "$dest" ]; then
    log "уже есть: $(basename "$dest")"
    return 0
  fi
  log "скачиваю $(basename "$dest")"
  curl -fsSL --retry 3 --retry-delay 2 -o "$dest.part" "$url"
  mv "$dest.part" "$dest"
}

# ---------- sing-box для Windows ----------
WIN_ZIP="$CACHE/sing-box-$SINGBOX_VERSION-windows-amd64.zip"
fetch "https://github.com/SagerNet/sing-box/releases/download/v$SINGBOX_VERSION/sing-box-$SINGBOX_VERSION-windows-amd64.zip" "$WIN_ZIP"
TMP_WIN="$(mktemp -d)"
unzip_any "$WIN_ZIP" "$TMP_WIN"
SB_WIN="$(find "$TMP_WIN" -name 'sing-box.exe' -print -quit)"
if [ -n "$SB_WIN" ]; then
  cp -f "$SB_WIN" "$OUT_WIN/sing-box.exe"
  chmod +x "$OUT_WIN/sing-box.exe"
  log "sing-box.exe: $("$OUT_WIN/sing-box.exe" version 2>/dev/null | head -1 || echo 'Windows-бинарник')"
else
  warn "sing-box.exe не найден в архиве"
  exit 1
fi
rm -rf "$TMP_WIN"

# wintun.dll — нужен для TUN-режима на Windows
WINTUN_ZIP="$CACHE/wintun.zip"
if curl -fsSL --retry 2 -o "$WINTUN_ZIP.part" "https://www.wintun.net/builds/wintun-0.14.1.zip" 2>/dev/null; then
  mv "$WINTUN_ZIP.part" "$WINTUN_ZIP"
  TMP_W="$(mktemp -d)"
  unzip_any "$WINTUN_ZIP" "$TMP_W"
  cp -f "$(find "$TMP_W" -path '*amd64/wintun.dll' -print -quit)" "$OUT_WIN/wintun.dll" || warn "wintun.dll не найден"
  rm -rf "$TMP_W"
else
  warn "не удалось скачать wintun.dll — TUN-режим может не работать (системный прокси останется доступен)"
  rm -f "$WINTUN_ZIP.part"
fi

# ---------- sing-box для Android ----------
declare -A ABI_MAP=( [arm64]="arm64-v8a:libsingbox_arm64.so" [arm]="armeabi-v7a:libsingbox_arm.so" [amd64]="x86_64:libsingbox_x64.so" [386]="x86:libsingbox_x86.so" )
for abi in "${!ABI_MAP[@]}"; do
  IFS=':' read -r dir name <<< "${ABI_MAP[$abi]}"
  tar="$CACHE/sing-box-$SINGBOX_VERSION-android-$abi.tar.gz"
  if ! fetch "https://github.com/SagerNet/sing-box/releases/download/v$SINGBOX_VERSION/sing-box-$SINGBOX_VERSION-android-$abi.tar.gz" "$tar"; then
    warn "нет android-$abi"
    continue
  fi
  tmp="$(mktemp -d)"
  tar -xzf "$tar" -C "$tmp"
  bin="$(find "$tmp" -name 'sing-box' -type f -print -quit)"
  if [ -n "$bin" ]; then
    mkdir -p "$OUT_ANDROID/$dir"
    cp -f "$bin" "$OUT_ANDROID/$dir/$name"
    chmod +x "$OUT_ANDROID/$dir/$name"
    log "ядро Android $dir -> $name ($(du -h "$bin" | cut -f1))"
  else
    warn "бинарник для $abi не найден в архиве"
  fi
  rm -rf "$tmp"
done

# ---------- hev-socks5-tunnel (tun2socks) ----------
HEV_AAR="$OUT_LIBS/hev-socks5-tunnel.aar"
HEV_URLS=(
  "https://github.com/heiher/hev-socks5-tunnel/releases/download/$HEV_VERSION/hev-socks5-tunnel.aar"
  "https://github.com/heiher/hev-socks5-tunnel/releases/latest/download/hev-socks5-tunnel.aar"
  "https://github.com/heiher/hev-socks5-tunnel/releases/download/snapshot/hev-socks5-tunnel.aar"
  "https://github.com/heiher/hev-socks5-tunnel/releases/download/$HEV_VERSION/hev-socks5-tunnel-$HEV_VERSION.aar"
)
ok=0
for url in "${HEV_URLS[@]}"; do
  if curl -fsSL --retry 2 -o "$HEV_AAR.part" "$url"; then
    if unzip -l "$HEV_AAR.part" >/dev/null 2>&1; then
      mv "$HEV_AAR.part" "$HEV_AAR"
      log "hev-socks5-tunnel.aar: $(du -h "$HEV_AAR" | cut -f1)"
      ok=1
      break
    fi
  fi
  rm -f "$HEV_AAR.part"
done

if [ "$ok" != "1" ]; then
  warn "готовый AAR недоступен — собираю hev-socks5-tunnel из исходников"
  if [ -z "${ANDROID_NDK_HOME:-}" ] && [ -n "${ANDROID_NDK_ROOT:-}" ]; then
    ANDROID_NDK_HOME="$ANDROID_NDK_ROOT"
  fi
  if [ -z "${ANDROID_NDK_HOME:-}" ]; then
    warn "ANDROID_NDK_HOME не задан: tun2socks собрать не из чего"
    exit 1
  fi

  SRC="$CACHE/hev-src"
  rm -rf "$SRC"
  git clone --depth 1 --recursive https://github.com/heiher/hev-socks5-tunnel "$SRC"

  AAR_DIR="$CACHE/hev-aar"
  rm -rf "$AAR_DIR"
  mkdir -p "$AAR_DIR/jni"

  for abi in arm64-v8a armeabi-v7a x86_64; do
    build="$CACHE/hev-build-$abi"
    rm -rf "$build"
    cmake -S "$SRC" -B "$build" \
      -DCMAKE_TOOLCHAIN_FILE="$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake" \
      -DANDROID_ABI="$abi" -DANDROID_PLATFORM=android-22 \
      -DCMAKE_BUILD_TYPE=Release >/dev/null
    cmake --build "$build" -j"$(nproc)" >/dev/null
    so="$(find "$build" -name 'libhev-socks5-tunnel.so' -print -quit)"
    if [ -z "$so" ]; then
      warn "не собрался .so для $abi"
      exit 1
    fi
    mkdir -p "$AAR_DIR/jni/$abi"
    cp -f "$so" "$AAR_DIR/jni/$abi/libhev-socks5-tunnel.so"
  done

  # Java-обёртка: AAR должен содержать класс hev.htproxy.TProxyService
  mkdir -p "$CACHE/hev-java/hev/htproxy"
  cat > "$CACHE/hev-java/hev/htproxy/TProxyService.java" <<'JAVA'
package hev.htproxy;

/** Обёртка над JNI tun2socks: используется службой VPN. */
public final class TProxyService {
    public static native boolean TProxyStartService(String configPath, int fd);
    public static native boolean TProxyStopService();
    public static native boolean TProxyIsRunning();
    public static native long[] TProxyGetStats();
    static { System.loadLibrary("hev-socks5-tunnel"); }
}
JAVA
  ( cd "$CACHE/hev-java" && javac -source 8 -target 8 -nowarn -d classes hev/htproxy/TProxyService.java 2>/dev/null \
      && jar cf "$AAR_DIR/classes.jar" -C classes . )
  cat > "$AAR_DIR/AndroidManifest.xml" <<'XML'
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="hev.htproxy" />
XML
  ( cd "$AAR_DIR" && zip -qr "$HEV_AAR" AndroidManifest.xml classes.jar jni )
  log "AAR собран из исходников: $(du -h "$HEV_AAR" | cut -f1)"
fi

log "готово"
