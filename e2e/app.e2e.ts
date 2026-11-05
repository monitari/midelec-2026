import { expect, test, type Page } from '@playwright/test';

// 지도와 데이터를 다 받은 뒤 시작
async function open(page: Page, hash = '') {
  await page.goto(`/${hash ? `#${hash}` : ''}`);
  await expect(page.locator('.map-svg')).toBeVisible();
}

test('선거 종류를 바꾸면 의석 반원이 그 원으로 바뀐다', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: /상원/ }).click();
  await expect(page.locator('.hemi svg')).toHaveAttribute('aria-label', /^상원/);
  await expect(page).toHaveURL(/c=senate/);
});

test('검색해서 고르면 그 선거의 상세가 열린다', async ({ page }) => {
  await open(page);
  await page.keyboard.press('/');
  await page.keyboard.type('NY-17');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '뉴욕 17선거구' })).toBeVisible();
  await expect(page).toHaveURL(/sel=H-NY-17/);
});

test('모드를 바꾸면 범례도 그 모드로 바뀐다', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: '예측', exact: true }).click();
  await expect(page.locator('.legend')).toContainText('경합');
});

test('어두운 화면 전환', async ({ page }) => {
  await open(page);
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '어두운 화면으로' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test.describe('데스크톱', () => {
  test.skip(({ isMobile }) => isMobile, '데스크톱 전용');

  // 회귀: 한 도시권으로 확대하면 화면 밖 도시권까지 접혀 시카고권만 남던 문제
  test('도시권 확대도는 본 지도에서 보고 있는 곳만 접힌다', async ({ page }) => {
    await open(page, 'c=house&m=result&u=district');
    await expect(page.locator('figure.metro')).toHaveCount(4);
    await page.getByRole('button', { name: '본 지도에서 뉴욕권 보기' }).click();
    await expect(page.locator('.metro.collapsed')).toHaveCount(1);
    await expect(page.locator('.metro.collapsed')).toContainText('뉴욕권');
    await expect(page.locator('figure.metro')).toHaveCount(3);
  });

  // 회귀: 틀이 가장 작은 시카고권은 최대로 확대해도 접히지 않았다
  test('시카고권도 본 지도에서 보면 접힌다', async ({ page }) => {
    await open(page, 'c=house&m=result&u=district');
    await page.getByRole('button', { name: '본 지도에서 시카고권 보기' }).click();
    await expect(page.locator('.metro.collapsed')).toHaveCount(1);
    await expect(page.locator('.metro.collapsed')).toContainText('시카고권');
  });

  test('키보드로 지도를 다니고 Enter 로 고른다', async ({ page }) => {
    await open(page, 'c=senate&m=result');
    await page.locator('.map-svg').focus();
    await expect(page.locator('.tooltip')).toBeVisible();
    const first = await page.locator('.tooltip b').textContent();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.tooltip b')).not.toHaveText(first ?? '');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/sel=/);
  });

  test('링크 복사', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page, 'c=senate&m=result&sel=S-GA');
    await page.getByRole('button', { name: '지금 화면 링크 복사' }).click();
    await expect(page.getByRole('button', { name: '링크를 복사했어요' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('sel=S-GA');
  });

  test('주소에 담긴 선택으로 바로 열린다 (선거 종류가 달라도)', async ({ page }) => {
    await open(page, 'c=senate&sel=H-NY-17');
    await expect(page.getByRole('heading', { name: '뉴욕 17선거구' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /하원/ })).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('모바일', () => {
  test.skip(({ isMobile }) => !isMobile, '모바일 전용');

  test('고르면 하단 패널이 열리고 닫을 수 있다', async ({ page }) => {
    await open(page, 'c=senate&m=result');
    await page.getByRole('searchbox', { name: '선거 검색' }).fill('조지아 상원');
    await page.getByRole('option').first().click();
    const sheet = page.getByRole('dialog', { name: '선택한 지역' });
    await expect(sheet).toContainText('조지아 상원');
    await sheet.getByRole('button', { name: '닫기' }).click();
    await expect(sheet).toBeHidden();
  });
});
