var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
var MANUS_PROXY_TARGET = "https://api.manus.ai";
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), "");
    var openAiKey = env.OPENAI_API_KEY;
    var elevenKey = env.ELEVENLABS_API_KEY;
    var elevenVoiceId = env.ELEVENLABS_VOICE_ID;
    return {
        plugins: [
            react(),
            {
                name: "ai-image-proxy",
                configureServer: function (server) {
                    var _this = this;
                    server.middlewares.use("/ai-image", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                        var apiKey, body, parsed, prompt, response, data, url, error_1;
                        var _a, _b, _c;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0:
                                    _d.trys.push([0, 4, , 5]);
                                    if (req.method !== "POST") {
                                        res.statusCode = 405;
                                        res.end("Method not allowed");
                                        return [2 /*return*/];
                                    }
                                    apiKey = openAiKey;
                                    if (!apiKey) {
                                        res.statusCode = 500;
                                        res.setHeader("Content-Type", "application/json; charset=utf-8");
                                        res.end(JSON.stringify({ error: "Missing OPENAI_API_KEY" }));
                                        return [2 /*return*/];
                                    }
                                    return [4 /*yield*/, new Promise(function (resolve) {
                                            var raw = "";
                                            req.on("data", function (chunk) {
                                                raw += chunk;
                                            });
                                            req.on("end", function () { return resolve(raw); });
                                        })];
                                case 1:
                                    body = _d.sent();
                                    parsed = body ? JSON.parse(body) : {};
                                    prompt = parsed === null || parsed === void 0 ? void 0 : parsed.prompt;
                                    if (!prompt) {
                                        res.statusCode = 400;
                                        res.setHeader("Content-Type", "application/json; charset=utf-8");
                                        res.end(JSON.stringify({ error: "Missing prompt" }));
                                        return [2 /*return*/];
                                    }
                                    return [4 /*yield*/, fetch("https://api.openai.com/v1/images/generations", {
                                            method: "POST",
                                            headers: {
                                                Authorization: "Bearer ".concat(apiKey),
                                                "Content-Type": "application/json",
                                            },
                                            body: JSON.stringify({
                                                model: "dall-e-3",
                                                prompt: prompt,
                                                size: "1024x1024",
                                            }),
                                        })];
                                case 2:
                                    response = _d.sent();
                                    return [4 /*yield*/, response.json()];
                                case 3:
                                    data = (_d.sent());
                                    url = (_b = (_a = data === null || data === void 0 ? void 0 : data.data) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.url;
                                    res.setHeader("Content-Type", "application/json; charset=utf-8");
                                    res.statusCode = response.ok && url ? 200 : 500;
                                    res.end(JSON.stringify({ url: url, error: response.ok ? undefined : (_c = data === null || data === void 0 ? void 0 : data.error) === null || _c === void 0 ? void 0 : _c.message }));
                                    return [3 /*break*/, 5];
                                case 4:
                                    error_1 = _d.sent();
                                    res.statusCode = 500;
                                    res.setHeader("Content-Type", "application/json; charset=utf-8");
                                    res.end(JSON.stringify({ error: "AI image error" }));
                                    return [3 /*break*/, 5];
                                case 5: return [2 /*return*/];
                            }
                        });
                    }); });
                    server.middlewares.use("/ai-onboarding", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                        var apiKey, body, parsed, text, existing, response, data, content, parsedContent, error_2;
                        var _a, _b, _c, _d;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0:
                                    _e.trys.push([0, 4, , 5]);
                                    if (req.method !== "POST") {
                                        res.statusCode = 405;
                                        res.end("Method not allowed");
                                        return [2 /*return*/];
                                    }
                                    apiKey = openAiKey;
                                    if (!apiKey) {
                                        res.statusCode = 500;
                                        res.setHeader("Content-Type", "application/json; charset=utf-8");
                                        res.end(JSON.stringify({ error: "Missing OPENAI_API_KEY" }));
                                        return [2 /*return*/];
                                    }
                                    return [4 /*yield*/, new Promise(function (resolve) {
                                            var raw = "";
                                            req.on("data", function (chunk) {
                                                raw += chunk;
                                            });
                                            req.on("end", function () { return resolve(raw); });
                                        })];
                                case 1:
                                    body = _e.sent();
                                    parsed = body ? JSON.parse(body) : {};
                                    text = parsed === null || parsed === void 0 ? void 0 : parsed.text;
                                    if (!text) {
                                        res.statusCode = 400;
                                        res.setHeader("Content-Type", "application/json; charset=utf-8");
                                        res.end(JSON.stringify({ error: "Missing text" }));
                                        return [2 /*return*/];
                                    }
                                    existing = (parsed === null || parsed === void 0 ? void 0 : parsed.existing) || {};
                                    return [4 /*yield*/, fetch("https://api.openai.com/v1/chat/completions", {
                                            method: "POST",
                                            headers: {
                                                Authorization: "Bearer ".concat(apiKey),
                                                "Content-Type": "application/json",
                                            },
                                            body: JSON.stringify({
                                                model: "gpt-4o-mini",
                                                temperature: 0.2,
                                                response_format: { type: "json_object" },
                                                messages: [
                                                    {
                                                        role: "system",
                                                        content: "You extract a user's preferred news region and topics. Respond only in JSON with keys: location (string or null), topics (array of strings or empty array), missing (array containing 'location' and/or 'topics'), followupQuestion (string or null). If uncertain, mark as missing and ask a single follow-up question.",
                                                    },
                                                    {
                                                        role: "user",
                                                        content: "User reply: ".concat(text, "\nExisting location: ").concat(existing.location || "", "\nExisting topics: ").concat(existing.topics || ""),
                                                    },
                                                ],
                                            }),
                                        })];
                                case 2:
                                    response = _e.sent();
                                    return [4 /*yield*/, response.json().catch(function () { return ({}); })];
                                case 3:
                                    data = (_e.sent());
                                    content = ((_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || "{}";
                                    parsedContent = {};
                                    try {
                                        parsedContent = JSON.parse(content);
                                    }
                                    catch (error) {
                                        parsedContent = { location: null, topics: [], missing: ["location", "topics"], followupQuestion: null };
                                    }
                                    res.setHeader("Content-Type", "application/json; charset=utf-8");
                                    res.statusCode = response.ok ? 200 : 500;
                                    res.end(JSON.stringify(response.ok ? parsedContent : { error: ((_d = data === null || data === void 0 ? void 0 : data.error) === null || _d === void 0 ? void 0 : _d.message) || "LLM error" }));
                                    return [3 /*break*/, 5];
                                case 4:
                                    error_2 = _e.sent();
                                    res.statusCode = 500;
                                    res.setHeader("Content-Type", "application/json; charset=utf-8");
                                    res.end(JSON.stringify({ error: "Onboarding LLM error" }));
                                    return [3 /*break*/, 5];
                                case 5: return [2 /*return*/];
                            }
                        });
                    }); });
                    server.middlewares.use("/manus-file", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                        var url, target, response, text, error_3;
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _b.trys.push([0, 3, , 4]);
                                    url = new URL((_a = req.url) !== null && _a !== void 0 ? _a : "", "http://localhost");
                                    target = url.searchParams.get("url");
                                    if (!target || !/^https?:\/\//i.test(target)) {
                                        res.statusCode = 400;
                                        res.end("Invalid url");
                                        return [2 /*return*/];
                                    }
                                    return [4 /*yield*/, fetch(target, {
                                            headers: { "User-Agent": "Mozilla/5.0" },
                                        })];
                                case 1:
                                    response = _b.sent();
                                    return [4 /*yield*/, response.text()];
                                case 2:
                                    text = _b.sent();
                                    res.setHeader("Content-Type", "text/plain; charset=utf-8");
                                    res.statusCode = response.ok ? 200 : response.status;
                                    res.end(text);
                                    return [3 /*break*/, 4];
                                case 3:
                                    error_3 = _b.sent();
                                    res.statusCode = 500;
                                    res.end("File proxy error");
                                    return [3 /*break*/, 4];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); });
                    server.middlewares.use("/eleven-tts", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                        var body, parsed, text, response, data, arrayBuffer, error_4;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    _a.trys.push([0, 6, , 7]);
                                    if (req.method !== "POST") {
                                        res.statusCode = 405;
                                        res.end("Method not allowed");
                                        return [2 /*return*/];
                                    }
                                    if (!elevenKey || !elevenVoiceId) {
                                        res.statusCode = 500;
                                        res.setHeader("Content-Type", "application/json; charset=utf-8");
                                        res.end(JSON.stringify({ error: "Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID" }));
                                        return [2 /*return*/];
                                    }
                                    return [4 /*yield*/, new Promise(function (resolve) {
                                            var raw = "";
                                            req.on("data", function (chunk) {
                                                raw += chunk;
                                            });
                                            req.on("end", function () { return resolve(raw); });
                                        })];
                                case 1:
                                    body = _a.sent();
                                    parsed = body ? JSON.parse(body) : {};
                                    text = parsed === null || parsed === void 0 ? void 0 : parsed.text;
                                    if (!text) {
                                        res.statusCode = 400;
                                        res.setHeader("Content-Type", "application/json; charset=utf-8");
                                        res.end(JSON.stringify({ error: "Missing text" }));
                                        return [2 /*return*/];
                                    }
                                    return [4 /*yield*/, fetch("https://api.elevenlabs.io/v1/text-to-speech/".concat(elevenVoiceId), {
                                            method: "POST",
                                            headers: {
                                                "xi-api-key": elevenKey,
                                                "Content-Type": "application/json",
                                                Accept: "audio/mpeg",
                                            },
                                            body: JSON.stringify({
                                                text: text,
                                                model_id: "eleven_turbo_v2_5",
                                            }),
                                        })];
                                case 2:
                                    response = _a.sent();
                                    if (!!response.ok) return [3 /*break*/, 4];
                                    return [4 /*yield*/, response.json().catch(function () { return ({}); })];
                                case 3:
                                    data = (_a.sent());
                                    res.statusCode = 500;
                                    res.setHeader("Content-Type", "application/json; charset=utf-8");
                                    res.end(JSON.stringify({ error: (data === null || data === void 0 ? void 0 : data.detail) || "TTS failed" }));
                                    return [2 /*return*/];
                                case 4: return [4 /*yield*/, response.arrayBuffer()];
                                case 5:
                                    arrayBuffer = _a.sent();
                                    res.statusCode = 200;
                                    res.setHeader("Content-Type", "audio/mpeg");
                                    res.end(Buffer.from(arrayBuffer));
                                    return [3 /*break*/, 7];
                                case 6:
                                    error_4 = _a.sent();
                                    res.statusCode = 500;
                                    res.setHeader("Content-Type", "application/json; charset=utf-8");
                                    res.end(JSON.stringify({ error: "TTS proxy error" }));
                                    return [3 /*break*/, 7];
                                case 7: return [2 /*return*/];
                            }
                        });
                    }); });
                    server.middlewares.use("/eleven-asr", function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                        var contentType, chunks_1, response, data, error_5;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    _a.trys.push([0, 4, , 5]);
                                    if (req.method !== "POST") {
                                        res.statusCode = 405;
                                        res.end("Method not allowed");
                                        return [2 /*return*/];
                                    }
                                    if (!elevenKey) {
                                        res.statusCode = 500;
                                        res.setHeader("Content-Type", "application/json; charset=utf-8");
                                        res.end(JSON.stringify({ error: "Missing ELEVENLABS_API_KEY" }));
                                        return [2 /*return*/];
                                    }
                                    contentType = req.headers["content-type"] || "application/octet-stream";
                                    chunks_1 = [];
                                    return [4 /*yield*/, new Promise(function (resolve) {
                                            req.on("data", function (chunk) { return chunks_1.push(Buffer.from(chunk)); });
                                            req.on("end", function () { return resolve(); });
                                        })];
                                case 1:
                                    _a.sent();
                                    return [4 /*yield*/, fetch("https://api.elevenlabs.io/v1/speech-to-text", {
                                            method: "POST",
                                            headers: {
                                                "xi-api-key": elevenKey,
                                                "Content-Type": contentType,
                                            },
                                            body: Buffer.concat(chunks_1),
                                        })];
                                case 2:
                                    response = _a.sent();
                                    return [4 /*yield*/, response.json().catch(function () { return ({}); })];
                                case 3:
                                    data = (_a.sent());
                                    if (!response.ok) {
                                        res.statusCode = 500;
                                        res.setHeader("Content-Type", "application/json; charset=utf-8");
                                        res.end(JSON.stringify({ error: (data === null || data === void 0 ? void 0 : data.detail) || "ASR failed" }));
                                        return [2 /*return*/];
                                    }
                                    res.statusCode = 200;
                                    res.setHeader("Content-Type", "application/json; charset=utf-8");
                                    res.end(JSON.stringify({ text: (data === null || data === void 0 ? void 0 : data.text) || "" }));
                                    return [3 /*break*/, 5];
                                case 4:
                                    error_5 = _a.sent();
                                    res.statusCode = 500;
                                    res.setHeader("Content-Type", "application/json; charset=utf-8");
                                    res.end(JSON.stringify({ error: "ASR proxy error" }));
                                    return [3 /*break*/, 5];
                                case 5: return [2 /*return*/];
                            }
                        });
                    }); });
                },
            },
        ],
        server: {
            port: 5173,
            proxy: {
                "/manus": {
                    target: MANUS_PROXY_TARGET,
                    changeOrigin: true,
                    rewrite: function (path) { return path.replace(/^\/manus/, ""); },
                },
            },
        },
    };
});
