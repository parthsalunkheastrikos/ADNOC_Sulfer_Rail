import puppeteer from "puppeteer-core";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const url = process.argv[2] || "http://localhost:3900/twin";
const outPath = process.argv[3] || "screenshot.png";
const waitMs = Number(process.argv[4] || 4000);

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--window-size=1600,1000"],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();

const errors = [];
const logs = [];
page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => errors.push(String(err)));
page.on("requestfailed", (req) => errors.push(`FAILED REQUEST: ${req.url()} ${req.failure()?.errorText}`));

await page.goto(url, { waitUntil: "load", timeout: 30000 });
await new Promise((r) => setTimeout(r, waitMs));
await page.screenshot({ path: outPath });

console.log("=== console logs ===");
for (const l of logs) console.log(l);
console.log("=== errors ===");
for (const e of errors) console.log(e);
console.log("=== done, screenshot at", outPath, "===");

await browser.close();
