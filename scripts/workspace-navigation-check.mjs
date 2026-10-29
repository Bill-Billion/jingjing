// Exercise the visible drawer controls used on desktop and mobile.
export async function ensureWorkspaceNavigation(page) {
  const navigation = page.locator('.workspace-nav')
  await navigation.waitFor({ state: 'attached' })
  if (!await navigation.isVisible()) {
    await page.getByRole('button', { name: '展开工作区入口', exact: true }).click()
  }
  await navigation.waitFor({ state: 'visible' })
  return navigation
}

// Page readiness must not leave a modal drawer covering the business form.
export async function checkWorkspaceNavigation(page) {
  await ensureWorkspaceNavigation(page)
  await page.getByRole('button', { name: '收起工作区入口', exact: true }).click()
  await page.locator('.workspace-nav').waitFor({ state: 'hidden' })
}
