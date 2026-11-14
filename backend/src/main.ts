/**
 * Starts the game server.
 *
 *   npm run server          this computer only: http://localhost:8787
 *   npm run server:lan      also other devices on the same Wi-Fi
 *
 * Settings (environment variables):
 *   PORT            default 8787
 *   HOST            default 127.0.0.1 (--lan: 0.0.0.0)
 *   DB              default data.nosync/server.sqlite
 *   GRACE_MINUTES   how long a disconnected player has to come back, default 10
 *   STATIC          folder of the built client, default web-client/dist.nosync
 *   ALLOWED_ORIGINS extra browser origins, comma separated
 *   HEARTBEAT_SECONDS how often dead connections are looked for, default 15
 *   USER_ART        who gets the card pictures: "clients" (default: every browser that
 *                   reaches this server), "local" (this computer only) or "off"
 *   USER_ART_DIR    the picture folder with its image-index.json,
 *                   default card-assets/local.nosync
 */

import { existsSync, mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { startGameServer } from './server';
import { SqliteStore } from './store';
import { parseUserArtMode } from './user-art';

const lan = process.argv.includes('--lan');
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? (lan ? '0.0.0.0' : '127.0.0.1');
const dbPath = resolve(process.env.DB ?? 'data.nosync/server.sqlite');
const graceMinutes = Number(process.env.GRACE_MINUTES ?? 10);
const staticDir = resolve(process.env.STATIC ?? 'web-client/dist.nosync');

mkdirSync(dirname(dbPath), { recursive: true });
const server = await startGameServer({
  port,
  host,
  store: new SqliteStore(dbPath),
  graceMs: graceMinutes * 60 * 1000,
  staticDir: existsSync(staticDir) ? staticDir : null,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
  heartbeatMs: Number(process.env.HEARTBEAT_SECONDS ?? 15) * 1000,
  userArtDir: resolve(process.env.USER_ART_DIR ?? 'card-assets/local.nosync'),
  userArtMode: parseUserArtMode(process.env.USER_ART),
});

console.log(`WS 社群模擬器伺服器已啟動（非官方）`);
console.log(`  本機：     http://localhost:${server.port}`);
if (host === '0.0.0.0') {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) console.log(`  同一網絡： http://${net.address}:${server.port}`);
    }
  }
}
console.log(`  資料庫：   ${dbPath}`);
console.log(`  斷線保留： ${graceMinutes} 分鐘`);
console.log(`  卡圖：     ${server.userArt.count()} 張，${{ clients: '提供給所有連到這個伺服器的遊戲客戶端（本機、同一網絡、網上房間）', local: '只提供給這部電腦', off: '不提供' }[server.userArt.mode]}`);
console.log('  只供私人與朋友使用。請勿公開宣傳房間；卡牌文字版權屬 Bushiroad 及各權利人。');
if (!existsSync(staticDir)) console.log('  （找不到已建置的介面，只提供對局連線。請先執行 npm run build。）');
console.log(`  已恢復的房間：${server.manager.rooms.size}`);

const stop = () => {
  console.log('正在關閉伺服器…');
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
