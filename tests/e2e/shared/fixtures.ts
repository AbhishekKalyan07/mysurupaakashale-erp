import { test as base, Page } from '@playwright/test';

type MyFixtures = {
  adminPage: Page;
  kitchenPage: Page;
  deliveryPage: Page;
  customerPage: Page;
  accountsPage: Page;
};

export const test = base.extend<MyFixtures>({
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: 'tests/e2e/.auth/admin.json' });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  kitchenPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: 'tests/e2e/.auth/kitchen.json' });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  deliveryPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: 'tests/e2e/.auth/delivery.json' });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  customerPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: 'tests/e2e/.auth/customer.json' });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  accountsPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: 'tests/e2e/.auth/accounts.json' });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect } from '@playwright/test';
