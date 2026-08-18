/**
 * Single source of truth for all portfolio content.
 * Every number here is verified against the resume or GitHub — do not invent.
 */

export type Metric = { value: string; label: string };

export type Project = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  metrics?: Metric[];
  stack: string[];
  href?: string;
  live?: string;
  featured: boolean;
  note?: string;
};

export type Contribution = {
  repo: string;
  repoNote: string;
  title: string;
  href?: string;
  state: "merged" | "open" | "issue";
};

export type Role = {
  org: string;
  title: string;
  period: string;
  points: string[];
};

export const identity = {
  name: "Samvrith Bandi",
  thesis: "from microvolts to meaning",
  eyebrow: "~/saratoga-ca → ~/west-lafayette-in",
  headline:
    "I build the whole signal chain — analog front-ends I design from scratch, models I train and quantize, agents that act on what they decode.",
  summary:
    "Electrical engineering student entering Purdue with junior standing. I design sensor PCBs from schematic through fab release, deploy neural networks on-device, and wire cognition into agent interfaces. I contribute to open-source spiking-neural-network and agent-infrastructure libraries, and I coach competitive robotics.",
  email: "samvrith@gmail.com",
  github: "https://github.com/TLXyloph",
  githubHandle: "TLXyloph",
  school: "Purdue ECE · Fall 2026 · junior standing",
};

export const heroStats: Metric[] = [
  { value: "95.4%", label: "gesture accuracy, 1-ch EMG" },
  { value: "102 ms", label: "end-to-end on Orange Pi 5" },
  { value: "~$9", label: "BOM, custom sensor PCB" },
  { value: "610", label: "commits in the last year" },
];

export const projects: Project[] = [
  {
    slug: "sparse-emg",
    name: "SparseEMG",
    tagline: "A gesture interface built from copper up.",
    description:
      "Custom single-channel EMG sensor: analog front-end designed from scratch in KiCad — AD8226 in-amp, 19 Hz high-pass, MCP6002 gain stage with 480 Hz low-pass, ≈800× gain on a single 3.3 V rail — taken through ERC/DRC-clean fab outputs on a 35×25 mm two-layer board. A 1D CNN-LSTM on wavelet features classifies six hand gestures on-device via ONNX Runtime.",
    metrics: [
      { value: "95.4%", label: "within-session accuracy" },
      { value: "102 ms", label: "end-to-end latency" },
      { value: "~$9", label: "bill of materials" },
    ],
    stack: ["KiCad", "AD8226", "RP2040", "PyTorch", "ONNX Runtime", "Orange Pi 5"],
    featured: true,
    note: "Board at fab · June 2026 – present",
  },
  {
    slug: "neuromcp",
    name: "NeuroMCP",
    tagline: "An MCP server that lets agents read your cognitive state.",
    description:
      "Decodes motor-imagery EEG in real time and exposes it to any AI agent as two standard tool calls — get_brain_state() and get_signal_quality(). Streaming pipeline with 8–30 Hz Butterworth bandpass, 1 s epochs at 50% overlap, artifact rejection, and a thread-safe circular buffer; EEGNet with Monte Carlo dropout yields calibrated confidence. Demoed with a code-review agent that defers detail until its operator isn't mid-task.",
    metrics: [
      { value: "57.6%", label: "3-class cross-subject (33% chance)" },
      { value: "2.84%", label: "expected calibration error" },
      { value: "27 ms", label: "per tool call · 35 tests" },
    ],
    stack: ["MCP", "EEGNet", "PyTorch", "SciPy", "Python"],
    href: "https://github.com/TLXyloph/neuroMCP",
    featured: true,
  },
  {
    slug: "medibot",
    name: "mediBot",
    tagline: "Ambient AI crew member for paramedics.",
    description:
      "Listens to the scene and writes the ePCR in real time, reads the cardiac monitor by camera via Gemini Live, speaks protocol callouts, and streams a live SBAR handoff to the hospital before arrival. Four independent lanes — voice, agents, screens, vision — all derive from one append-only Convex event log.",
    stack: ["TypeScript", "Convex", "Gemini Live", "Voice"],
    href: "https://github.com/TLXyloph/mediBot",
    featured: false,
    note: "Hack with VoiceOS 2026",
  },
  {
    slug: "learnit",
    name: "learnit",
    tagline: "A tutor that knows what you don't know yet.",
    description:
      "A Claude Code skill that decomposes any technical domain into a prerequisite DAG and teaches along its topological order, with mastery gating on cold-check reproduction. All state lives in a plain-Markdown vault — any future session resumes with zero chat history — with spaced-repetition scheduling and a zero-dependency validation suite.",
    stack: ["Claude Code", "Node.js", "Knowledge graphs", "Markdown"],
    href: "https://github.com/TLXyloph/learnit",
    featured: false,
  },
  {
    slug: "leverage-monopoly",
    name: "leverage-monopoly",
    tagline: "Monopoly, with the luck swapped for leverage.",
    description:
      "Sealed-bid property drafts, tradeable rent futures, peer loans pooled into tranched CDOs, and an underworld economy. The rules engine is pure and deterministic — all randomness arrives as event data from physical dice — over an event-sourced Fastify/WebSocket/SQLite server, so every game replays exactly and Playwright e2e tests assert final scores.",
    stack: ["TypeScript", "Fastify", "WebSocket", "SQLite", "Playwright"],
    href: "https://github.com/TLXyloph/leverage-monopoly",
    featured: false,
  },
  {
    slug: "real-time-compliance",
    name: "realTimeCompliance",
    tagline: "Flags the prohibited sentence as it's being said.",
    description:
      "A live compliance co-pilot for regulated sales calls: surfaces the exact rule clause the instant a prohibited statement is spoken, tracks mandatory disclosures as a checklist that blocks call wrap-up until complete, and auto-builds a citation-backed audit evidence pack from the event log.",
    stack: ["Python", "FastAPI", "Streaming ASR"],
    href: "https://github.com/TLXyloph/realTimeCompliance",
    featured: false,
  },
  {
    slug: "afterscroll",
    name: "afterscroll",
    tagline: "Your saved posts, turned into things you actually do.",
    description:
      "Turns saved social posts into todos, calendar events, and searchable memory. Grown from a Snowflake × Beta Fund hackathon build (Social-MeDoa) into a production Next.js deployment.",
    stack: ["Next.js", "TypeScript", "Snowflake"],
    href: "https://github.com/TLXyloph/afterscroll",
    live: "https://afterscroll.vercel.app",
    featured: false,
  },
  {
    slug: "lance",
    name: "Lance (YC) prototypes",
    tagline: "Four hotel-operations agents, shipped as working prototypes.",
    description:
      "A LangGraph + Playwright agent driving a mock property-management system from plain English; a React tablet app dispatching guest requests to housekeepers; a Claude + Twilio SMS concierge; and a Whisper voice→task pipeline on a plan/execute multi-agent orchestrator.",
    stack: ["LangGraph", "Playwright", "React", "Twilio", "Whisper"],
    featured: false,
    note: "Client prototypes · 2026",
  },
];

