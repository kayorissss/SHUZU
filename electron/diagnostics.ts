/**
 * Диагностика системы: ищет причины, по которым VPN не работает
 * на конкретном компьютере (а на телефоне при этом работает).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import dns from 'node:dns/promises';
import type { DiagCheck, DiagReport, Server } from '../shared/types';
import { buildReport } from '../shared/diag';
import { core } from './core';
import { httpProbe, run, tcpConnect, getSystemProxy } from './net';
import { getServers, getSubscriptions, getSettings } from './store';

const isWin = process.platform === 'win32';

function check(partial: Omit<DiagCheck, 'status'> & { status: DiagCheck['status'] }): DiagCheck {
  return partial;
}

async function checkCore(servers: Server[]): Promise<DiagCheck[]> {
  const out: DiagCheck[] = [];
  const bin = core.corePath();
  const ready = existsSync(bin);
  out.push(
    check({
      id: 'core-missing',
      title: 'Ядро sing-box',
      group: 'core',
      weight: 26,
      status: ready ? 'ok' : 'fail',
      detail: ready ? `Найдено: ${bin}` : 'Исполняемый файл ядра отсутствует в папке программы.',
      fix: ready ? undefined : 'Переустановите SHUZU из официального релиза — ядро входит в комплект.',
    }),
  );

  if (ready) {
    const ver = await new Promise<string>((resolve) => {
      run(bin, ['version'], 8000).then((r) => resolve((r.out || r.err).split('\n')[0]?.trim() ?? ''));
    });
    out.push(
      check({
        id: 'core-version',
        title: 'Версия ядра',
        group: 'core',
        weight: 4,
        status: ver ? 'ok' : 'warn',
        detail: ver || 'Не удалось получить версию ядра.',
      }),
    );
    if (isWin) {
      const wintun = existsSync(join(bin, '..', 'wintun.dll'));
      out.push(
        check({
          id: 'wintun',
          title: 'Драйвер wintun',
          group: 'core',
          weight: getSettings().mode === 'tun' ? 12 : 2,
          status: wintun ? 'ok' : getSettings().mode === 'tun' ? 'fail' : 'warn',
          detail: wintun ? 'wintun.dll найден рядом с ядром.' : 'wintun.dll не найден — режим TUN не сможет создать адаптер.',
          fix: wintun ? undefined : 'Переустановите SHUZU. Если используете портативную версию — распакуйте архив целиком, не только .exe.',
        }),
      );
    }
  }

  const unsupported = servers.filter((s) => s.protocol === 'shadowsocksr');
  if (unsupported.length) {
    out.push(
      check({
        id: 'ssr',
        title: 'Неподдерживаемые серверы',
        group: 'core',
        weight: 0,
        status: 'warn',
        detail: `Серверов ShadowsocksR: ${unsupported.length}. Ядро их не поддерживает.`,
        fix: 'Попросите провайдера выдать VLESS/Hysteria2 или удалите такие серверы.',
      }),
    );
  }

  const lastErr = core.getLastError();
  if (lastErr && /tun|adapter|wintun/i.test(lastErr)) {
    out.push(
      check({
        id: 'tun-fail',
        title: 'Создание TUN-интерфейса',
        group: 'core',
        weight: 10,
        status: 'fail',
        detail: lastErr.slice(0, 300),
        fix: 'Перезагрузите компьютер, отключите другие VPN-клиенты и попробуйте режим «Системный прокси».',
      }),
    );
  }
  return out;
}

async function checkAdmin(): Promise<DiagCheck> {
  if (!isWin) {
    return check({ id: 'admin', title: 'Права администратора', group: 'system', weight: 0, status: 'info', detail: 'Проверка доступна только в Windows.' });
  }
  const res = await run('net', ['session'], 5000);
  const admin = res.code === 0;
  const tun = getSettings().mode === 'tun';
  return check({
    id: 'admin',
    title: 'Права администратора',
    group: 'system',
    weight: tun ? 10 : 2,
    status: admin ? 'ok' : tun ? 'fail' : 'warn',
    detail: admin ? 'Программа запущена с повышенными правами.' : 'Программа запущена без прав администратора.',
    fix: admin ? undefined : tun ? 'Нажмите «От администратора» внизу или выберите режим «Системный прокси».' : 'Для режима TUN потребуется перезапуск от администратора.',
  });
}

async function checkNet(): Promise<DiagCheck[]> {
  const out: DiagCheck[] = [];
  let dnsOk = false;
  try {
    const a = await dns.resolve4('www.google.com');
    dnsOk = a.length > 0;
  } catch {
    dnsOk = false;
  }
  let tcp = false;
  try {
    await tcpConnect('1.1.1.1', 443, 4000);
    tcp = true;
  } catch {
    try {
      await tcpConnect('77.88.8.8', 443, 4000);
      tcp = true;
    } catch {
      tcp = false;
    }
  }
  const http = await httpProbe('https://www.gstatic.com/generate_204', 6000);

  out.push(
    check({
      id: 'net',
      title: 'Доступ в интернет',
      group: 'network',
      weight: 24,
      status: tcp || http.ok ? 'ok' : 'fail',
      detail: tcp
        ? `TCP работает, HTTPS ${http.ok ? 'отвечает' : 'не отвечает'} (${http.ms ?? '—'} мс).`
        : 'Нет исходящих TCP-соединений вообще.',
      fix: tcp ? undefined : 'Проверьте кабель/Wi-Fi, роутер и настройки DHCP. Без интернета VPN подключиться не сможет.',
    }),
  );

  out.push(
    check({
      id: 'dns',
      title: 'Разрешение имён (DNS)',
      group: 'dns',
      weight: 8,
      status: dnsOk ? 'ok' : 'fail',
      detail: dnsOk ? 'Домены разрешаются корректно.' : 'DNS не отвечает или возвращает пустые ответы.',
      fix: dnsOk ? undefined : 'Включите «DNS через туннель» в настройках или пропишите 1.1.1.1 вручную.',
    }),
  );

  if (!http.ok && tcp) {
    out.push(
      check({
        id: 'port-blocked',
        title: 'HTTPS не проходит',
        group: 'network',
        weight: 10,
        status: 'fail',
        detail: `TCP-порт открыт, но HTTPS-запрос не выполняется (${http.error ?? 'ошибка'}). Это похоже на фильтрацию трафика.`,
        fix: 'Провайдер может резать соединения. Используйте сервер с VLESS+Reality на порту 443 и DNS через туннель.',
      }),
    );
  }
  return out;
}

async function checkSystemProxy(): Promise<DiagCheck> {
  if (!isWin) {
    return check({ id: 'system-proxy', title: 'Системный прокси', group: 'system', weight: 0, status: 'info', detail: 'Проверка доступна только в Windows.' });
  }
  const proxy = await getSystemProxy();
  const ours = proxy.server?.includes('127.0.0.1') || proxy.server?.includes('localhost');
  const bad = proxy.enabled && !ours;
  return check({
    id: 'system-proxy',
    title: 'Системный прокси',
    group: 'system',
    weight: 8,
    status: bad ? 'fail' : 'ok',
    detail: proxy.enabled ? `Прокси включён: ${proxy.server ?? 'без адреса'}${ours ? ' (это SHUZU)' : ''}` : 'Прокси не используется.',
    fix: bad ? 'Сторонний прокси перехватывает трафик. Отключите его в «Параметры → Сеть и Интернет → Прокси».' : undefined,
  });
}

async function checkOtherVpn(): Promise<DiagCheck> {
  if (!isWin) {
    return check({ id: 'other-vpn', title: 'Другие VPN-адаптеры', group: 'system', weight: 0, status: 'info', detail: 'Проверка доступна только в Windows.' });
  }
  const ps = await run(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', "Get-NetAdapter | Select-Object -ExpandProperty InterfaceDescription"],
    12000,
  );
  const text = (ps.out || '').toLowerCase();
  const keywords = ['wireguard', 'openvpn', 'tap-windows', 'wintun', 'radmin', 'tailscale', 'zerotier', 'nordlynx', 'proton', 'warp', 'tunnelbear'];
  const found = keywords.filter((k) => text.includes(k));
  const ours = ['sing-box', 'shuzu'];
  const others = found.filter((k) => !ours.some((o) => k.includes(o)));
  return check({
    id: 'other-vpn',
    title: 'Другие VPN-адаптеры',
    group: 'system',
    weight: 10,
    status: others.length ? 'warn' : 'ok',
    detail: others.length ? `Найдены: ${[...new Set(others)].join(', ')}` : 'Конфликтующих VPN-адаптеров не найдено.',
    fix: others.length ? 'Два туннеля конфликтуют. Отключите (или удалите) другие VPN-клиенты и их службы, затем перезагрузитесь.' : undefined,
  });
}

async function checkFirewall(): Promise<DiagCheck> {
  if (!isWin) {
    return check({ id: 'firewall', title: 'Брандмауэр', group: 'security', weight: 0, status: 'info', detail: 'Проверка доступна только в Windows.' });
  }
  const res = await run('netsh', ['advfirewall', 'show', 'allprofiles', 'state'], 10000);
  const on = /ON|ВКЛ/i.test(res.out);
  const blockedRules = await run('netsh', ['advfirewall', 'firewall', 'show', 'rule', 'name=all', 'dir=out'], 15000);
  const hasBlock = /block|блок/i.test(blockedRules.out.slice(0, 20000));
  return check({
    id: 'firewall',
    title: 'Брандмауэр Windows',
    group: 'security',
    weight: 6,
    status: on ? (hasBlock ? 'warn' : 'ok') : 'ok',
    detail: on ? `Брандмауэр включён${hasBlock ? ', есть блокирующие исходящие правила' : ''}.` : 'Брандмауэр выключен.',
    fix: on && hasBlock ? 'Проверьте блокирующие правила и разрешите sing-box.exe/sing-box в исключениях.' : undefined,
  });
}

async function checkHosts(): Promise<DiagCheck> {
  if (!isWin) {
    return check({ id: 'hosts', title: 'Файл hosts', group: 'dns', weight: 0, status: 'info', detail: 'Проверка доступна только в Windows.' });
  }
  try {
    const file = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
    const content = readFileSync(file, 'utf8');
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    const suspicious = lines.filter((l) => /google|youtube|telegram|discord|openai|facebook|instagram|github/i.test(l));
    return check({
      id: 'hosts',
      title: 'Файл hosts',
      group: 'dns',
      weight: 4,
      status: suspicious.length ? 'warn' : 'ok',
      detail: suspicious.length ? `Найдено ${suspicious.length} подозрительных записей (${suspicious.slice(0, 2).join('; ')}).` : 'Подозрительных записей нет.',
      fix: suspicious.length ? 'Удалите лишние строки из hosts — они перенаправляют домены и ломают подключение.' : undefined,
    });
  } catch {
    return check({ id: 'hosts', title: 'Файл hosts', group: 'dns', weight: 4, status: 'info', detail: 'Не удалось прочитать файл hosts.' });
  }
}

async function checkClock(): Promise<DiagCheck> {
  try {
    const res = await fetch('https://www.gstatic.com/generate_204', { method: 'HEAD', signal: AbortSignal.timeout(6000) });
    const dateHeader = res.headers.get('date');
    if (!dateHeader) throw new Error('нет заголовка Date');
    const remote = Date.parse(dateHeader);
    const diffSec = Math.abs(Date.now() - remote) / 1000;
    const bad = diffSec > 120;
    return check({
      id: 'clock',
      title: 'Системное время',
      group: 'security',
      weight: 6,
      status: bad ? 'fail' : 'ok',
      detail: `Расхождение с интернетом: ${Math.round(diffSec)} с.`,
      fix: bad ? 'TLS-соединение не установится при расхождении времени. Включите синхронизацию времени в Windows.' : undefined,
    });
  } catch {
    return check({ id: 'clock', title: 'Системное время', group: 'security', weight: 4, status: 'info', detail: 'Не удалось сверить время (нет доступа к сети).' });
  }
}

async function checkRoute(): Promise<DiagCheck> {
  if (!isWin) {
    return check({ id: 'route', title: 'Таблица маршрутов', group: 'network', weight: 0, status: 'info', detail: 'Проверка доступна только в Windows.' });
  }
  const res = await run('route', ['print', '-4'], 10000);
  const defaults = (res.out.match(/0\.0\.0\.0\s+0\.0\.0\.0/g) ?? []).length;
  const bad = defaults > 2;
  return check({
    id: 'route',
    title: 'Маршрут по умолчанию',
    group: 'network',
    weight: 6,
    status: bad ? 'warn' : 'ok',
    detail: `Записей маршрута по умолчанию: ${defaults}.`,
    fix: bad ? 'Похоже, остались маршруты от другого VPN. Перезагрузка обычно сбрасывает их.' : undefined,
  });
}

async function checkMtu(): Promise<DiagCheck> {
  if (!isWin) {
    return check({ id: 'mtu', title: 'MTU', group: 'network', weight: 0, status: 'info', detail: 'Проверка доступна только в Windows.' });
  }
  const res = await run('netsh', ['interface', 'ipv4', 'show', 'subinterfaces'], 10000);
  const mtus = [...res.out.matchAll(/\s(\d{3,4})\s+\d+\s+\d+\s*$/gm)].map((m) => Number(m[1]));
  const min = mtus.length ? Math.min(...mtus.filter((m) => m > 500)) : 1500;
  const bad = min < 1300;
  return check({
    id: 'mtu',
    title: 'MTU интерфейсов',
    group: 'network',
    weight: 3,
    status: bad ? 'warn' : 'ok',
    detail: bad ? `Обнаружен слишком маленький MTU: ${min}.` : `Минимальный MTU: ${min}.`,
    fix: bad ? 'Часть пакетов теряется. Установите MTU 1500 (или 1420 для PPPoE) на активном адаптере.' : undefined,
  });
}

async function checkAntivirus(): Promise<DiagCheck> {
  if (!isWin) {
    return check({ id: 'antivirus', title: 'Антивирус', group: 'security', weight: 0, status: 'info', detail: 'Проверка доступна только в Windows.' });
  }
  const res = await run(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', "Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct | Select-Object -ExpandProperty displayName"],
    12000,
  );
  const names = res.out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const thirdParty = names.filter((n) => !/windows defender|защитник/i.test(n));
  return check({
    id: 'antivirus',
    title: 'Антивирус',
    group: 'security',
    weight: 3,
    status: thirdParty.length ? 'warn' : 'ok',
    detail: names.length ? names.join(', ') : 'Не удалось определить.',
    fix: thirdParty.length ? 'Сторонние антивирусы с сетевым экраном могут блокировать туннель. Добавьте SHUZU в исключения.' : undefined,
  });
}

async function checkSubscriptions(servers: Server[]): Promise<DiagCheck[]> {
  const out: DiagCheck[] = [];
  const subs = getSubscriptions();
  const broken = subs.filter((s) => s.lastError);
  out.push(
    check({
      id: 'sub-empty',
      title: 'Серверы в подписках',
      group: 'core',
      weight: servers.length ? 0 : 12,
      status: servers.length ? 'ok' : 'fail',
      detail: servers.length ? `Загружено серверов: ${servers.length}.` : 'Список серверов пуст.',
      fix: servers.length ? undefined : 'Добавьте подписку (буфер обмена, QR-код, файл или ссылка).',
    }),
  );
  if (broken.length) {
    out.push(
      check({
        id: 'sub-error',
        title: 'Ошибки обновления подписок',
        group: 'core',
        weight: 0,
        status: 'warn',
        detail: broken.map((s) => `${s.name}: ${s.lastError}`).join('; ').slice(0, 300),
        fix: 'Проверьте срок действия подписки и доступность ссылки.',
      }),
    );
  }
  return out;
}

export async function runDiagnostics(): Promise<DiagReport> {
  const servers = getServers();
  const results: DiagCheck[] = [];

  const groups = await Promise.allSettled([
    checkCore(servers),
    checkAdmin(),
    checkNet(),
    checkSystemProxy(),
    checkOtherVpn(),
    checkFirewall(),
    checkHosts(),
    checkClock(),
    checkRoute(),
    checkMtu(),
    checkAntivirus(),
    checkSubscriptions(servers),
  ]);

  for (const g of groups) {
    if (g.status === 'fulfilled') {
      if (Array.isArray(g.value)) results.push(...g.value);
      else results.push(g.value);
    }
  }

  // порядок: сначала критичное
  const order: Record<DiagCheck['status'], number> = { fail: 0, warn: 1, info: 2, ok: 3, running: 4 };
  results.sort((a, b) => order[a.status] - order[b.status]);

  return buildReport(results);
}
