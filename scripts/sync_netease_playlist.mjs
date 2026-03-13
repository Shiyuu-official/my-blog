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
const playlistDetailUrl = `https://music.163.com/api/v6/playlist/detail?id=${playlistId}&n=1000&t=${Date.now()}`;

const fileExists = async (filePath) => {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const chunk = (arr, size) => {
  const list = [];
  for (let i = 0; i < arr.length; i += size) {
    list.push(arr.slice(i, i + size));
  }
  return list;
};

const fetchJson = async (url) => {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
      referer: "https://music.163.com/",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.json();
};

const fetchPlaylistTrackIds = async () => {
  const payload = await fetchJson(playlistDetailUrl);
  if (payload?.code !== 200) {
    throw new Error(`Playlist API returned code ${payload?.code ?? "unknown"}`);
  }

  const ids = Array.isArray(payload?.playlist?.trackIds)
    ? payload.playlist.trackIds
        .map((item) => Number(item?.id))
        .filter((id) => Number.isFinite(id))
    : [];

  if (ids.length === 0) {
    throw new Error("Playlist has no tracks");
  }
  return ids;
};

const fetchSongDetails = async (ids) => {
  const songMap = new Map();
  const groups = chunk(ids, 100);

  for (const group of groups) {
    const cParam = encodeURIComponent(JSON.stringify(group.map((id) => ({ id }))));
    const detailUrl = `https://music.163.com/api/v3/song/detail?c=${cParam}`;
    const payload = await fetchJson(detailUrl);
    if (payload?.code !== 200) {
      throw new Error(`Song detail API returned code ${payload?.code ?? "unknown"}`);
    }

    const songs = Array.isArray(payload?.songs) ? payload.songs : [];
    for (const song of songs) {
      const id = Number(song?.id);
      if (!Number.isFinite(id)) continue;
      songMap.set(id, song);
    }
  }

  return ids
    .map((id) => {
      const song = songMap.get(id);
      if (!song) return null;
      const artist = Array.isArray(song?.ar)
        ? song.ar.map((item) => item?.name).filter(Boolean).join(", ")
        : "";

      return {
        name: song?.name ?? "",
        artist,
        url: `https://music.163.com/song/media/outer/url?id=${id}.mp3`,
        cover: song?.al?.picUrl ?? "",
        lrc: `https://api.injahow.cn/meting/?server=netease&type=lrc&id=${id}`,
        id: String(id),
      };
    })
    .filter((item) => item?.name && item?.url);
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
  const trackIds = await fetchPlaylistTrackIds();
  const audioList = await fetchSongDetails(trackIds);
  if (audioList.length === 0) {
    throw new Error("Playlist is empty or invalid from upstream APIs");
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
