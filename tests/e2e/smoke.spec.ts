import { expect, test } from "@playwright/test";

test("assistant home supports chat, filters, and cart", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AI pickup assistant" })).toBeVisible();

  await page.getByRole("button", { name: "High-protein meal under 650 calories" }).click();
  await expect(page.getByText(/protein/i).first()).toBeVisible();

  await page.getByLabel("Search menu").fill("Harvest");
  await page.getByRole("button", { name: "Add" }).first().click();
  await expect(page.getByText("Harvest Bowl").first()).toBeVisible();
});

test("qr and dashboard pages render", async ({ page }) => {
  await page.goto("/qr");
  await expect(page.getByRole("heading", { name: "QR Access" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
});
