/**
 * Тесты логики SHUZU (парсинг, конфиг ядра, оценка серверов, диагностика).
 * Запуск: npm test
 */
import assert from 'node:assert/strict';
import { parseLink, parseSubscription, parseUserInfo, decodeBase64, stableId, isSubscriptionUrl } from '../../shared/subscription';
import { buildSingboxConfig, buildHevConfig, serverToOutbound, AUTO_TAG, SELECT_TAG } from '../../shared/singbox';
import { detectLocation, coordsFor, countryName, flagEmojiToCode } from '../../shared/countries';
import { qualityOf, pickBest, pingSummary, jitterOf } from '../../shared/quality';
import { evaluateCensorReport, censorAdvice } from '../../shared/censor';
import { buildReport } from '../../shared/diag';
import { formatBytes, formatDuration, daysLeft, clamp, mapLimit } from '../../shared/util';
import type { CensorProbeResult, DiagCheck, Server } from '../../shared/types';

const tests: Array<[string, () => void | Promise<void>]> = [];
function test(name: string, fn: () => void | Promise<void>) {
  tests.push([name, fn]);
}

/* ------------------------------- парсер ------------------------------- */

test('vless + Reality: все параметры на месте', () => {
  const s = parseLink(
    'vless://11111111-2222-3333-4444-555555555555@de.example.com:443?encryption=none&security=reality&sni=www.microsoft.com&fp=chrome&pbk=PUBKEY&sid=abcd&type=tcp&flow=xtls-rprx-vision#%F0%9F%87%A9%F0%9F%87%AA%20Germany%20%7C%20Frankfurt',
  );
  assert.ok(s);
  assert.equal(s.protocol, 'vless');
  assert.equal(s.host, 'de.example.com');
  assert.equal(s.port, 443);
  assert.equal(s.params.security, 'reality');
  assert.equal(s.params.sni, 'www.microsoft.com');
  assert.equal(s.params.publicKey, 'PUBKEY');
  assert.equal(s.params.shortId, 'abcd');
  assert.equal(s.params.flow, 'xtls-rprx-vision');
  assert.equal(s.country, 'DE');
  assert.equal(s.cleanName, 'Germany');
});

test('vless ws: path и host сохраняются', () => {
  const s = parseLink('vless://uuid-1@ws.example.com:8443?security=tls&type=ws&path=%2Fwspath&host=cdn.example.com&sni=cdn.example.com#WS');
  assert.ok(s);
  assert.equal(s.params.transport, 'ws');
  assert.equal(s.params.path, '/wspath');
  assert.equal(s.params.host, 'cdn.example.com');
});

test('vmess: base64 JSON', () => {
  const json = { v: '2', ps: 'Нидерланды Амстердам', add: 'nl.example.com', port: '443', id: 'abc-uuid', aid: '0', net: 'ws', type: 'none', host: 'nl.example.com', path: '/x', tls: 'tls', sni: 'nl.example.com' };
  const uri = `vmess://${Buffer.from(JSON.stringify(json)).toString('base64')}`;
  const s = parseLink(uri);
  assert.ok(s);
  assert.equal(s.protocol, 'vmess');
  assert.equal(s.host, 'nl.example.com');
  assert.equal(s.params.transport, 'ws');
  assert.equal(s.params.id, 'abc-uuid');
  assert.equal(s.country, 'NL');
});

test('trojan: пароль и sni', () => {
  const s = parseLink('trojan://secret%20pass@tr.example.com:443?sni=tr.example.com#Japan%20Tokyo');
  assert.ok(s);
  assert.equal(s.protocol, 'trojan');
  assert.equal(s.params.password, 'secret pass');
  assert.equal(s.params.sni, 'tr.example.com');
  assert.equal(s.country, 'JP');
});

test('shadowsocks: SIP002 и legacy формат', () => {
  const sip002 = parseLink(`ss://${Buffer.from('aes-256-gcm:pass123').toString('base64')}@ss.example.com:8388#Sweden`);
  assert.ok(sip002);
  assert.equal(sip002.params.method, 'aes-256-gcm');
  assert.equal(sip002.params.password, 'pass123');
  const legacy = parseLink(`ss://${Buffer.from('chacha20-ietf-poly1305:pw@legacy.example.com:8443').toString('base64')}#Legacy`);
  assert.ok(legacy);
  assert.equal(legacy.host, 'legacy.example.com');
  assert.equal(legacy.port, 8443);
});

