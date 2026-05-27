import { chromium } from "playwright";

const VITE = "http://localhost:5173";
const API  = "http://localhost:8080";

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });

// 1. Login page
const p1 = await ctx.newPage();
await p1.goto(`${VITE}/login`);
await p1.waitForLoadState("networkidle");
await p1.screenshot({ path: "/tmp/01-login.png", fullPage: true });

// 2. Dev login (against API directly to set cookie on the API origin)
const resp = await ctx.request.post(`${VITE}/api/dev/login`, {
  data: { email: "admin@kinghost.com.br", password: "" },
});
console.log("dev login:", resp.status());

// 3. Roadmap (authenticated)
const p2 = await ctx.newPage();
await p2.goto(`${VITE}/`);
await p2.waitForLoadState("networkidle");
await p2.waitForTimeout(800);
await p2.screenshot({ path: "/tmp/02-roadmap.png", fullPage: true });

// 4. Admin dashboard
const p3 = await ctx.newPage();
await p3.goto(`${VITE}/admin`);
await p3.waitForLoadState("networkidle");
await p3.waitForTimeout(800);
await p3.screenshot({ path: "/tmp/03-admin.png", fullPage: true });

// 5. Roadmap with edit modal opened (admin click on first item)
const p4 = await ctx.newPage();
await p4.goto(`${VITE}/`);
await p4.waitForLoadState("networkidle");
await p4.waitForTimeout(500);
// Click first item row inside the Gantt (after the status group header)
const firstItem = p4.locator("text=Migração").first();
if (await firstItem.count()) {
  await firstItem.click();
  await p4.waitForTimeout(400);
  await p4.screenshot({ path: "/tmp/04-roadmap-edit.png", fullPage: true });
}

await b.close();
console.log("done");
