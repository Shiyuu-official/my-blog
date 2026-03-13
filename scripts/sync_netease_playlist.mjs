import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const playlistId = process.env.NETEASE_PLAYLIST_ID ?? "17799116654";
const outputDir = path.join(rootDir, "public", "music");
const outputFile = path.join(outputDir, "playlist.json");
const metingApi = "https://api.injahow.cn/meting/?server=netease&type=playlist&id=";
const requestUrl = `${metingApi}${playlistId}&t=${Date.now()}`;

const fileExists = async (filePath) => {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const normalizeAudioList = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
      name: item?.name ?? "",
      artist: Array.isArray(item?.artist)
        ? item.artist.join(", ")
        : (item?.artist ?? ""),
      url: item?.url ?? "",
      cover: item?.cover ?? "",
      lrc: item?.lrc ?? "",
      id: item?.id ?? "",
    }))
    .filter((item) => item.name && item.url);
};

const writePlaylistFile = async (audioList) => {
  const payload = {
    playlistId,
    updatedAt: new Date().toISOString(),
    audio: audioList,
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(
    `[sync:playlist] Wrote ${audioList.length} tracks to ${path.relative(rootDir, outputFile)}`,
  );
};

try {
  const response = await fetch(requestUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const raw = await response.json();
  const audioList = normalizeAudioList(raw);
  if (audioList.length === 0) {
    throw new Error("Playlist is empty or invalid from upstream API");
  }

  await writePlaylistFile(audioList);
} catch (error) {
  const hasLocalFallback = await fileExists(outputFile);
  if (!hasLocalFallback) {
    console.error(`[sync:playlist] Failed and no local fallback: ${error.message}`);
    process.exit(1);
  }

  const fallbackRaw = await readFile(outputFile, "utf8");
  const fallback = JSON.parse(fallbackRaw);
  const fallbackCount = Array.isArray(fallback?.audio) ? fallback.audio.length : 0;
  console.warn(
    `[sync:playlist] Fetch failed, keep existing playlist (${fallbackCount} tracks): ${error.message}`,
  );
}
