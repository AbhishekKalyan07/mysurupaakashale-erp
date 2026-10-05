import { test as base, Page } from '@playwright/test';

type MyFixtures = {
  adminPage: Page;
  kitchenPage: Page;
  deliveryPage: Page;
  customerPage: Page;
  accountsPage: Page;
};

async function createRoleContext(browser: any, role: string) {
  const context = await browser.newContext({ storageState: `tests/e2e/.auth/${role}.json` });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('pwa-installed', 'true');
    } catch (_) {}
  });
  return context;
}

export const test = base.extend<MyFixtures>({
  adminPage: async ({ browser }, use) => {
    const context = await createRoleContext(browser, 'admin');
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  kitchenPage: async ({ browser }, use) => {
    const context = await createRoleContext(browser, 'kitchen');
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  deliveryPage: async ({ browser }, use) => {
    const context = await createRoleContext(browser, 'delivery');
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  customerPage: async ({ browser }, use) => {
    const context = await createRoleContext(browser, 'customer');
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  accountsPage: async ({ browser }, use) => {
    const context = await createRoleContext(browser, 'accounts');
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect } from '@playwright/test';
