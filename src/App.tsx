import React from "react";

type LogLine = {
  id: string;
  ts: string;
  meta: string;
  message: string;
};

type ManusProgress = {
  status: string;
  taskId?: string;
  taskUrl?: string;
  messages: { id: string; role: string; text: string }[];
};

type ReaderProfile = {
  location: string;
  topics: string;
};

type NewsCategory = "Local" | "International" | "Interest" | "Social" | "Other";

type NewsItem = {
  title: string;
  summary: string;
  url?: string;
  source?: string;
  category: NewsCategory;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  tags?: string[];
};


const DEFAULT_MANUS_BASE = "https://api.manus.ai";
const DEFAULT_MANUS_TASKS = {
  create: "/v1/tasks",
  get: (id: string) => `/v1/tasks/${id}`,
};
const DEFAULT_MANUS_AGENT = "manus-1.6";
const DEFAULT_MANUS_SYSTEM_PROMPT =
  "You are a social web researcher. Search and summarize signals from social platforms (Reddit, Twitter/X, Facebook groups, YouTube comments) and user conversations. Focus on lived experience, opinions, comparisons, and sentiment-not official marketing copy. Return the most relevant links/posts and a concise synthesis of what people are saying. Be brief, avoid fluff, and prioritize recency and credibility.";
const DEFAULT_MANUS_POLL_INTERVAL = 2000;
const DEFAULT_MANUS_MAX_POLL_MS = 10 * 60 * 1000; // 10 minutes
const PROFILE_STORAGE_KEY = "manus.reader.profile";
const CACHE_STORAGE_KEY = "manus.news.cache";
const NEWS_PAGE_SIZE = 9;

function useManusConfig() {
  const base = (import.meta.env.DEV ? "/manus" : DEFAULT_MANUS_BASE).replace(/\/$/, "");
  return {
    key: import.meta.env.VITE_MANUS_API_KEY || "",
    base,
    enabled: true,
    agentProfile: DEFAULT_MANUS_AGENT,
    systemPrompt: DEFAULT_MANUS_SYSTEM_PROMPT,
    taskPaths: {
      create: DEFAULT_MANUS_TASKS.create,
      get: DEFAULT_MANUS_TASKS.get(":id"),
    },
    pollIntervalMs: DEFAULT_MANUS_POLL_INTERVAL,
    maxPollMs: DEFAULT_MANUS_MAX_POLL_MS,
  };
}

function formatElapsed(ms: number) {
  const mins = Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor((ms % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

function loadProfile(): ReaderProfile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.topics === "string") {
      return {
        location: parsed.location || "",
        topics: parsed.topics || "",
      };
    }
  } catch {
    return null;
  }
  return null;
}

function saveProfile(profile: ReaderProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

function loadCachedBrief(): { summary: string; items: NewsItem[] } | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(CACHE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.summary === "string" && Array.isArray(parsed?.items)) {
      return { summary: parsed.summary, items: parsed.items };
    }
  } catch {
    return null;
  }
  return null;
}

function saveCachedBrief(payload: { summary: string; items: NewsItem[]; updatedAt: string }) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(payload));
}