test('hysteria2 и tuic', () => {
  const hy = parseLink('hysteria2://mypass@fi.example.com:8443?sni=fi.example.com&obfs=salamander&obfs-password=x#Finland');
  assert.ok(hy);
  assert.equal(hy.protocol, 'hysteria2');
  assert.equal(hy.params.obfs, 'salamander');
  const tuic = parseLink('tuic://uuid-2:pwd@ca.example.com:443?congestion_control=bbr&alpn=h3&sni=ca.example.com#Canada');
  assert.ok(tuic);
  assert.equal(tuic.protocol, 'tuic');
  assert.equal(tuic.params.id, 'uuid-2');
  assert.equal(tuic.port, 443);
});

test('мусор не превращается в сервер', () => {
  assert.equal(parseLink('https://example.com/page'), null);
  assert.equal(parseLink('это просто текст'), null);
  assert.equal(parseLink('vless://'), null);
});

test('base64-подписка целиком', () => {
  const links = [
    'vless://u1@a.example.com:443?security=tls&sni=a.example.com#Germany',
    'vless://u2@b.example.com:443?security=tls&sni=b.example.com#Netherlands',
  ].join('\n');
  const encoded = Buffer.from(links).toString('base64');
  const parsed = parseSubscription(encoded, 'sub1');
  assert.equal(parsed.servers.length, 2);
  assert.equal(parsed.format, 'base64');
  assert.equal(parsed.servers[0].subscriptionId, 'sub1');
});

test('подписка без паддинга и с url-safe символами', () => {
  const links = 'vless://u1@a.example.com:443?security=tls&sni=a.example.com#A';
  const encoded = Buffer.from(links).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const parsed = parseSubscription(encoded);
  assert.equal(parsed.servers.length, 1);
});

test('Clash YAML', () => {
  const yaml = `
proxies:
  - name: "Германия Франкфурт"
    type: vless
    server: de.example.com
    port: 443
    uuid: 11111111-2222-3333-4444-555555555555
    tls: true
    servername: www.microsoft.com
    network: ws
    ws-opts:
      path: /ws
      headers:
        Host: de.example.com
    reality-opts:
      public-key: PUB
      short-id: ab
  - name: "США"
    type: trojan
    server: us.example.com
    port: 443
    password: pass
    sni: us.example.com
`;
  const parsed = parseSubscription(yaml, 'clash-sub');
  assert.equal(parsed.format, 'clash');
  assert.equal(parsed.servers.length, 2);
  assert.equal(parsed.servers[0].protocol, 'vless');
  assert.equal(parsed.servers[0].params.publicKey, 'PUB');
  assert.equal(parsed.servers[0].params.transport, 'ws');
  assert.equal(parsed.servers[1].protocol, 'trojan');
});

test('sing-box JSON', () => {
  const json = JSON.stringify({
    outbounds: [
      { type: 'vless', tag: 'de', server: 'de.example.com', server_port: 443, uuid: 'u', tls: { enabled: true, server_name: 'de.example.com', utls: { enabled: true, fingerprint: 'chrome' } } },
      { type: 'direct', tag: 'direct' },
    ],
  });
  const parsed = parseSubscription(json);
  assert.equal(parsed.format, 'singbox');
  assert.equal(parsed.servers.length, 1);
  assert.equal(parsed.servers[0].params.sni, 'de.example.com');
});

test('дубликаты ссылок не создают дубли серверов', () => {
  const link = 'vless://u1@a.example.com:443?security=tls#A';
  const parsed = parseSubscription(`${link}\n${link}\n${link}`);
  assert.equal(parsed.servers.length, 1);
});

test('subscription-userinfo', () => {
  const info = parseUserInfo('upload=1073741824; download=5368709120; total=107374182400; expire=1800000000');
  assert.equal(info.used, 1073741824 + 5368709120);
  assert.equal(info.total, 107374182400);
  assert.equal(info.expiresAt, 1800000000 * 1000);
  const empty = parseUserInfo(null);
  assert.equal(empty.used, null);
});

