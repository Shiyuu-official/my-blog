import type { CollectionEntry } from "astro:content";
import { RECORD_AUTO_HIDE_ENABLED, RECORD_VISIBLE_DAYS } from "../consts";
import { getCategoryFromId } from "./postMeta";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const recordVisibilityWindowMs = RECORD_VISIBLE_DAYS * DAY_IN_MS;

export const isBlogPostVisible = (
  post: CollectionEntry<"blog">,
  now = new Date(),
) => {
  if (post.data.draft) return false;

  const isRecordPost = getCategoryFromId(post.id) === "record";
  if (!isRecordPost) return true;
  if (post.data.pin) return true;
  if (!RECORD_AUTO_HIDE_ENABLED) return true;

  return now.valueOf() - post.data.pubDate.valueOf() <= recordVisibilityWindowMs;
};

export const filterVisibleBlogPosts = (
  posts: CollectionEntry<"blog">[],
  now = new Date(),
) => posts.filter((post) => isBlogPostVisible(post, now));
