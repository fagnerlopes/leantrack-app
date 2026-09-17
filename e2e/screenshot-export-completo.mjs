// ADR 017 — o quadro passou a ter rolagem própria; este teste garante que a
// exportação continua fotografando o roadmap INTEIRO (e não só o pedaço
// visível), e que o quadro volta ao estado original depois da captura.
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";

const VITE = "http://localhost:5173";
const URL = `${VITE}/roadmaps/2-roadmap-squad-cloud-2026`;

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.request.post(`${VITE}/api/dev/login`, { data: { email: "admin@example.com", password: "" } });
const p = await ctx.newPage();
await p.goto(URL);
await p.waitForLoadState("networkidle");
await p.waitForTimeout(700);

// Rola um pouco e move a timeline, para provar que o export não depende da
// posição em que o usuário deixou o quadro.
const box = await p.locator("[data-gantt-scroll]").boundingBox();
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await p.mouse.wheel(0, 400);
await p.waitForTimeout(300);

const expected = await p.evaluate(() => {
  const scroll = document.querySelector("[data-gantt-scroll]");
  const content = document.querySelector("[data-gantt-content]");
  return {
    conteudoLargura: content.scrollWidth,
    conteudoAltura: content.scrollHeight,
    visivelLargura: scroll.clientWidth,
    visivelAltura: scroll.clientHeight,
    scrollLeftAntes: Math.round(scroll.scrollLeft),
    scrollTopAntes: Math.round(scroll.scrollTop),
  };
});

// Captura o data URL sem depender do download do navegador.
await p.evaluate(() => {
  const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && this.href.startsWith("data:image")) { window.__png = this.href; return; }
    return orig.apply(this, arguments);
  };
});

await p.getByRole("button", { name: "Exportar PNG" }).click();
await p.waitForFunction(() => !!window.__png, null, { timeout: 60000 });

const png = await p.evaluate(async () => {
  const img = new Image();
  img.src = window.__png;
  await img.decode();
  const scroll = document.querySelector("[data-gantt-scroll]");
  const card = scroll.parentElement;
  return {
    larguraPx: img.naturalWidth / 2, // pixelRatio: 2
    alturaPx: img.naturalHeight / 2,
    // Estado devolvido depois da captura:
    cardHeightInline: card.style.height,
    cardWidthInline: card.style.width,
    cardFlexInline: card.style.flex,
    scrollOverflowInline: scroll.style.overflow,
    scrollLeftDepois: Math.round(scroll.scrollLeft),
    scrollTopDepois: Math.round(scroll.scrollTop),
  };
});

console.log("esperado :", JSON.stringify(expected));
console.log("png      :", JSON.stringify(png));
const okLargura = png.larguraPx >= expected.conteudoLargura - 4;
const okAltura = png.alturaPx >= expected.conteudoAltura - 4;
const okRestaurado = !png.cardHeightInline && !png.cardWidthInline && !png.cardFlexInline && !png.scrollOverflowInline
  && png.scrollLeftDepois === expected.scrollLeftAntes && png.scrollTopDepois === expected.scrollTopAntes;
console.log(`\nlargura completa: ${okLargura} (${png.larguraPx} >= ${expected.conteudoLargura}, visível era ${expected.visivelLargura})`);
console.log(`altura completa : ${okAltura} (${png.alturaPx} >= ${expected.conteudoAltura}, visível era ${expected.visivelAltura})`);
console.log(`quadro restaurado: ${okRestaurado}`);

// A régua continua funcionando depois do export?
const depois = await p.evaluate(() => {
  const scroll = document.querySelector("[data-gantt-scroll]");
  const ruler = document.querySelector("[data-gantt-content]").firstElementChild;
  const t0 = Math.round(ruler.getBoundingClientRect().top);
  scroll.scrollTop += 300;
  return { antes: t0, depois: Math.round(ruler.getBoundingClientRect().top) };
});
console.log(`régua ainda fixa após export: ${depois.antes === depois.depois} (${JSON.stringify(depois)})`);

// Grava o PNG exportado para inspeção visual.
const dataUrl = await p.evaluate(() => window.__png);
await writeFile(`${process.env.OUT || "/tmp"}/export-roadmap.png`, Buffer.from(dataUrl.split(",")[1], "base64"));
await p.screenshot({ path: `${process.env.OUT || "/tmp"}/export-apos.png` });
await ctx.close();
await b.close();
console.log(okLargura && okAltura && okRestaurado && depois.antes === depois.depois ? "\nRESULTADO: OK" : "\nRESULTADO: FALHOU");