export const contributions: Contribution[] = [
  {
    repo: "norse/norse",
    repoNote: "spiking neural networks in PyTorch · 813★",
    title: "feat: SynOps metric — synaptic-operation accumulators + SynOpsCounter (311 lines, 11 tests)",
    href: "https://github.com/norse/norse/pull/444",
    state: "merged",
  },
  {
    repo: "fangwei123456/spikingjelly",
    repoNote: "spiking deep learning framework",
    title: "feat(layer): add MaxUnpool1d/2d/3d step modules",
    href: "https://github.com/fangwei123456/spikingjelly/pull/718",
    state: "merged",
  },
  {
    repo: "kunchenguid/no-mistakes",
    repoNote: "agentic release gates · 7.1k★",
    title: "fix(update): make --version a side-effect-free read-only probe",
    href: "https://github.com/kunchenguid/no-mistakes/pull/423",
    state: "merged",
  },
  {
    repo: "kunchenguid/no-mistakes",
    repoNote: "agentic release gates · 7.1k★",
    title: "fix(pipeline): don't gate the test step on informational new-test-file findings",
    href: "https://github.com/kunchenguid/no-mistakes/pull/417",
    state: "merged",
  },
  {
    repo: "kunchenguid/axi",
    repoNote: "agent tool-call ergonomics · 1.6k★",
    title: "docs: clarify that benchmarks support any Claude model",
    href: "https://github.com/kunchenguid/axi/pull/95",
    state: "merged",
  },
  {
    repo: "norse/norse",
    repoNote: "spiking neural networks in PyTorch · 813★",
    title: "docs: add ipywidgets to docs requirements",
    href: "https://github.com/norse/norse/pull/442",
    state: "merged",
  },
  {
    repo: "stanfordnlp/dspy",
    repoNote: "declarative LM programming · 36k★",
    title: "fix(predict): return ReAct outputs from finish tool args instead of an extra extract call",
    href: "https://github.com/stanfordnlp/dspy/pull/10122",
    state: "open",
  },
];

export const roles: Role[] = [
  {
    org: "FRC Team 649 · MSET Fish",
    title: "Electronics Lead",
    period: "Aug 2022 – Jun 2026",
    points: [
      "Designed the competition robot's electronics board — main breaker, power distribution, roboRIO — and wired the robot, pneumatics included.",
      "Led the electronics subteam through a World Championship semifinal run in the Turing Division.",
    ],
  },
  {
    org: "Holoworld",
    title: "Engineering Intern",
    period: "Mar 2023 – Jul 2025",
    points: [
      "Built an educational MR/AR platform with DepthAI, Unity, and SwiftUI — deployed at 30 private schools in India, with pre-orders from 20+ US vocational centers.",
      "Developed an ML algorithm for AR object interaction on mobile.",
    ],
  },
  {
    org: "Magikid Robotics Lab",
    title: "VEX IQ Coach",
    period: "Jun 2024 – Jul 2025",
    points: [
      "Coached elementary VEX IQ teams across hardware, software, and strategy.",
      "Two teams qualified for the 2025 VEX IQ World Championship during this period.",
    ],
  },
  {
    org: "Independent research",
    title: "ML in Drug Discovery",
    period: "Jun 2022 – Jul 2022",
    points: [
      "Predicted TNF-α inhibitor potency with KNN, Random Forest, and ChemBERTa/DeBERTa; validated hits via molecular docking in AutoDock Vina.",
    ],
  },
];

export const honors: string[] = [
  "USACO Gold division",
  "National VEX Champion",
  "VEX Worlds Overall Semifinalist '22",
  "FRC Worlds Semifinalist · Turing Division",
  "FRC Impact Award · Monterey Bay '23",
  "FRC Chairman's Award · San Francisco '22",
  "Gold, Bay Area Cyber League CTF",
  "7 years of competitive robotics",
];
