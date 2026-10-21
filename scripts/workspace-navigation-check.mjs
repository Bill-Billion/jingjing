// Exercise the same visible toggle as a user when the mobile menu is folded.
export async function ensureWorkspaceNavigation(page) {
  const navigation = page.locator('.workspace-nav')
  await navigation.waitFor({ state: 'attached' })
  if (!await navigation.isVisible()) {
    await page.getByRole('button', { name: /^工作区导航\s+展开$/ }).click()
  }
  await navigation.waitFor({ state: 'visible' })
  return navigation
}
