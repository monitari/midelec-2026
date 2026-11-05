import { defineConfig, devices } from '@playwright/test';

// 실제로 눌러 보는 테스트. 이 컴퓨터에 설치된 Chrome 을 쓰므로 브라우저를 따로 받지 않는다.
// 테스트마다 NYT 원본(약 13MB)을 받지 않도록 로컬 데이터로 띄운다 — public/data/election-2026.json 이 있어야 한다 (npm run fetch:data).
const PORT = 5199;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    locale: 'ko-KR',
    colorScheme: 'light',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: { VITE_DATA: 'local' },
    timeout: 60_000,
  },
});
