import { expect, test } from "@playwright/test";

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