test('идентификаторы стабильны', () => {
  const a = parseLink('vless://u1@a.example.com:443?security=tls#A');
  const b = parseLink('vless://u1@a.example.com:443?security=tls#A');
  assert.ok(a && b);
  assert.equal(a.id, b.id);
  assert.equal(stableId('hello'), stableId('hello'));
  assert.notEqual(stableId('hello'), stableId('hellp'));
});

test('распознавание ссылки-подписки', () => {
  assert.equal(isSubscriptionUrl('https://provider.example/sub/abc'), true);
  assert.equal(isSubscriptionUrl('vless://x@a:443#A'), false);
  assert.equal(isSubscriptionUrl('не ссылка'), false);
});

/* --------------------------- определение стран ------------------------- */

test('страна по имени сервера', () => {
  assert.equal(detectLocation('🇩🇪 Germany | Frankfurt').country, 'DE');
  assert.equal(detectLocation('Netherlands Amsterdam').country, 'NL');
  assert.equal(detectLocation('DE-Frankfurt-01').country, 'DE');
  assert.equal(detectLocation('Германия Франкфурт').country, 'DE');
  assert.equal(detectLocation('Япония Токио').country, 'JP');
  assert.equal(flagEmojiToCode('🇺🇸'), 'US');
  assert.equal(countryName('DE', 'ru'), 'Германия');
  const coords = coordsFor('DE', 'Frankfurt');
  assert.ok(coords && Math.abs(coords[0] - 8.68) < 1);
});

/* ------------------------------ конфиг ядра ---------------------------- */

function makeServer(uri: string): Server {
  const s = parseLink(uri);
  if (!s) throw new Error('не разобрался: ' + uri);
  return s;
}

test('конфиг: TUN + urltest + selector', () => {
  const servers = [
    makeServer('vless://u1@de.example.com:443?security=reality&sni=www.microsoft.com&pbk=P&sid=ab&flow=xtls-rprx-vision#Germany%20Frankfurt'),
    makeServer('hysteria2://pw@fi.example.com:8443?sni=fi.example.com#Finland'),
  ];
  const built = buildSingboxConfig({
    servers,
    selectedServerId: servers[0].id,
    mode: 'tun',
    android: false,
    socksPort: 10808,
    httpPort: 10809,
    clashApiPort: 19090,
    clashSecret: 'secret',
    dns: 'tunnel',
    customDns: '1.1.1.1',
    bypassLocal: true,
    blockAds: true,
  });
  const cfg = built.config as Record<string, any>;
  assert.ok(Array.isArray(cfg.inbounds));
  assert.equal(cfg.inbounds[0].type, 'tun');
  assert.equal(cfg.inbounds[0].auto_route, true);
  const tags = (cfg.outbounds as any[]).map((o) => o.tag);
  assert.ok(tags.includes(AUTO_TAG));
  assert.ok(tags.includes(SELECT_TAG));
  assert.ok(tags.includes('srv-' + servers[0].id));
  const selector = (cfg.outbounds as any[]).find((o) => o.tag === SELECT_TAG);
  assert.equal(selector.default, 'srv-' + servers[0].id);
  const urltest = (cfg.outbounds as any[]).find((o) => o.tag === AUTO_TAG);
  assert.equal(urltest.outbounds.length, 2);
  // у vless должен быть reality и utls
  const vlessOut = (cfg.outbounds as any[]).find((o) => o.type === 'vless');
  assert.equal(vlessOut.tls.reality.public_key, 'P');
  assert.equal(vlessOut.tls.utls.fingerprint, 'chrome');
  assert.equal(vlessOut.flow, 'xtls-rprx-vision');
  // маршрутизация
  assert.equal(cfg.route.final, SELECT_TAG);
  const actions = (cfg.route.rules as any[]).map((r) => r.action);
  assert.ok(actions.includes('sniff'));
  assert.ok(actions.includes('hijack-dns'));
  assert.equal(cfg.experimental.clash_api.external_controller, '127.0.0.1:19090');
});

test('конфиг: Android использует SOCKS-вход и без TUN', () => {
  const servers = [makeServer('trojan://pw@tr.example.com:443?sni=tr.example.com#Turkey')];
  const built = buildSingboxConfig({
    servers,
    selectedServerId: null,
    mode: 'tun',
    android: true,
    socksPort: 10808,
    httpPort: 10809,
    clashApiPort: 19090,
    clashSecret: 's',
    dns: 'tunnel',
    customDns: '1.1.1.1',
    bypassLocal: false,
    blockAds: false,
  });
  const cfg = built.config as Record<string, any>;
  assert.equal(cfg.inbounds[0].type, 'socks');
  assert.equal(cfg.inbounds[0].listen_port, 10808);
  assert.equal(cfg.inbounds[0].udp, undefined); // SOCKS supports UDP without a separate option
  assert.equal(cfg.route.auto_detect_interface, false);
  assert.equal(cfg.route.final, SELECT_TAG);
});

