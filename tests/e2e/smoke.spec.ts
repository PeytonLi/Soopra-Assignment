import { expect, test, type Page } from "@playwright/test";

async function getVisibleControlOverlaps(page: Page) {
  return page.evaluate(() => {
    const selectors = [
      ".constraints-panel .check-pill",
      ".constraints-panel .toggle-button",
      ".avoid-row input",
      ".avoid-row button",
      ".filter-summary-row span",
      ".mini-menu-item",
      ".chat-form input",
      ".chat-form button",
    ];
    const nodes = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const boxes = nodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          text: (node.textContent || node.getAttribute("aria-label") || node.tagName).trim(),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter((box) => box.width > 1 && box.height > 1 && box.bottom > 0 && box.top < window.innerHeight);

    const overlaps: Array<{ a: string; b: string }> = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (xOverlap > 2 && yOverlap > 2) overlaps.push({ a: a.text, b: b.text });
      }
    }
    return overlaps;
  });
}

test("assistant home supports chat, filters, and cart", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AI pickup assistant" })).toBeVisible();

  await page.getByRole("button", { name: "High-protein meal under 650 calories" }).click();
  await expect(page.getByText(/protein/i).first()).toBeVisible();
  await expect(page.locator(".assistant-rec-card").first()).toBeVisible();
  await expect(page.locator(".assistant-rec-card").first()).toContainText(/cal/i);
  await expect(page.locator(".assistant-rec-card").first()).toContainText(/protein/i);
  await expect(page.locator(".message.assistant").last()).not.toContainText("**");

  await page.getByLabel("Search menu").fill("Guacamole");
  const menuCard = page.locator(".menu-card").filter({ hasText: "Guacamole Greens" });
  await menuCard.getByRole("button", { name: "Add" }).click();
  await expect(page.locator(".cart-line").filter({ hasText: "Guacamole Greens" })).toBeVisible();
  await page.getByLabel("Pickup name").fill("Ada");
  await page.getByRole("button", { name: "Create summary" }).click();
  await expect(page.getByText(/Summary created locally, not saved|Saved to Supabase/)).toBeVisible();
});

test("qr and dashboard pages render", async ({ page }) => {
  const health = await page.request.get("/api/health");
  expect(health.ok()).toBe(true);

  await page.goto("/qr");
  await expect(page.getByRole("heading", { name: "QR Access" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pickup order queue" })).toBeVisible();
});

test("mobile filters update best matches without overlapping controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: /^Vegetarian$/ }).click();
  await page.getByRole("button", { name: /^Spicy$/ }).click();
  await page.getByRole("button", { name: /High protein/i }).click();

  await expect(page.locator(".recommendation-summary")).toContainText("vegetarian");
  await expect(page.locator(".recommendation-summary")).toContainText("spicy");
  await expect(page.locator(".recommendation-summary")).toContainText("high-protein");
  await expect(page.locator(".filter-summary-row")).toContainText("vegetarian");

  await page.getByLabel("Ingredient to avoid").fill("sesame");
  await page.getByRole("button", { name: "Add ingredient filter" }).click();
  await expect(page.locator(".filter-summary-row")).toContainText("avoid sesame");

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(0);
  await expect(getVisibleControlOverlaps(page)).resolves.toEqual([]);
});
