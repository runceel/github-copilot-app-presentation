/** Open the compact control bar's disclosure panel when it is closed. */
export async function openMoreControls(page) {
  const panel = page.locator("#navMorePanel");
  if (!(await panel.isVisible())) {
    await page.locator("#navMore").click();
  }
}

/** Activate one of the controls that lives inside the disclosure panel. */
export async function clickMoreControl(page, selector) {
  await openMoreControls(page);
  await page.locator(selector).click();
}