test('конфиг: режим системного прокси', () => {
  const servers = [makeServer('ss://YWVzLTI1Ni1nY206cGFzcw@ss.example.com:8388#SS')];
  const built = buildSingboxConfig({
    servers,
    selectedServerId: null,
    mode: 'proxy',
    android: false,
    socksPort: 10808,
    httpPort: 10809,
    clashApiPort: 19090,
    clashSecret: 's',
    dns: 'system',
    customDns: '',
    bypassLocal: false,
    blockAds: false,
  });
  const cfg = built.config as Record<string, any>;
  assert.equal(cfg.inbounds[0].type, 'mixed');
  assert.equal(cfg.inbounds[0].listen_port, 10809);
  assert.equal(cfg.dns, undefined); // при системном DNS секция не нужна
});

test('конфиг: SSR отбрасывается, но остальные работают', () => {
  const ssr = parseLink(`ssr://${Buffer.from('a.example.com:443:origin:aes-256-cfb:tls1.2_ticket_auth:cGFzcw/?remarks=SSR').toString('base64').replace(/=+$/, '')}`);
  const good = makeServer('vless://u@ok.example.com:443?security=tls&sni=ok.example.com#OK');
  const built = buildSingboxConfig({
    servers: [ssr as Server, good],
    selectedServerId: null,
    mode: 'tun',
    android: false,
    socksPort: 10808,
    httpPort: 10809,
    clashApiPort: 19090,
    clashSecret: 's',
    dns: 'tunnel',
    customDns: '1.1.1.1',
    bypassLocal: false,
    blockAds: false,
  });
  assert.equal(built.unsupportedIds.length, 1);
  assert.equal(Object.keys(built.tagsByServerId).length, 1);
});

test('outbound для каждого протокола собирается', () => {
  const uris = [
    'vless://u@a.example.com:443?security=tls&sni=a.example.com&type=ws&path=%2Fws#A',
    'trojan://p@b.example.com:443?sni=b.example.com#B',
    'ss://YWVzLTEyOC1nY206cA@c.example.com:8388#C',
    'hysteria2://p@d.example.com:443?sni=d.example.com#D',
    'tuic://u:p@e.example.com:443?sni=e.example.com#E',
  ];
  for (const uri of uris) {
    const s = makeServer(uri);
    const out = serverToOutbound(s);
    assert.ok(out, `outbound для ${s.protocol} не собрался`);
    assert.equal(out.server, s.host);
    assert.equal(out.server_port, s.port);
  }
});

test('hev-конфиг содержит порт ядра', () => {
  const yaml = buildHevConfig(10808);
  assert.match(yaml, /port: 10808/);
  assert.match(yaml, /address: 127\.0\.0\.1/);
});

/* ------------------------------- качество ------------------------------ */

test('оценка качества и выбор лучшего', () => {
  const base = makeServer('vless://u@a.example.com:443?security=tls&sni=a.example.com#A');
  const now = Date.now();
  const fast: Server = { ...base, id: 'fast', ping: 40, jitter: 2, loss: 0, pingedAt: now };
  const slow: Server = { ...base, id: 'slow', ping: 300, jitter: 40, loss: 0.2, pingedAt: now };
  const dead: Server = { ...base, id: 'dead', ping: null, dead: true, pingedAt: now };
  const stale: Server = { ...base, id: 'stale', ping: 30, pingedAt: now - 60 * 60_000 };
  assert.ok(qualityOf(fast, now).score > qualityOf(slow, now).score);
  assert.equal(qualityOf(dead, now).score, 0);
  assert.equal(qualityOf(stale, now).grade, 'unknown');
  assert.equal(pickBest([slow, fast, dead], now)?.id, 'fast');
  assert.equal(pickBest([dead], now), null);
  const summary = pingSummary([fast, slow]);
  assert.equal(summary.best, 40);
  assert.equal(summary.avg, 170);
  assert.equal(jitterOf([10, 10, 10]), 0);
});

