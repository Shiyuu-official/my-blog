// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import remarkGfm from 'remark-gfm';

// https://astro.build/config
export default defineConfig({
	site: 'https://Shiyuu-official.github.io',
  base: '/',
  markdown: {
    remarkPlugins: [remarkGfm],
  },
	integrations: [
    mdx({
      extendMarkdownConfig: true,
    }),
    sitemap(),
  ],
});