export default function App() {
  const manusConfig = useManusConfig();
  const useManus = manusConfig.enabled && !!manusConfig.key;

  const [profile, setProfile] = React.useState<ReaderProfile | null>(() => loadProfile());
  const [draft, setDraft] = React.useState<ReaderProfile>(() =>
    profile ? { ...profile } : { location: "", topics: "" }
  );
  const [showOnboarding, setShowOnboarding] = React.useState(() => !profile);
  const [brief, setBrief] = React.useState("");
  const [stories, setStories] = React.useState<NewsItem[]>([]);
  const [running, setRunning] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [lastUpdated, setLastUpdated] = React.useState<string | null>(null);
  const [logs, setLogs] = React.useState<LogLine[]>([]);
  const [page, setPage] = React.useState(1);
  const [activeTag, setActiveTag] = React.useState<string | null>(null);
  const [manusProgress, setManusProgress] = React.useState<ManusProgress>({
    status: "idle",
    messages: [],
  });
  const useCachedBrief = import.meta.env.VITE_USE_CACHED_BRIEF === "true";
  const [onboardingStep, setOnboardingStep] = React.useState<"intro" | "location" | "topics" | "confirm">("intro");
  const [listening, setListening] = React.useState(false);
  const [speechError, setSpeechError] = React.useState<string | null>(null);
  const [transcript, setTranscript] = React.useState("");
  const [speaking, setSpeaking] = React.useState(false);

  const startRef = React.useRef<number | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);
  const listenTimeoutRef = React.useRef<number | null>(null);
  const listeningRef = React.useRef(false);
  const speakIdRef = React.useRef(0);
  const applyTranscriptRef = React.useRef<(text: string) => void>(() => undefined);

  const appendLog = React.useCallback((message: string, meta = "") => {
    setLogs((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        ts: new Date().toLocaleTimeString(),
        meta,
        message,
      },
    ]);
  }, []);

  const speak = React.useCallback(async (text: string) => {
    if (typeof window === "undefined") return;
    try {
      setSpeaking(true);
      const speakId = (speakIdRef.current += 1);
      const response = await fetch("/eleven-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        setSpeaking(false);
        return;
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBlob = new Blob([arrayBuffer], { type: "audio/mpeg" });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      await new Promise<void>((resolve) => {
        const cleanup = () => {
          URL.revokeObjectURL(audioUrl);
          setSpeaking(false);
          resolve();
        };
        audio.onended = cleanup;
        audio.onerror = cleanup;
        audio.onpause = cleanup;
        audio.play().catch(cleanup);
      });
      if (speakId !== speakIdRef.current) return;
    } catch {
      setSpeaking(false);
      return;
    }
  }, []);

  const applyTranscript = React.useCallback(
    (text: string) => {
      if (!text) return;
      if (onboardingStep === "location") {
        setDraft((prev) => ({ ...prev, location: text }));
      }
      if (onboardingStep === "topics") {
        setDraft((prev) => ({ ...prev, topics: text }));
      }
    },
    [onboardingStep]
  );

  const startListening = React.useCallback(async () => {
    if (listeningRef.current) return;
    setSpeechError(null);
    setTranscript("");
    try {
      listeningRef.current = true;
      setListening(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        listeningRef.current = false;
        setListening(false);
        if (listenTimeoutRef.current) {
          window.clearTimeout(listenTimeoutRef.current);
          listenTimeoutRef.current = null;
        }
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        try {
          const formData = new FormData();
          formData.append("file", blob, "speech.webm");
          formData.append("audio", blob, "speech.webm");
          formData.append("model_id", "scribe_v1");
          const res = await fetch("/eleven-asr", {
            method: "POST",
            body: formData,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const err = data?.error;
            const message = typeof err === "string" ? err : err ? JSON.stringify(err) : "Speech recognition failed.";
            setSpeechError(message);
            return;
          }
          const text = data?.text || "";
          if (!text.trim()) {
            setSpeechError("I couldn't hear that. Try again and speak a little longer.");
            return;
          }
          setTranscript(text);
          applyTranscriptRef.current(text);
        } catch (error) {
          setSpeechError("Speech recognition failed. Try typing instead.");
        } finally {
          stream.getTracks().forEach((track) => track.stop());
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      listenTimeoutRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, 4500);
    } catch (error) {
      listeningRef.current = false;
      setSpeechError("Microphone access denied.");
      setListening(false);
    }
  }, []);

  const stopListening = React.useCallback(() => {
    if (!mediaRecorderRef.current) return;
    if (listenTimeoutRef.current) {
      window.clearTimeout(listenTimeoutRef.current);
      listenTimeoutRef.current = null;
    }
    mediaRecorderRef.current.stop();
    listeningRef.current = false;
    setListening(false);
  }, []);

  React.useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  React.useEffect(() => {
    applyTranscriptRef.current = applyTranscript;
  }, [applyTranscript]);

  React.useEffect(() => {
    if (!showOnboarding) return;
    setOnboardingStep("intro");
    setTranscript("");
    setSpeechError(null);
  }, [showOnboarding]);

  React.useEffect(() => {
    if (!showOnboarding) return;
    let cancelled = false;
    const run = async () => {
      if (listeningRef.current) stopListening();
      if (onboardingStep === "intro") {
        await speak(
          "Welcome to your personal daily news assistant. I will ask a few quick questions to help me understand more about you."
        );
      }
      if (onboardingStep === "location") {
        await speak("Where should I focus the local news? You can say a city, country, or global.");
      }
      if (onboardingStep === "topics") {
        await speak("What topics should I follow? You can list a few interests.");
      }
      if (onboardingStep === "confirm") {
        await speak("Great. I will start the briefing now.");
      }
      if (cancelled) return;
      if ((onboardingStep === "location" || onboardingStep === "topics") && !listeningRef.current) {
        await startListening();
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [onboardingStep, showOnboarding, speak, startListening, stopListening]);

  React.useEffect(() => {
    appendLog(
      useManus ? `Manus enabled (base ${manusConfig.base}).` : "Manus disabled or key missing; demo mode.",
      "mode"
    );
    if (useManus) {
      appendLog("Using Manus system prompt tailored for social browsing.", "manus");
    }
  }, [appendLog, manusConfig.base, useManus]);

  React.useEffect(() => {
    const totalPages = Math.max(1, Math.ceil((stories.length - 1) / NEWS_PAGE_SIZE));
    if (page > totalPages) setPage(totalPages);
  }, [page, stories.length]);

  React.useEffect(() => {
    setActiveTag(null);
    setPage(1);
  }, [stories.length]);

  React.useEffect(() => {
    if (!running || !startRef.current) {
      setElapsed(0);
      return;
    }
    const id = window.setInterval(() => {
      if (startRef.current) setElapsed(Date.now() - startRef.current);
    }, 200);
    return () => window.clearInterval(id);
  }, [running]);

  async function completeOnboarding() {
    if (listening) stopListening();
    const nextProfile = {
      location: draft.location.trim(),
      topics: draft.topics.trim(),
    };
    if (!nextProfile.topics) return;
    setProfile(nextProfile);
    saveProfile(nextProfile);
    setShowOnboarding(false);
    await runBrief(nextProfile);
  }

  async function runBrief(nextProfile: ReaderProfile) {
    if (running) return;
    setBrief("");
    setStories([]);
    setLogs([]);
    setPage(1);
    setRunning(true);
    startRef.current = Date.now();
    setManusProgress({ status: useManus ? "running" : "demo", messages: [] });
    appendLog(`Building brief for ${nextProfile.topics}.`, "brief");
    try {
      if (useCachedBrief) {
        const cached = loadCachedBrief();
        if (cached) {
          runDemoTrace(appendLog);
          await wait(1400);
          setBrief(cached.summary);
          setStories(cached.items);
          appendLog("Loaded cached briefing from local storage.", "brief");
          return;
        }
        appendLog("No cached briefing found; running live fetch.", "brief");
      }
      if (!useManus) {
        runDemoTrace(appendLog);
        await wait(2200);
        const demo = buildDemoBrief(nextProfile);
        setBrief(demo.summary);
        const withImages = await generateAiMedia(demo.items, nextProfile, appendLog);
        setStories(withImages);
        saveCachedBrief({ summary: demo.summary, items: withImages, updatedAt: new Date().toISOString() });
        appendLog("Generated demo brief locally.", "demo");
        return;
      }

      const taskResult = await runManusTask(
        buildNewsPrompt(nextProfile, manusConfig),
        manusConfig,
        appendLog,
        (partial) => {
          const parsed = parseNewsText(extractManusText(partial));
          if (parsed.summary) setBrief(parsed.summary);
          if (parsed.items.length) setStories(parsed.items);
          setManusProgress({
            status: partial.status || "running",
            taskId: partial.id,
            taskUrl: partial.metadata?.task_url || partial.metadata?.taskUrl,
            messages: extractManusMessages(partial),
          });
        }
      );

      const fileText = await fetchManusOutputFile(taskResult, appendLog);
      const parsed = parseNewsText(fileText || extractManusText(taskResult));
      setBrief(parsed.summary);
      const withImages = await generateAiMedia(parsed.items, nextProfile, appendLog);
      setStories(withImages);
      saveCachedBrief({ summary: parsed.summary, items: withImages, updatedAt: new Date().toISOString() });
      setManusProgress({
        status: taskResult.status || "completed",
        taskId: taskResult.id,
        taskUrl: taskResult.metadata?.task_url || taskResult.metadata?.taskUrl,
        messages: extractManusMessages(taskResult),
      });
      appendLog("Manus brief ready.", "manus");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown Manus error";
      appendLog(`Brief failed: ${message}`, "error");
    } finally {
      setRunning(false);
      setLastUpdated(new Date().toLocaleString());
    }
  }

  const extraStories = stories.slice(1);
  const visibleStories = activeTag
    ? extraStories.filter((story) => story.tags?.some((tag) => tag.toLowerCase() === activeTag.toLowerCase()))
    : extraStories;
  const totalPages = Math.max(1, Math.ceil(visibleStories.length / NEWS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * NEWS_PAGE_SIZE;
  const pagedStories = visibleStories.slice(pageStart, pageStart + NEWS_PAGE_SIZE);
  const availableTags = Array.from(
    new Set(extraStories.flatMap((story) => story.tags ?? []).map((tag) => tag.trim()).filter(Boolean))
  );
  const locationSuggestions = ["Global", "Malaysia", "Singapore", "United States", "Europe", "Asia"];
  const topicSuggestions = ["Technology", "Business", "Politics", "Food", "Entertainment", "Sports"];
  const onboardingPrompt =
    onboardingStep === "intro"
      ? "I can tailor a daily briefing in two quick questions."
      : onboardingStep === "location"
      ? "Where should I focus local coverage?"
      : onboardingStep === "topics"
      ? "What topics should I follow?"
      : "Ready to start your personalized briefing.";
  const topicsReady = draft.topics.trim().length > 0;

  if (showOnboarding) {
    return (
      <div className="page page--onboarding">
        <header className="onboarding-hero">
          <div>
            <p className="eyebrow">Newspaper</p>
            <h1>Personal briefing setup</h1>
            <p className="subtitle">A quick voice-first onboarding to tune your daily digest.</p>
          </div>
          <div className="onboarding-steps">
            <span className={`onboarding-step ${onboardingStep === "intro" ? "is-active" : ""}`}>Intro</span>
            <span className={`onboarding-step ${onboardingStep === "location" ? "is-active" : ""}`}>Location</span>
            <span className={`onboarding-step ${onboardingStep === "topics" ? "is-active" : ""}`}>Topics</span>
            <span className={`onboarding-step ${onboardingStep === "confirm" ? "is-active" : ""}`}>Confirm</span>
          </div>
        </header>
        <main className="onboarding-stage">
          <section className="onboarding-panel">
            <div className="onboarding-copy">
              <p className="eyebrow">Onboarding</p>
              <h2 className="onboarding-title">Meet the living orb</h2>
              <p className="onboarding-prompt">{onboardingPrompt}</p>
              <p className="onboarding-hint">
                {listening ? "Listening..." : "I will open the mic right after I finish speaking."}
              </p>
              {speechError && <p className="muted">{speechError}</p>}
              {transcript && (
                <div className="orb-transcript">
                  <span className="eyebrow">Heard</span>
                  <p>{transcript}</p>
                </div>
              )}
            </div>
            <div
              className={`orb orb--living ${speaking ? "orb--speaking" : ""} ${listening ? "orb--listening" : ""} ${
                onboardingStep === "location" || onboardingStep === "topics" ? "orb--ready" : ""
              }`}
              onClick={() => {
                if (onboardingStep !== "location" && onboardingStep !== "topics") return;
                if (listening) stopListening();
                else startListening();
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                if (onboardingStep !== "location" && onboardingStep !== "topics") return;
                if (listening) stopListening();
                else startListening();
              }}
            >
              <span className="orb__glow" />
              <span className="orb__core" />
              <span className="orb__ring" />
              <span className="orb__spark orb__spark--a" />
              <span className="orb__spark orb__spark--b" />
            </div>
            <div className="orb-content">
              {onboardingStep === "intro" && (
                <div className="orb-actions">
                  <button
                    className="button button--paper"
                    type="button"
                    onClick={() => setOnboardingStep("location")}
                  >
                    Let us begin
                  </button>
                </div>
              )}
              {onboardingStep === "location" && (
                <div className="orb-actions">
                  <div className="field">
                    <span>Location focus</span>
                    <input
                      type="text"
                      placeholder="Global, Singapore, Bay Area"
                      value={draft.location}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          location: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="tag-row">
                    {locationSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="chip chip--paper"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            location: suggestion,
                          }))
                        }
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                  <div className="orb-actions__row">
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={listening ? stopListening : startListening}
                    >
                      {listening ? "Stop listening" : "Speak location"}
                    </button>
                    <button className="button button--paper" type="button" onClick={() => setOnboardingStep("topics")}>
                      Continue
                    </button>
                  </div>
                </div>
              )}
              {onboardingStep === "topics" && (
                <div className="orb-actions">
                  <div className="field">
                    <span>Topics to track</span>
                    <input
                      type="text"
                      placeholder="AI policy, product launches, fintech, consumer tech"
                      value={draft.topics}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          topics: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="tag-row">
                    {topicSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="chip chip--paper"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            topics: prev.topics ? `${prev.topics}, ${suggestion}` : suggestion,
                          }))
                        }
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                  <div className="orb-actions__row">
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={listening ? stopListening : startListening}
                    >
                      {listening ? "Stop listening" : "Speak topics"}
                    </button>
                    <button
                      className="button button--paper"
                      type="button"
                      onClick={() => setOnboardingStep("confirm")}
                      disabled={!topicsReady}
                    >
                      Review
                    </button>
                  </div>
                </div>
              )}
              {onboardingStep === "confirm" && (
                <div className="orb-actions">
                  <div className="orb-summary">
                    <p className="eyebrow">Edition</p>
                    <p>{draft.location || "Global"}</p>
                    <p className="eyebrow">Topics</p>
                    <p>{draft.topics}</p>
                  </div>
                  <div className="orb-actions__row">
                    <button className="button button--ghost" type="button" onClick={() => setOnboardingStep("topics")}>
                      Edit topics
                    </button>
                    <button
                      className="button button--paper"
                      type="button"
                      onClick={completeOnboarding}
                      disabled={!topicsReady || running}
                    >
                      Start briefing
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="page page--news">
      <header className="masthead">
        <div className="masthead__title">
          <p className="eyebrow">Newspaper</p>
          <h1>Daily Briefing</h1>
          <p className="subtitle">A personalized newspaper-style roundup of social signals.</p>
        </div>
        {profile && !showOnboarding && (
          <div className="masthead__meta">
            <div>
              <p className="eyebrow">Edition</p>
              <p className="masthead__value">{profile.location || "Global"}</p>
            </div>
            <div>
              <p className="eyebrow">Topics</p>
              <p className="masthead__value">{profile.topics}</p>
            </div>
            <div>
              <p className="eyebrow">Updated</p>
              <p className="masthead__value">{lastUpdated || "—"}</p>
            </div>
          </div>
        )}
      </header>

      <main className="grid">

        {profile && !showOnboarding && (
          <section className="panel panel--wide panel--paper">
            <div className="panel__header panel__header--tight">
              <div>
                <p className="eyebrow">{safePage === 1 ? "Front page" : `Page ${safePage}`}</p>
                <h3>{safePage === 1 ? "Your personalized edition" : "More stories"}</h3>
                <p className="muted">
                  {safePage === 1
                    ? "Pulling signals from social chatter and community discussion."
                    : "Continuing your personalized briefing."}
                </p>
              </div>
              <div className="panel__actions">
                <button
                  className="button button--paper"
                  type="button"
                  onClick={() => profile && runBrief(profile)}
                  disabled={running}
                >
                  {running ? "Gathering" : "Refresh"}
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => {
                    if (profile) {
                      setDraft(profile);
                      setOnboardingStep("intro");
                      setShowOnboarding(true);
                    }
                  }}
                >
                  Update topics
                </button>
              </div>
            </div>

            {running && <p className="muted">Composing your front page... sit tight.</p>}

            {running ? (
              <div className="news-grid news-grid--placeholder">
                <p className="muted">Building your front page...</p>
              </div>
            ) : extraStories.length === 0 ? (
              <div className="news-card news-card--empty">
                <p className="muted">Related stories will appear here once the brief is ready.</p>
              </div>
            ) : (
              <>
                {availableTags.length > 0 && (
                  <div className="tag-filter">
                    <button
                      type="button"
                      className={`chip chip--paper ${activeTag ? "" : "chip--active"}`}
                      onClick={() => {
                        setActiveTag(null);
                        setPage(1);
                      }}
                    >
                      All
                    </button>
                    {availableTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={`chip chip--paper ${activeTag === tag ? "chip--active" : ""}`}
                        onClick={() => {
                          setActiveTag(tag);
                          setPage(1);
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
                <div className="news-grid news-grid--masonry">
                  {pagedStories.map((story) => (
                    <article
                      key={`${story.title}-${story.url ?? "story"}`}
                      className={`news-card ${getStorySize(story)}`}
                    >
                      {story.mediaUrl && story.mediaType === "image" && (
                        <img className="news-media" src={story.mediaUrl} alt={story.title} />
                      )}
                      {story.mediaUrl && story.mediaType === "video" && (
                        <a className="news-link" href={story.mediaUrl} target="_blank" rel="noreferrer">
                          Watch the clip
                        </a>
                      )}
                      <h6 className="news-card__title">{story.title}</h6>
                      {story.tags?.length ? (
                        <div className="tag-row">
                          {story.tags.map((tag) => (
                            <span key={`${story.title}-${tag}`} className="chip chip--paper">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <p className="news-card__summary">{story.summary}</p>
                      {story.url && (
                        <a className="news-link" href={story.url} target="_blank" rel="noreferrer">
                          Source link
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
            {totalPages > 1 && (
              <div className="news-pagination">
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={safePage === 1}
                >
                  Previous page
                </button>
                <span className="news-pagination__label">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={safePage === totalPages}
                >
                  Next page
                </button>
              </div>
            )}
          </section>
        )}

        <section className="panel panel--wide">
          <div className="panel__header panel__header--tight">
            <div>
              <p className="eyebrow">Background process</p>
              <h3>Agent trace</h3>
            </div>
            <div className="pill pill--ghost">{formatElapsed(elapsed)}</div>
          </div>
          <div className="log">
            {logs.length === 0 ? (
              <p className="muted">No trace yet. Start a briefing to watch the agent work.</p>
            ) : (
              logs.map((line) => (
                <p key={line.id} className="log__line">
                  <span className="log__meta">[{line.ts}] {line.meta}</span>
                  <br />
                  {line.message}
                </p>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function manusHeaders(manusConfig: ReturnType<typeof useManusConfig>) {
  return {
    "Content-Type": "application/json",
    API_KEY: manusConfig.key,
  };
}

async function runManusTask(
  prompt: string,
  manusConfig: ReturnType<typeof useManusConfig>,
  appendLog: (message: string, meta?: string) => void,
  onProgress?: (data: any) => void
) {
  const createUrl = `${manusConfig.base}${manusConfig.taskPaths.create}`;
  const payload = {
    prompt,
    agentProfile: manusConfig.agentProfile,
    taskMode: "agent",
    hideInTaskList: true,
  };

  appendLog("Creating Manus task...", "manus");
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: manusHeaders(manusConfig),
    body: JSON.stringify(payload),
  });
  if (!createRes.ok) throw new Error(`Create task failed: HTTP ${createRes.status}`);
  const createData = await createRes.json();
  const taskId = createData.task_id || createData.taskId || createData.id;
  if (!taskId) throw new Error("Create task succeeded but no task id returned");

  appendLog(`Task created: ${taskId}. Polling for completion...`, "manus");
  const start = Date.now();
  while (Date.now() - start < manusConfig.maxPollMs) {
    await wait(manusConfig.pollIntervalMs);
    const url = `${manusConfig.base}${resolveTaskGetPath(manusConfig.taskPaths.get, taskId)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: manusHeaders(manusConfig),
    });
    if (!res.ok) {
      appendLog(`Poll failed (HTTP ${res.status}); continuing`, "manus");
      continue;
    }
    const data = await res.json();
    if (onProgress) onProgress(data);
    if (data.status && data.status !== "running" && data.status !== "pending") {
      appendLog(`Task status: ${data.status}`, "manus");
    }
    if (data.status === "completed") {
      appendLog("Task completed.", "manus");
      return data;
    }
    if (data.status === "failed") {
      const err = data.error || "Task failed";
      throw new Error(err);
    }
  }
  throw new Error("Manus task polling timed out");
}

function resolveTaskGetPath(template: string, taskId: string) {
  return template.replace(":id", taskId);
}

function extractManusText(task: any) {
  const outputs: any[] = task?.output || [];
  const assistantOutputs = outputs.filter((o) => o?.role === "assistant");
  const lastAssistant = assistantOutputs[assistantOutputs.length - 1];
  const lastText = (lastAssistant?.content || [])
    .map((c: any) => c?.text)
    .filter(Boolean)
    .join("\n\n");

  if (lastText) return lastText;

  return outputs
    .filter((o) => o?.role !== "user")
    .flatMap((o) => o?.content || [])
    .map((c: any) => c?.text)
    .filter(Boolean)
    .join("\n\n");
}

async function fetchManusOutputFile(task: any, appendLog: (message: string, meta?: string) => void) {
  const outputs: any[] = task?.output || [];
  const fileUrl = outputs
    .flatMap((o) => o?.content || [])
    .map((c: any) => c?.fileUrl)
    .find(Boolean);

  if (!fileUrl) return "";

  try {
    const target = import.meta.env.DEV ? `/manus-file?url=${encodeURIComponent(fileUrl)}` : fileUrl;
    const res = await fetch(target);
    if (!res.ok) {
      appendLog(`Failed to fetch Manus file (${res.status})`, "manus");
      return "";
    }
    const text = await res.text();
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown file fetch error";
    appendLog(`Manus file fetch error (${message})`, "manus");
    return "";
  }
}

function extractManusMessages(task: any): { id: string; role: string; text: string }[] {
  const outputs: any[] = task?.output || [];
  return outputs.map((o) => {
    const text = (o?.content || [])
      .map((c: any) => c?.text)
      .filter(Boolean)
      .join(" ")
      .trim();
    return { id: o?.id || Math.random().toString(), role: o?.role || "message", text };
  });
}

function parseNewsText(text: string): { summary: string; items: NewsItem[] } {
  if (!text) return { summary: "", items: [] };
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const items: NewsItem[] = [];
  const summaryLines: string[] = [];
  let sawBullets = false;

  for (const line of lines) {
    if (/^[-*]\s+/.test(line)) {
      sawBullets = true;
      const item = parseNewsBullet(line);
      if (item) items.push(item);
      continue;
    }
    if (!sawBullets && !line.startsWith("#")) {
      summaryLines.push(line);
    }
  }

  const summary = summaryLines.join(" ").trim();
  const trimmedItems = items.slice(0, 18);
  if (!trimmedItems.length && summary) {
    const title = summary.split(".")[0]?.trim() || "Top story";
    trimmedItems.push({ title, summary, category: "Other", tags: [] });
  }
  return { summary, items: trimmedItems };
}

function parseNewsBullet(line: string): NewsItem | null {
  const cleaned = line.replace(/^[-*]\s+/, "").trim();
  const markdownLink = cleaned.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
  if (markdownLink) {
    const title = markdownLink[1];
    const url = markdownLink[2];
    const summary = cleaned
      .replace(markdownLink[0], "")
      .replace(/^[-–—:]+\s*/, "")
      .trim();
    const parsed = parseCategory(summary);
    return {
      title,
      summary: parsed.summary || "Details in the linked source.",
      url,
      category: parsed.category,
      tags: parsed.tags,
    };
  }

  const urlMatch = cleaned.match(/https?:\/\/\S+/);
  if (urlMatch) {
    const url = urlMatch[0].replace(/[),.]+$/, "");
    const withoutUrl = cleaned.replace(urlMatch[0], "").trim();
    const parts = withoutUrl.split(" - ");
    const title = parts[0] || "Source link";
    const summary = parts.slice(1).join(" - ").trim() || "Details in the linked source.";
    const parsed = parseCategory(summary);
    return {
      title,
      summary: parsed.summary,
      url,
      category: parsed.category,
      tags: parsed.tags,
    };
  }

  if (!cleaned) return null;
  const parsed = parseCategory("");
  return {
    title: cleaned,
    summary: "",
    category: parsed.category,
    tags: parsed.tags,
  };
}

function buildNewsPrompt(profile: ReaderProfile, manusConfig: ReturnType<typeof useManusConfig>) {
  const locationLine = profile.location ? `Location: ${profile.location}.` : "Location: Global.";
  return `${manusConfig.systemPrompt}\n\nYou are preparing a newspaper platform daily briefing. Search fast and shallow, prioritizing speed over depth.\n${locationLine}\nUser interests: ${profile.topics}.\n\nCoverage requirements:\n- Local news (based on location)\n- International news\n- User interest topics\n- Social drama and trending chatter (especially from social media)\n- Only include items from the past 7 days\n- Order items from best match to least relevant\n\nReturn:\n1) A 2-3 sentence front-page summary.\n2) 12-18 bullet items formatted as \"- [Title](URL) - category label (Local/International/Interest/Social) + one-sentence summary.\"\n3) Optional tags: add bracketed tags after the category (example: \"Local [Technology, Policy] - ...\").\nPrefer credible, recent sources with direct links so readers can open them.`;
}

function buildDemoBrief(profile: ReaderProfile): { summary: string; items: NewsItem[] } {
  const topics = profile.topics
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean);
  const summary = `Tracking ${topics.slice(0, 3).join(", ") || "your topics"} with a social-first lens. Local context: ${
    profile.location || "global"
  }.`;
  const items = topics.slice(0, 6).map((topic, index) => ({
    title: `${topic} watch`,
    summary: `Early chatter highlights emerging themes and differing opinions in ${topic}.`,
    url: index === 0 ? "https://news.ycombinator.com" : undefined,
    category: "Interest",
    tags: [topic],
  }));
  return { summary, items };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderMarkdown(text: string) {
  if (!text) return null;
  const blocks = text.split(/\n{2,}/g);
  return blocks.map((block, blockIndex) => {
    const lines = block.split("\n");
    const isList = lines.every((line) => /^[-*]\s+/.test(line));
    if (isList) {
      return (
        <ul key={`md-list-${blockIndex}`}>
          {lines.map((line, idx) => (
            <li key={`md-li-${blockIndex}-${idx}`}>{renderInline(line.replace(/^[-*]\s+/, ""))}</li>
          ))}
        </ul>
      );
    }
    const headingMatch = block.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const HeadingTag = level <= 2 ? "h4" : "h5";
      return <HeadingTag key={`md-h-${blockIndex}`}>{renderInline(content)}</HeadingTag>;
    }
    return (
      <p key={`md-p-${blockIndex}`} className="markdown__paragraph">
        {renderInline(block)}
      </p>
    );
  });
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return parts
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={`md-strong-${index}`}>{part.slice(2, -2)}</strong>;
      }
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        return (
          <a key={`md-link-${index}`} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>
        );
      }
      return <React.Fragment key={`md-text-${index}`}>{part}</React.Fragment>;
    });
}

function runDemoTrace(appendLog: (message: string, meta?: string) => void) {
  const steps = [
    { delay: 0, meta: "demo", message: "Routing to demo newsroom pipeline." },
    { delay: 400, meta: "agent", message: "Drafting fast search queries for local, international, and interest topics." },
    { delay: 800, meta: "web", message: "Scanning fast sources (last 7 days) for headlines." },
    { delay: 1200, meta: "social", message: "Sampling trending social chatter for drama and sentiment." },
    { delay: 1600, meta: "editor", message: "Ranking stories by relevance and freshness." },
    { delay: 2000, meta: "layout", message: "Composing front page and briefs." },
  ];
  steps.forEach((step) => {
    window.setTimeout(() => appendLog(step.message, step.meta), step.delay);
  });
}

function getPagedSlice(items: NewsItem[], page: number, totalPages: number) {
  if (items.length === 0) return [];
  const start = Math.floor(((page - 1) * items.length) / totalPages);
  const end = Math.floor((page * items.length) / totalPages);
  return items.slice(start, end);
}

async function generateAiMedia(
  items: NewsItem[],
  profile: ReaderProfile,
  appendLog: (message: string, meta?: string) => void
) {
  if (!items.length) return items;
  appendLog("Generating AI images for stories...", "media");
  const next = [...items];
  let abortRemaining = false;

  for (let index = 0; index < next.length; index += 1) {
    if (abortRemaining) break;
    const item = next[index];
    try {
      const prompt = buildImagePrompt(item, profile);
      const result = await requestAiImage(prompt);
      if (result.error) {
        if (result.error.includes("Missing OPENAI_API_KEY")) {
          appendLog("Missing OPENAI_API_KEY; skipping AI images.", "media");
          abortRemaining = true;
        } else {
          appendLog(`AI image failed for "${item.title}" (${result.error})`, "media");
        }
        continue;
      }
      if (!result.url) continue;
      next[index] = {
        ...item,
        mediaUrl: result.url,
        mediaType: "image",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown image error";
      appendLog(`AI image failed for "${item.title}" (${message})`, "media");
    }
  }

  return next;
}

async function requestAiImage(prompt: string): Promise<{ url?: string; error?: string }> {
  const response = await fetch("/ai-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { error: data?.error || "AI image request failed" };
  }
  return { url: data?.url };
}

function buildImagePrompt(item: NewsItem, profile: ReaderProfile) {
  const tags = item.tags?.length ? `Tags: ${item.tags.join(", ")}.` : "";
  const location = profile.location ? `Location: ${profile.location}.` : "Location: Global.";
  return `Create a photojournalistic newspaper illustration. ${location} Category: ${item.category}. ${tags}\nTitle: ${item.title}.\nSummary: ${item.summary}\nStyle: cinematic, realistic, no text, no logos.`;
}

function parseCategory(text: string): { category: NewsCategory; summary: string; tags: string[] } {
  if (!text) return { category: "Other", summary: text, tags: [] };
  const tagMatch = text.match(/\[(.+?)\]/);
  const tags = tagMatch
    ? tagMatch[1]
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
  const cleaned = tagMatch ? text.replace(tagMatch[0], "").trim() : text;
  const match = cleaned.match(/^(Local|International|Interest|Social)\b[\s:|-]*(.*)$/i);
  if (!match) return { category: "Other", summary: cleaned, tags };
  const category = normalizeCategory(match[1]);
  const summary = match[2]?.trim() || "";
  return { category, summary, tags };
}

function normalizeCategory(raw: string): NewsCategory {
  const normalized = raw.toLowerCase();
  if (normalized.startsWith("local")) return "Local";
  if (normalized.startsWith("international")) return "International";
  if (normalized.startsWith("interest")) return "Interest";
  if (normalized.startsWith("social")) return "Social";
  return "Other";
}

function getStorySize(story?: NewsItem) {
  if (!story) return "news-card--compact";
  const summaryLength = story.summary?.length ?? 0;
  if (story.mediaUrl && summaryLength > 160) return "news-card--headline";
  if (story.mediaUrl) return "news-card--featured";
  if (summaryLength < 80) return "news-card--compact";
  return "news-card--standard";
}
