#!/usr/bin/env python3
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from datetime import datetime, timezone

from pixivpy3 import AppPixivAPI


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / "src" / "data" / "pixiv-weekly-top10.json"
IMAGE_DIR = ROOT / "public" / "pixiv-weekly"
SOURCE = "pixivpy3:illust_ranking(mode=week)"
TARGET_COUNT = 10
PAGE_SIZE = 30


def is_illustration(illust) -> bool:
    # Pixiv types are usually: "illustration", "manga", "ugoira"
    illust_type = str(getattr(illust, "type", "") or "").lower()
    return illust_type in {"illustration", "illust"}


def ext_from_url(url: str) -> str:
    path = urlparse(url).path
    suffix = Path(path).suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp"}:
        return suffix
    return ".jpg"


def main() -> None:
    refresh_token = (os.getenv("PIXIV_REFRESH_TOKEN") or "").strip()
    if not refresh_token:
        raise RuntimeError("PIXIV_REFRESH_TOKEN is missing.")

    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    api = AppPixivAPI()
    api.set_accept_language("zh-cn")
    api.auth(refresh_token=refresh_token)

    collected = []
    seen_ids = set()
    offset = 0
    max_rounds = 8

    for _ in range(max_rounds):
        ranking = api.illust_ranking(mode="week", offset=offset)
        round_items = list(getattr(ranking, "illusts", []))
        if not round_items:
            break

        for illust in round_items:
            illust_id = str(getattr(illust, "id", "") or "")
            if not illust_id or illust_id in seen_ids:
                continue
            if not is_illustration(illust):
                continue
            seen_ids.add(illust_id)
            collected.append(illust)
            if len(collected) >= TARGET_COUNT:
                break

        if len(collected) >= TARGET_COUNT:
            break
        offset += PAGE_SIZE

    illusts = collected[:TARGET_COUNT]
    if not illusts:
        raise RuntimeError("No weekly ranking items returned from Pixiv API.")

    items = []
    for index, illust in enumerate(illusts, start=1):
        illust_id = str(illust.id)
        title = str(illust.title or "")
        user_name = str(getattr(illust.user, "name", "") or "")
        user_id = str(getattr(illust.user, "id", "") or "")

        image_urls = getattr(illust, "image_urls", None)
        thumb_url = ""
        if image_urls:
            thumb_url = (
                getattr(image_urls, "large", "")
                or getattr(image_urls, "medium", "")
                or getattr(image_urls, "square_medium", "")
                or ""
            )
        thumb_url = str(thumb_url)

        local_thumb = ""
        if thumb_url:
            ext = ext_from_url(thumb_url)
            filename = f"{illust_id}{ext}"
            try:
                api.download(thumb_url, path=str(IMAGE_DIR), name=filename)
                local_thumb = f"/pixiv-weekly/{filename}"
            except Exception:
                local_thumb = ""

        tags = []
        for tag in list(getattr(illust, "tags", [])):
            tag_name = str(getattr(tag, "name", "") or "").strip()
            if tag_name:
                tags.append(tag_name)

        items.append(
            {
                "rank": index,
                "id": illust_id,
                "title": title,
                "userName": user_name,
                "userId": user_id,
                "artworkUrl": f"https://www.pixiv.net/artworks/{illust_id}",
                "thumbnailUrl": local_thumb or thumb_url,
                "fallbackThumbnailUrls": [thumb_url] if local_thumb else [],
                "originalThumbnailUrl": thumb_url,
                "tags": tags,
            }
        )

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": SOURCE,
        "total": len(items),
        "items": items,
    }

    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Updated {OUTPUT_PATH} with {len(items)} items.")


if __name__ == "__main__":
    main()
