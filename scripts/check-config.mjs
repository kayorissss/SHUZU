/**
 * Генерирует конфиги ядра для набора реальных ссылок и складывает их в .cache/configs.
 * В CI по ним запускается `sing-box check`, чтобы релиз не ушёл с невалидным конфигом.
 */
import { build } from 'esbuild';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const outdir = await mkdtemp(join(tmpdir(), 'shuzu-cfg-'));
const outfile = join(outdir, 'shared.cjs');
await build({
  entryPoints: ['scripts/tests/shared-entry.ts'],
  bundle: true,
  outfile,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  logLevel: 'silent',
});
const require = createRequire(import.meta.url);
const mod = require(outfile);

const samples = [
  ['vless-reality', 'vless://11111111-2222-3333-4444-555555555555@de.example.com:443?encryption=none&security=reality&sni=www.microsoft.com&fp=chrome&pbk=jNXHt1yRo0vDuchQlIP6Z0ZvjT3KtzVI-T4E7RoLJS0&sid=abcd&type=tcp&flow=xtls-rprx-vision#DE%20Frankfurt'],
  ['vless-ws-tls', 'vless://11111111-2222-3333-4444-555555555555@nl.example.com:443?encryption=none&security=tls&sni=nl.example.com&type=ws&path=%2Fws&host=nl.example.com#NL%20Amsterdam'],
  ['vless-grpc', 'vless://11111111-2222-3333-4444-555555555555@uk.example.com:443?encryption=none&security=tls&sni=uk.example.com&type=grpc&serviceName=grpcsvc#UK%20London'],
  ['vmess-ws', `vmess://${Buffer.from(JSON.stringify({ v: '2', ps: 'US New York', add: 'us.example.com', port: '443', id: '11111111-2222-3333-4444-555555555555', aid: '0', scy: 'auto', net: 'ws', type: 'none', host: 'us.example.com', path: '/vm', tls: 'tls', sni: 'us.example.com' })).toString('base64')}`],
  ['trojan-tls', 'trojan://secret@jp.example.com:443?sni=jp.example.com&type=tcp#JP%20Tokyo'],
  ['shadowsocks', 'ss://YWVzLTI1Ni1nY206c2VjcmV0@se.example.com:8388#SE%20Stockholm'],
  ['hysteria2', 'hysteria2://secret@fi.example.com:8443?sni=fi.example.com&obfs=salamander&obfs-password=obfs#FI%20Helsinki'],
  ['tuic', 'tuic://11111111-2222-3333-4444-555555555555:secret@ca.example.com:443?congestion_control=bbr&alpn=h3&sni=ca.example.com#CA%20Toronto'],
  ['httpupgrade', 'vless://11111111-2222-3333-4444-555555555555@sg.example.com:443?encryption=none&security=tls&sni=sg.example.com&type=httpupgrade&path=%2Fhu&host=sg.example.com#SG'],
];

const outDir = '.cache/configs';
await mkdir(outDir, { recursive: true });

const servers = samples.map(([, uri]) => mod.parseLink(uri)).filter(Boolean);
if (servers.length !== samples.length) {
  console.error('не все ссылки разобрались:', servers.length, 'из', samples.length);
  process.exit(1);
}

const base = {
  servers,
  selectedServerId: null,
  socksPort: 10808,
  httpPort: 10809,
  clashApiPort: 19090,
  clashSecret: 'check-secret',
  dns: 'tunnel',
  customDns: '1.1.1.1',
  bypassLocal: true,
  blockAds: true,
  cachePath: '.cache/configs/cache.db',
};

const variants = [
  ['tun-full', { ...base, mode: 'tun', android: false }],
  ['proxy-minimal', { ...base, mode: 'proxy', android: false, bypassLocal: false, blockAds: false }],
  ['android-socks', { ...base, mode: 'tun', android: true }],
  ['custom-dns', { ...base, mode: 'tun', android: false, dns: 'custom', customDns: 'https://dns.google/dns-query' }],
  ['system-dns', { ...base, mode: 'tun', android: false, dns: 'system' }],
];

for (const [name, opts] of variants) {
  const built = mod.buildSingboxConfig(opts);
  await writeFile(join(outDir, `${name}.json`), JSON.stringify(built.config, null, 2), 'utf8');
  console.log(`${outDir}/${name}.json — outbounds: ${built.config.outbounds.length}, unsupported: ${built.unsupportedIds.length}`);
}
