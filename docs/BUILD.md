# Сборка и релизы

## Что нужно

| Инструмент | Версия | Зачем |
|---|---|---|
| Node.js | 20+ (в CI 22) | всё: интерфейс, Electron, скрипты |
| JDK | 17 | Android |
| Android SDK | Platform 34, Build-Tools 34 | Android |
| Интернет | при сборке | `scripts/fetch-cores.sh` скачивает ядра |

NDK нужен только как резервный путь: если релизный AAR tun2socks недоступен,
`fetch-cores.sh` соберёт его из исходников через CMake + NDK.

## Локальная сборка

```bash
npm ci

# 1. Ядра: sing-box.exe + wintun.dll (cores/win-x64), .so для Android, hev AAR
npm run cores

# 2. Windows-установщик
npm run dist:win          # → release/SHUZU-Setup-<version>-x64.exe

# 3. Android
npm run android:sync
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

Версия берётся из `package.json` — она же попадает в `versionName`/`versionCode` APK и в имя
установщика. Перед релизом поднимите версию:

```bash
npm version patch --no-git-tag-version
```

## Проверки

```bash
npm run typecheck    # tsc --noEmit
npm test             # 29 тестов логики: парсер, конфиг, качество, диагностика, блокировки
npm run check:java   # синтаксис Java-исходников Android (без JDK)
npm run smoke        # рендер интерфейса в jsdom
npm run check:config # генерация .cache/configs/*.json для sing-box check
npm run verify       # всё вместе
```

`node scripts/check-config.mjs` создаёт пять вариантов конфига (TUN, прокси, Android, свой DNS,
системный DNS) из девяти ссылок разных протоколов. CI прогоняет их через
`sing-box check` — так невалидный конфиг не попадёт в релиз.

## GitHub Actions

| Workflow | Когда | Что делает |
|---|---|---|
| `ci.yml` | push в `main`, PR | типы, тесты, Java, смоук, сборка, `sing-box check`, debug APK |
| `release.yml` | тег `v*.*.*` или вручную | .exe + .apk → GitHub Release с заметками и SHA256 |

### Подпись Android

Добавьте секреты репозитория — CI сам подставит их в `android/keystore.properties`:

| Секрет | Значение |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | пароль хранилища |
| `ANDROID_KEY_ALIAS` | алиас ключа |
| `ANDROID_KEY_PASSWORD` | пароль ключа |

Без секретов APK подписывается debug-ключом: установить можно, обновлять поверх другой
подписи — нет.

### Подпись Windows

Не настроена: `CSC_IDENTITY_AUTO_DISCOVERY=false`, SmartScreen покажет предупреждение.
Если появится сертификат, достаточно добавить `WIN_CSC_LINK` и `WIN_CSC_KEY_PASSWORD`.

## Как обновляется ядро

Версия ядра — одна переменная в `scripts/fetch-cores.sh` (`SINGBOX_VERSION`), она же
в `env` обоих workflow. Обновление: поменять версию → прогнать `npm run verify` и
`npm run check:config` → релиз.

## Структура репозитория

```
electron/      main-процесс: ядро, сеть, диагностика, обновления, трей
shared/        типы + вся логика, общая для ПК, Android и main-процесса
src/           React-интерфейс (компоненты, экраны, стили, движок)
android/       проект Capacitor: Java-служба VPN, ресурсы, иконки
scripts/       сборка карты и иконок, ядра, тесты, смоук, релизные заметки
resources/     логотип и готовые иконки (.ico, .png), трей
public/        шрифты, флаги, favicon
```
