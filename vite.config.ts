import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const MANUS_PROXY_TARGET = "https://api.manus.ai";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const openAiKey = env.OPENAI_API_KEY;
  const elevenKey = env.ELEVENLABS_API_KEY;
  const elevenVoiceId = env.ELEVENLABS_VOICE_ID;
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
        server.middlewares.use("/ai-onboarding", async (req, res) => {
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
            const text = parsed?.text;
            if (!text) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: "Missing text" }));
              return;
            }
            const existing = parsed?.existing || {};
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                temperature: 0.2,
                response_format: { type: "json_object" },
                messages: [
                  {
                    role: "system",
                    content:
                      "You extract a user's preferred news region and topics. Respond only in JSON with keys: location (string or null), topics (array of strings or empty array), missing (array containing 'location' and/or 'topics'), followupQuestion (string or null). If uncertain, mark as missing and ask a single follow-up question.",
                  },
                  {
                    role: "user",
                    content: `User reply: ${text}\nExisting location: ${existing.location || ""}\nExisting topics: ${existing.topics || ""}`,
                  },
                ],
              }),
            });
            const data = await response.json().catch(() => ({}));
            const content = data?.choices?.[0]?.message?.content || "{}";
            let parsedContent = {};
            try {
              parsedContent = JSON.parse(content);
            } catch (error) {
              parsedContent = { location: null, topics: [], missing: ["location", "topics"], followupQuestion: null };
            }
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.statusCode = response.ok ? 200 : 500;
            res.end(JSON.stringify(response.ok ? parsedContent : { error: data?.error?.message || "LLM error" }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "Onboarding LLM error" }));
          }
        });
        server.middlewares.use("/manus-file", async (req, res) => {
          try {
            const url = new URL(req.url ?? "", "http://localhost");
            const target = url.searchParams.get("url");
            if (!target || !/^https?:\/\//i.test(target)) {
              res.statusCode = 400;
              res.end("Invalid url");
              return;
            }
            const response = await fetch(target, {
              headers: { "User-Agent": "Mozilla/5.0" },
            });
            const text = await response.text();
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.statusCode = response.ok ? 200 : response.status;
            res.end(text);
          } catch (error) {
            res.statusCode = 500;
            res.end("File proxy error");
          }
        });
        server.middlewares.use("/eleven-tts", async (req, res) => {
          try {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.end("Method not allowed");
              return;
            }
            if (!elevenKey || !elevenVoiceId) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: "Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID" }));
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
            const text = parsed?.text;
            if (!text) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: "Missing text" }));
              return;
            }
            const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId}`, {
              method: "POST",
              headers: {
                "xi-api-key": elevenKey,
                "Content-Type": "application/json",
                Accept: "audio/mpeg",
              },
              body: JSON.stringify({
                text,
                model_id: "eleven_turbo_v2_5",
              }),
            });
            if (!response.ok) {
              const data = await response.json().catch(() => ({}));
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: data?.detail || "TTS failed" }));
              return;
            }
            const arrayBuffer = await response.arrayBuffer();
            res.statusCode = 200;
            res.setHeader("Content-Type", "audio/mpeg");
            res.end(Buffer.from(arrayBuffer));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "TTS proxy error" }));
          }
        });
        server.middlewares.use("/eleven-asr", async (req, res) => {
          try {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.end("Method not allowed");
              return;
            }
            if (!elevenKey) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: "Missing ELEVENLABS_API_KEY" }));
              return;
            }
            const contentType = req.headers["content-type"] || "application/octet-stream";
            const chunks: Buffer[] = [];
            await new Promise<void>((resolve) => {
              req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
              req.on("end", () => resolve());
            });
            const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
              method: "POST",
              headers: {
                "xi-api-key": elevenKey,
                "Content-Type": contentType,
              },
              body: Buffer.concat(chunks),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: data?.detail || "ASR failed" }));
              return;
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ text: data?.text || "" }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "ASR proxy error" }));
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
