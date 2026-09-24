import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pitaka",
    short_name: "Pitaka",
    description: "Where did my money go?",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f1ea",
    theme_color: "#1a5c44",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
