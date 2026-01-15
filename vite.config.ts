import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const MANUS_PROXY_TARGET = "https://api.manus.ai";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const openAiKey = env.OPENAI_API_KEY;
  return {
  plugins: [
    react(),
    {
      name: "ai-image-proxy",
      configureServer(server) {
        server.middlewares.use("/ai-image", async (req, res) => {
          try {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.end("Method not allowed");
              return;
            }
            const apiKey = openAiKey;
            if (!apiKey) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: "Missing OPENAI_API_KEY" }));
              return;
            }
            const body = await new Promise<string>((resolve) => {
              let raw = "";
              req.on("data", (chunk) => {
                raw += chunk;
              });
              req.on("end", () => resolve(raw));
            });
            const parsed = body ? JSON.parse(body) : {};
            const prompt = parsed?.prompt;
            if (!prompt) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: "Missing prompt" }));
              return;
            }
            const response = await fetch("https://api.openai.com/v1/images/generations", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "dall-e-3",
                prompt,
                size: "1024x1024",
              }),
            });
            const data = await response.json();
            const url = data?.data?.[0]?.url;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.statusCode = response.ok && url ? 200 : 500;
            res.end(JSON.stringify({ url, error: response.ok ? undefined : data?.error?.message }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "AI image error" }));
          }
        });
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      "/manus": {
        target: MANUS_PROXY_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/manus/, ""),
      },
    },
  },
  };
});
