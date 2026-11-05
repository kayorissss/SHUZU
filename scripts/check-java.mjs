/** Проверка синтаксиса Java-исходников Android (без JDK в окружении). */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'java-parser';

const dir = 'android/app/src/main/java/com/shuzu/app';
let failed = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.java'))) {
  try {
    parse(readFileSync(join(dir, file), 'utf8'));
    console.log(`  ✓ ${file}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${file}: ${String(e.message).split('\n')[0]}`);
  }
}
console.log(failed ? `\n${failed} файл(ов) с ошибками синтаксиса` : '\nJava-синтаксис в порядке');
process.exit(failed ? 1 : 0);
