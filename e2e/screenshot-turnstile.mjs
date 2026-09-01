import { chromium } from "playwright";

const VITE = "http://localhost:5173";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();

await p.goto(`${VITE}/login`, { waitUntil: "domcontentloaded" });

// Aguarda o widget do Turnstile resolver (test key gera token dummy imediatamente).
await p.waitForTimeout(8000);

const widgetReady = await p.evaluate(() => {
  const input = document.querySelector("input[name='cf-turnstile-response']");
  return input && input.value.length > 0;
});
console.log("widget token present:", widgetReady);

await p.screenshot({ path: "/tmp/01-login-turnstile.png", fullPage: true });

// Fluxo completo: sem token → 403; com token de teste → login ok e redireciona.
if (widgetReady) {
  const resp = await ctx.request.post(`${VITE}/api/auth/login`, {
    data: { email: "admin@kinghost.com.br", password: "admin123", turnstileToken: "" },
  });
  console.log("login sem token (esperado 403):", resp.status());
}

await ctx.close();
await b.close();
console.log("done");
