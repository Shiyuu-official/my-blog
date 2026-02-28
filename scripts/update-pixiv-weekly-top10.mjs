import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const outputPath = path.join(projectRoot, "src", "data", "pixiv-weekly-top10.json");

const endpoint =
  "https://www.pixiv.net/ranking.php?mode=weekly&content=illust&format=json";

const cookie = process.env.PIXIV_COOKIE?.trim();

const headers = {
  Accept: "application/json, text/plain, */*",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Referer: "https://www.pixiv.net/ranking.php?mode=weekly&content=illust",
};

if (cookie) {
  headers.Cookie = cookie;
}

const toProxyImageUrl = (url) => {
  if (!url || typeof url !== "string") return "";
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=720&output=webp`;
};

const toPixivReUrl = (url) => {
  if (!url || typeof url !== "string") return "";
  // i.pximg.net needs referer; i.pixiv.re is a public proxy mirror.
  return url
    .replace("https://i.pximg.net/", "https://i.pixiv.re/")
    .replace(/\/c\/\d+x\d+\//, "/");
};

const toPixivCatUrl = (id) => {
  if (!id) return "";
  return `https://pixiv.cat/${id}.jpg`;
};

const normalizeItem = (item, index) => {
  const id = String(item.illust_id ?? item.id ?? "");
  const originalThumb = String(item.url ?? "");
  const tags = Array.isArray(item.tags)
    ? item.tags.map((tag) => String(tag)).filter(Boolean)
    : [];

  return {
    rank: Number(item.rank ?? index + 1),
    id,
    title: String(item.title ?? ""),
    userName: String(item.user_name ?? ""),
    userId: String(item.user_id ?? ""),
    artworkUrl: id ? `https://www.pixiv.net/artworks/${id}` : "",
    thumbnailUrl: toProxyImageUrl(originalThumb),
    fallbackThumbnailUrls: [toPixivReUrl(originalThumb), toPixivCatUrl(id)].filter(Boolean),
    originalThumbnailUrl: originalThumb,
    tags,
  };
};

const main = async () => {
  const response = await fetch(endpoint, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch ranking: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const contents = Array.isArray(payload?.contents) ? payload.contents : [];
  const top10 = contents.slice(0, 10).map(normalizeItem).filter((item) => item.id);

  if (top10.length === 0) {
    throw new Error("No ranking items found. PIXIV_COOKIE may be required.");
  }

  const data = {
    generatedAt: new Date().toISOString(),
    source: endpoint,
    total: top10.length,
    items: top10,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`Updated ${outputPath} with ${top10.length} items.`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