/* ------------------------- блокировки и диагностика -------------------- */

function probe(group: CensorProbeResult['group'], ok: boolean, id: string): CensorProbeResult {
  return { id, label: id, group, ok, ms: ok ? 50 : null, via: 'http' };
}

test('глушилки: всё открыто', () => {
  const report = evaluateCensorReport([
    probe('local', true, 'vk'),
    probe('local', true, 'yandex'),
    probe('global', true, 'google'),
    probe('global', true, 'cloudflare'),
    probe('media', true, 'youtube'),
  ]);
  assert.equal(report.verdict, 'open');
  assert.ok(report.dpiScore < 20);
  assert.equal(censorAdvice(report).length, 0);
});

test('глушилки: доступны только локальные — фильтрация', () => {
  const report = evaluateCensorReport([
    probe('local', true, 'vk'),
    probe('local', true, 'gosuslugi'),
    probe('local', true, 'yandex'),
    probe('global', false, 'google'),
    probe('global', false, 'cloudflare'),
    probe('media', false, 'youtube'),
    probe('messenger', false, 'telegram'),
  ]);
  assert.equal(report.verdict, 'filtered');
  assert.ok(report.dpiScore >= 55);
  assert.ok(report.blockedGroups.includes('global'));
  assert.ok(censorAdvice(report).length > 0);
});

test('глушилки: нет интернета вообще — не путаем с DPI', () => {
  const report = evaluateCensorReport([probe('local', false, 'vk'), probe('global', false, 'google')]);
  assert.equal(report.verdict, 'unknown');
});

test('диагностика: скор и вердикт', () => {
  const checks: DiagCheck[] = [
    { id: 'a', title: 'Ядро', group: 'core', weight: 26, status: 'ok', detail: '' },
    { id: 'b', title: 'Сеть', group: 'network', weight: 24, status: 'ok', detail: '' },
  ];
  const good = buildReport(checks);
  assert.equal(good.score, 100);
  assert.equal(good.verdict, 'healthy');

  const withFail: DiagCheck[] = [
    { id: 'a', title: 'Ядро', group: 'core', weight: 26, status: 'fail', detail: '', fix: 'Переустановить' },
    { id: 'b', title: 'Сеть', group: 'network', weight: 24, status: 'ok', detail: '' },
  ];
  const bad = buildReport(withFail);
  assert.equal(bad.verdict, 'blocked');
  assert.ok(bad.score < 60);
  assert.match(bad.summary, /Переустановить|критично/i);

  const warn = buildReport([{ id: 'c', title: 'DNS', group: 'dns', weight: 10, status: 'warn', detail: '' }]);
  assert.equal(warn.verdict, 'degraded');
});

/* -------------------------------- утилиты ------------------------------ */

test('форматирование и мелочи', () => {
  assert.equal(formatBytes(0), '0 Б');
  assert.equal(formatBytes(1024), '1.0 КБ');
  assert.equal(formatBytes(1024 * 1024 * 5.5), '5.5 МБ');
  assert.equal(formatBytes(null), '—');
  assert.equal(formatDuration(65_000), '01:05');
  assert.equal(formatDuration(3_725_000), '01:02:05');
  assert.equal(formatDuration(null), '00:00');
  assert.equal(clamp(15, 0, 10), 10);
  assert.equal(daysLeft(Date.now() + 2 * 86_400_000), 2);
  assert.equal(daysLeft(null), null);
  assert.equal(decodeBase64(Buffer.from('привет').toString('base64')), 'привет');
});

test('mapLimit сохраняет порядок и уважает лимит', async () => {
  let active = 0;
  let maxActive = 0;
  const result = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (x) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return x * 2;
  });
  assert.deepEqual(result, [2, 4, 6, 8, 10, 12]);
  assert.ok(maxActive <= 2, `превышен лимит параллелизма: ${maxActive}`);
});

/* ------------------------------- runner -------------------------------- */

(async () => {
  let passed = 0;
  const failed: string[] = [];
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failed.push(name);
      console.log(`  ✗ ${name}\n    ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\n${passed}/${tests.length} тестов прошло`);
  if (failed.length) {
    console.log('Провалились: ' + failed.join(', '));
    process.exit(1);
  }
})();
