import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * npm run fetch:data 가 만든 NYT 결과 사본은 로컬 개발용이다. public/ 에 있어도 배포본에는 넣지 않는다
 * (공개 사이트는 보는 사람의 브라우저가 NYT 에서 직접 받는다).
 */
function excludeLocalResults(): Plugin {
  let outDir = 'dist';
  return {
    name: 'exclude-local-results',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      for (const f of ['election-2026.json', 'counties-2026.json']) {
        rmSync(resolve(outDir, 'data', f), { force: true });
      }
    },
  };
}

export default defineConfig({
  // GitHub Pages(/midelec-2026/) 등 어느 경로에 올려도 동작하도록 상대 경로로 빌드
  base: './',
  plugins: [react(), excludeLocalResults()],
});
