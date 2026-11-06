// Expand actual category controls so callers can follow any business link.
export async function ensureWorkspaceNavigation(page) {
  const navigation = page.locator('.workspace-nav')
  await navigation.waitFor({ state: 'visible' })
  for (const group of await navigation.locator('.workspace-nav-group').all()) {
    const parent = group.locator('.workspace-nav-parent')
    if (await parent.getAttribute('aria-expanded') === 'false') await parent.click()
    await group.locator('.workspace-nav-children').waitFor({ state: 'visible' })
  }
  return navigation
}

// Category expansion stays in the sidebar and never covers the business form.
export async function checkWorkspaceNavigation(page) {
  const navigation = page.locator('.workspace-nav')
  await navigation.waitFor({ state: 'visible' })
  await page.getByRole('button', { name: '全部收起', exact: true }).click()
  const parent = navigation.locator('.workspace-nav-parent').first()
  await parent.click()
  await navigation.locator('.workspace-nav-children').first().waitFor({ state: 'visible' })
  await parent.click()
  await navigation.locator('.workspace-nav-children').first().waitFor({ state: 'hidden' })
}
