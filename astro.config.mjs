import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import d2 from "astro-d2";

export default defineConfig({
    site: "https://milliyin.dev",
    trailingSlash: "never",
    prefetch: {
        prefetchAll: true,
        defaultStrategy: "viewport"
    },
    integrations: [
        d2({
            pad: 0,
            fonts: {
                regular: "./assets/Geist.ttf",
                bold: "./assets/Geist.ttf",
                italic: "./assets/Geist.ttf",
                semibold: "./assets/Geist.ttf"
            },
            theme: {
                default: "1",
                dark: false
            }
        }),
        tailwind()
    ]
});
