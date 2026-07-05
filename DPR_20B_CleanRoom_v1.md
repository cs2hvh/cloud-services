# Detailed Project Report — SAMATVA-20B
## A Clean-Room, From-Scratch 20B-Class Sparse-MoE Reasoning Model

| | |
|---|---|
| **Doc version** | v1.0 — 2026-06-10 |
| **Status** | For review (supersedes BUILD_PLAN.md as program source-of-truth once approved) |
| **Owner** | Harshit (Samatva) |
| **Prepared by** | Senior AI Research review session |
| **Locked inputs** | Dual-track compute (8–12× B200 now → 64× B200 later) · **Strict clean-room IP** · 4–6T token budget · Markdown deliverable |
| **Prior assets** | 500M dense model (own tokenizer, QK-norm, AdamW+Muon, 1B tokens) · BUILD_PLAN.md · Research Report |

---

## 0. Executive summary

**The goal.** Own, end-to-end, a ~21B-total / ~3.6B-active sparse-MoE reasoning model in the gpt-oss-20b class — weights, data lineage, tokenizer, and post-training stack all built in-house under a **strict clean-room policy**: no external model weights anywhere in the lineage, and no external-model-generated text in any training set.

**The headline feasibility result.** From-scratch is *not* compute-infeasible on the hardware you already have. The earlier "10–16× short" finding was an artifact of the 30–40-day window plus full-parity framing, not of GPU count. First-principles math (§4): the 20.91B/3.61B-active model at **4T tokens in MXFP8 on 12× B200 ≈ 67 days** of pure pretrain (6T ≈ 100 days); on **64× B200 ≈ 13–22 days**. Memory is a non-issue (full optimizer state for 21B shards comfortably into even 8× B200). The binding constraint is wall-clock patience, not feasibility.

**The program.** Dual-track:

- **Track 1 — now, 8–12× B200 (~12 weeks):** correctness harness, own tokenizer, 6T-token clean-room data factory, muP hyperparameter ladder, a ~1.3B PoC MoE, then a **~6.5B-total / 1.2B-active "Pathfinder"** trained on 1T tokens (~1 week of compute). Pathfinder de-risks every system (MoE infra, Muon at scale, FP8/FP4, checkpointing, long-context, post-training) at 1/10 cost, becomes the growth donor for the 20B (§9), and is itself a shippable small model.
- **Track 2 — on 64× B200 arrival (~8–10 weeks):** the 4–6T pretrain (optionally initialized from Pathfinder via MoE Structured Growth), 131K long-context extension, high-quality anneal, clean-room post-training (CRB, §13), MXFP4/NVFP4 QAT, release. **Contingency:** if 64 GPUs never materialize, Track 2 runs on 12 GPUs at 4T in ~10–11 weeks of pretrain — slower, not blocked.

**The clean-room consequence.** The single biggest change vs BUILD_PLAN.md: Phase-3 *reasoning distillation from external teachers is gone* (OpenThoughts3-class corpora contain DeepSeek-R1 traces; the warm-start Path D is gone too). It is replaced by the **Clean-Room Reasoning Bootstrap** (§13): format-SFT on human-authored data → STaR-style rejection-sampling self-improvement → RLVR (GSPO/DAPO-class) → self-play problem generation → self-distillation from our own model. This path is proven in the literature (R1-Zero, Absolute Zero) but ramps slower than distillation; capability gates are re-baselined accordingly (§14).

**Honest capability positioning.** The 2026 bar moved: the 3B-active class (Nemotron 3 Nano 31.6B-A3B, Qwen3.5-35B-A3B) now trains on ~25T tokens with synthetic + distilled data. At 4–6T clean-room tokens, expect a v1 that is **competitive with gpt-oss-20b on reasoning after RLVR, somewhat below it on broad knowledge (MMLU-class)**, and clearly behind 2026 leaders. That is the correct, defensible v1 for a full-IP asset; the v2 lever is corpus growth toward 10T+ and self-generated synthetic data from our own v1 (legal under clean-room).

**Top compute levers (full table §16):** sparsity (5.8× vs dense-20B, already in the design), MXFP8 now / NVFP4 when validated (1.3–1.8×), Muon+MuonClip token-efficiency (~1.2–1.5×), SuperBPE-style own tokenizer (~25–33% fewer tokens per byte), data quality + 2-phase curriculum, MTP auxiliary loss, muP transfer (no wasted big-model sweeps), and growth-from-Pathfinder (up to ~1.5× on the big run; gated as experimental).

---

## 1. Review verdict on BUILD_PLAN.md

Acting as senior reviewer: the plan is unusually good — the architecture spec is verified against the released artifacts, the gotcha list (interleaved `gate_up`, clamped SwiGLU, attention sinks) is exactly the class of silent-wrong bugs that kill such projects, and the phase gating is sound. The following items change.

| # | BUILD_PLAN.md item | Verdict | Change in this DPR |
|---|---|---|---|
| 1 | Path D (warm-start from gpt-oss weights) as active direction | **Rejected by new constraint** | Strict clean-room forbids external weights in lineage. Removed. Dual-track from-scratch restored as the only path. |
| 2 | Phase 3 reasoning distillation (OpenThoughts3, external teacher CoT, on-policy distillation from R1/Qwen) | **Rejected by new constraint** | Replaced by CRB self-bootstrap (§13). Post-distillation gate "AIME25 ≈ 50 before RL" is void; new gates in §14. |
| 3 | "From-scratch is 10–16× short on 8–12 B200s" | **Corrected** | True only for the 30–40-day window + 8–15T tokens + full parity. At 4T tokens with flexible wall-clock, 12 GPUs suffice (§4). |
| 4 | Token budget 8–15T | **Re-scoped** | Locked at 4–6T per decision. Compensators: SuperBPE tokenizer, ≤4-epoch reuse of highest-quality subsets, curriculum + anneal, Muon. |
| 5 | Reuse `o200k_harmony` tokenizer | **Revised** | Conflicts with full-IP ethos and forfeits a real compute lever. Train own 200K SuperBPE-style tokenizer (§6); keep `o200k_harmony` *only* inside the Phase-0 parity harness (test vector, never in lineage). |
| 6 | Phase 0 parity gate (load released weights, diff forward pass) | **Kept, with firewall note** | Released weights used as numerical *test vectors only*; documented IP firewall: they never initialize, never generate training text (§2.3). |
| 7 | Nemotron-CC incl. synthetic portion in data mix | **Filtered** | Nemotron-CC's 1.9T synthetic tokens are LLM-generated → excluded under clean-room. Only its human-text HQ subsets pass (§7 provenance tiers). |
| 8 | Optimizer plan (Muon 2D + AdamW rest, MuonClip, z-loss, WSD) | **Kept** | Confirmed by 2026 evidence (Kimi K2: 1.04T params, 15.5T tokens, zero spikes). Additions: muP transfer ladder, MoE-specific batch/LR guidance, D2Z as decay ablation. |
| 9 | Architecture = exact gpt-oss-20b geometry | **Kept as v1.0 baseline** | Correct de-risking call. Additions: MTP head (off-by-default ablation), router z-loss, and a v1.1 ablation menu (fine-grained experts, hybrid linear attention, DSA) decided strictly by PoC/Pathfinder evidence (§5.3). |
| 10 | BF16 + fp32 master training precision | **Upgraded** | MXFP8 as the working precision on B200 (mature in TE/Megatron-Core, ~1.3–1.45× e2e); NVFP4 track gated on loss-parity validation (§8.4). |
| 11 | Phases PoC → 20B directly | **Refined** | Insert Pathfinder (~6.5B/1.2B-active, 1T tokens) between PoC and the big run; it is the growth donor, post-training testbed, and first product (§9). |
| 12 | Eval discipline, decontamination, safety filtering, license hygiene | **Kept** | Extended with provenance ledger + contamination audit trail (§14, §19). |

Everything not listed carries over unchanged.

---

## 2. Mandate, constraints, and the clean-room policy

### 2.1 Mandate

Build and own a gpt-oss-20b-class sparse-MoE reasoning model: ~21B total / ~3.6B active, 131K context, variable reasoning effort, tool use, deployable in 4-bit on a single GPU. Full commercial freedom — every weight, token, and pipeline component traceable to Samatva or to permissively-licensed human-authored sources.

### 2.2 Hard constraints

| Constraint | Value |
|---|---|
| Compute, now | 8–12× NVIDIA B200 (180GB HBM3e each; native MXFP8/NVFP4 tensor cores) |
| Compute, later | 64× B200 (timing uncertain — plan must not hard-depend on it) |
| Pretrain token budget | 4–6T tokens |
| IP policy | Strict clean-room (§2.3) |
| Team experience | One 500M dense pretrain (own tokenizer, QK-norm, AdamW+Muon, 1B tokens). First MoE, first post-training. |

### 2.3 The clean-room policy (normative)

Three rules, enforced by a **provenance ledger** (every training file carries source, license, and generation-method metadata; CI blocks unlabeled data):

1. **No external weights in lineage.** No initialization, warm-start, upcycling, merging, or LoRA-from of any third-party checkpoint. *Permitted:* using released checkpoints as **test vectors** (Phase-0 forward-parity diff) and as **eval baselines** — they never touch the training graph.
2. **No external-model-generated text in training data.** Excludes: synthetic portions of public corpora (e.g., Nemotron-CC's 1.9T synthetic tokens), distilled CoT sets (OpenThoughts3 — contains DeepSeek-R1 traces), LLM-rewritten/“rephrased” corpora, preference data generated by third-party models. *Permitted:* text generated by **our own models** at any stage (self-synthetic data is the v2 growth lever).
3. **Model-assisted *selection* of human text is allowed.** Quality classifiers, dedup embeddings, difficulty scorers (e.g., FineWeb-Edu's classifier labels) select or rank human-written text; they do not author it. This is the standard reading of clean-room used here and should be ratified by counsel. Residual risk: post-2022 web text contains undeclared LLM output; mitigate with provenance-era weighting (pre-2023 crawls upweighted) and AI-text detection filters at ingest — documented best-effort, not absolute.

**What the policy costs:** teacher distillation is the single cheapest capability lever in 2026 (gpt-oss itself was built with "large-scale distillation and reinforcement learning"). Forgoing it is a deliberate strategic trade: slower capability ramp, in exchange for an asset with unencumbered provenance. §13 is the compensating mechanism; §14 re-baselines expectations.

### 2.4 Out of scope for v1

Multimodality; >131K context; multilingual parity beyond a deliberate ~15–25% non-English mix; a 120B-class teacher model (revisit for v2 once 64× B200 is steady-state).

---

## 3. June-2026 landscape and the capability bar

What changed since the research report was written, and what it means for us.

### 3.1 The 3B-active class is the new battleground

- **Nemotron 3 Nano 30B-A3B** (Dec 2025): 31.6B total / 3.2B active, hybrid Mamba-Transformer MoE, trained on **25T tokens** (23.5T diverse + 1.5T HQ phase), WSD schedule, beats gpt-oss-20b on accuracy at 2.2× its throughput ([tech report](https://arxiv.org/pdf/2512.20848)).
- **Qwen3.5-35B-A3B**: same class, benchmark-accuracy-optimized.
- Frontier open MoEs standardize the recipe we are adopting: **DeepSeek-V4** (1.6T/49B + Flash 284B/13B, DSA sparse attention, 1 MTP head), **GLM-5/5.1** (744B/40B, 28.5T tokens, DSA), **Kimi K2.6** (MuonClip lineage), **MiniMax M3** (June 2026).

**Implication:** gpt-oss-20b (Aug 2025) is a *fair v1 target* but no longer the small-model frontier. Competitors hit it with 25T tokens + synthetic + distillation; we have 4–6T clean-room tokens. §16 quantifies how much of that gap our levers close; §14 sets honest gates.

### 3.2 Technique shifts that are now production-grade (and we adopt)

| Technique | 2026 status | Our use |
|---|---|---|
| **MXFP8 training** | Native on Blackwell tcgen05; full Megatron-Core/TE support incl. grouped GEMM; TorchTitan+DeepEP shows [+41% on DSv3-class MoE on B200](https://pytorch.org/blog/enabling-up-to-41-faster-pre-training-mxfp8-and-deepep-for-deepseek-v3-on-b200-with-torchtitan/) | Working precision of all big runs (§8.4) |
| **NVFP4 pretraining** | [12B model, 10T tokens stable](https://arxiv.org/abs/2509.25149); recipe = RHT + 2D scaling + stochastic rounding + ~15% sensitive layers in BF16; [MXFP4-on-native-FP4 follow-up, May 2026](https://arxiv.org/html/2605.09825v2); Megatron-Core NVFP4 support on the [2026 Q2 roadmap](https://github.com/NVIDIA/Megatron-LM/issues/4815) | Gated track: validate loss-parity on Pathfinder; adopt for 20B only if clean (§8.4) |
| **Muon/MuonClip at scale** | [Kimi K2: 1.04T params, 15.5T tokens, zero loss spikes](https://arxiv.org/pdf/2507.20534); variants (NorMuon, AdaMuon) maturing | Confirmed optimizer choice (§8.2) |
| **muP / μTransfer** | Standard practice (Llama-4 "MetaP", Cerebras recipes); caveats known ([independent weight decay](https://arxiv.org/pdf/2510.19093), [emb-LR ≈ √d ratio](https://arxiv.org/pdf/2506.15025)) | HP ladder on 50M→400M→1.3B proxies (§8.1) |
| **MTP (multi-token prediction)** | DeepSeek-V4 ships 1 MTP head; [Megatron-Bridge native support](https://docs.nvidia.com/nemo/megatron-bridge/latest/training/multi-token-prediction.html); ~1.8–2× decode via self-speculation | Ablation in PoC; adopt if neutral-or-better on loss (§5.2) |
| **DSA (DeepSeek Sparse Attention)** | [V3.2 → V4 hardened](https://arxiv.org/pdf/2512.02556); adopted by GLM-5; indexer ≈1–5% of attention compute, top-2048 block selection | v1.1 option for the 131K phase only — not load-bearing for v1.0 (§5.3, §11) |
| **Hybrid linear attention** | [Kimi Linear (KDA 3:1)](https://arxiv.org/abs/2510.26692), Qwen3-Next, Nemotron hybrid Mamba | Tracked, **not** adopted v1 — double new-axis risk on first MoE (§5.3) |
| **GRPO successors** | [DAPO, GSPO, Dr.GRPO, λ-GRPO etc.](https://llm-stats.com/blog/research/post-training-techniques-2026); GSPO's sequence-level weights specifically fix MoE instability | CRB stage 3 uses GSPO-style objective + DAPO tricks (§13) |
| **RL-from-base, zero external data** | R1-Zero setting; [Absolute Zero self-play](https://arxiv.org/pdf/2505.03335); [base models reason better than assumed under power sampling](https://arxiv.org/html/2510.14901v1) | Backbone of clean-room post-training (§13) |
| **SuperBPE-class tokenizers** | [~33% fewer tokens, +4% avg downstream at 8B scale](https://arxiv.org/pdf/2503.13423) | Own tokenizer spec (§6) |

### 3.3 Capability bar for v1 (anchors, measured without tools unless noted)

gpt-oss-20b model-card anchors we keep: MMLU ~85 (high effort), AIME'24 ~96 / AIME'25 ~98.7 (with tools), GPQA-diamond ~71.5, SWE-bench Verified 60.7 (the 76.8 figure circulating is wrong), Codeforces ~2516 Elo (tools), SimpleQA 6.7 (factuality is its known weakness). Our v1 ambition vs these: §14.3.

---

## 4. Compute & feasibility math (first-principles)

All numbers derived in Appendix A; rounded here. Label: **estimates** — re-baseline against measured Pathfinder MFU before committing the big run.

### 4.1 Cost per token

| Quantity | Value |
|---|---|
| Active params (3.61B) → core train FLOPs/token (6·N) | 2.17e10 |
| + attention at seq 4096 (12 dense + 12 SWA-128 layers) | +11.5% → **2.42e10 FLOPs/token** |
| 4T tokens | **9.7e22 FLOPs** |
| 6T tokens | **1.45e23 FLOPs** |

### 4.2 Sustained per-GPU throughput assumptions (model-FLOPs, MoE workload)

| Precision | Sustained PF/GPU | Basis |
|---|---|---|
| BF16 | 0.8–1.0 | 35–45% MFU of 2.25 PF dense peak; small model, single/dual node → low comm overhead |
| **MXFP8** | **1.2–1.6** | ~1.3–1.45× BF16 e2e (TE/Megatron grouped-GEMM; TorchTitan DSv3 +41%; Megatron-Core paper reports >1.0 PF/GPU on GB200 for a far larger MoE) |
| NVFP4 (gated) | 1.6–2.0 | ~1.5–1.8× BF16 e2e measured in NeMo/TE samples (≤1.59× throughput cited by NVIDIA at 8B); kernels still maturing |

### 4.3 Pretrain wall-clock (pure compute; add ~15% for restarts/evals/stragglers)

| Scenario | 4T tokens | 6T tokens |
|---|---|---|
| **12× B200, MXFP8 @1.4 PF** | **~67 d** (58–78) | ~100 d (87–117) |
| 12× B200, NVFP4 @1.8 PF | ~52 d | ~78 d |
| 8× B200, MXFP8 | ~100 d | ~150 d |
| **64× B200, MXFP8** | **~13 d** | **~19 d** |
| 64× B200, NVFP4 | ~10 d | ~15 d |

Supporting runs: PoC 1.3B/0.35B-active × 100B tokens ≈ **4 GPU-days total** (hours on 12 GPUs). Pathfinder 6.5B/1.2B-active × 1T tokens ≈ **6–7 days on 12 GPUs** (MXFP8). Long-context phase (≈150B tokens at 131K, ~4× cost/token) ≈ 10 d on 12 / ~2 d on 64. Mixture ablations (8–10 × 1B-scale × 50–100B tokens) ≈ 1 week on 12 GPUs, interleaved.

### 4.4 Memory feasibility (the reason 12 GPUs is enough)

21B-total model, Muon(2D)+AdamW(rest), MXFP8 compute with BF16/FP32 state:

| State | Size |
|---|---|
| Weights (BF16) | 42 GB |
| FP32 master weights | 84 GB |
| Muon momentum (FP32, ~19.7B 2D params) | ~79 GB |
| AdamW m+v (FP32, ~1.2B params) | ~10 GB |
| Gradients (BF16) | 42 GB |
| **Total sharded state** | **~257 GB** |

vs **2.16 TB** aggregate HBM on 12× B200 (1.44 TB on 8×). Fully-sharded (ZeRO-1/FSDP + EP), per-GPU state is ~21–32 GB, leaving >140 GB for activations — generous even at 4096 seq with selective recompute, and sufficient for the 131K phase with context parallelism. **Conclusion: even 8 GPUs train this model; GPU count buys wall-clock, not feasibility.**

### 4.5 Verdicts

1. **Track-1 program (PoC + Pathfinder + ablations + post-training dev) fits comfortably in 8–12 GPUs in ~12 weeks.**
2. **The 4–6T main run wants the 64-GPU window (~2.5–3.5 weeks incl. overhead + long-context + anneal).** On 12 GPUs it is a ~10–15-week commitment — viable contingency, schedule risk only.
3. RLVR post-training (§13) is generation-dominated; the FP4-quantized policy (~14 GB) gives high rollout throughput — budget **2–4 weeks on 12 GPUs**, or days on 64.
4. If renting the 64-GPU window: ~43K B200-hours ≈ **$215–280K** at mid-2026 market rates (≈$5–6.5/GPU-hr) for the 6T run incl. overhead; 4T ≈ $130–180K.

---

## 5. Model architecture specification

### 5.1 v1.0 baseline — keep the validated gpt-oss-20b geometry

Unchanged from BUILD_PLAN.md §1 (all verified gotchas honored: interleaved `gate_up`, clamped SwiGLU α=1.702/±7/+1, learned per-head sinks, YaRN ×32 → 131K, alternating SWA-128/dense, top-4 softmax-over-selected, no aux loss). Rationale: it is the *only* 20B-class architecture we can numerically verify against released weights before spending compute. The parity gate is worth more than any unverified improvement.

Two v1.0 additions (low-risk, reversible):

1. **Router z-loss** (coef ~1e-3) + router logits in FP32 — standard MoE stabilizer; our design choice, not copied from gpt-oss (their `router_aux_loss_coef` is inert).
2. **QK handling:** keep gpt-oss geometry (no QK-norm); logit-explosion risk is covered by **MuonClip/qk-clip** (per-head rescaling of W_q/W_k when max logit exceeds τ≈100). Our 500M used QK-norm — fine for that run, but at 20B we follow the K2-proven recipe and keep the parity-testable geometry.

### 5.2 PoC-gated ablation: MTP head

One DeepSeek-style sequential MTP head (predict t+2; full causal chain): denser supervision, measurable sample-efficiency gain, and a free ~1.8–2× self-speculative decode at serve time. Costs ~3–5% train FLOPs. **Adopt iff** PoC shows ≥ neutral loss-per-FLOP. Megatron-Bridge supports it natively.

### 5.3 v1.1 menu (only with Pathfinder evidence; never two new axes at once)

| Option | Expected gain | Why gated |
|---|---|---|
| Fine-grained experts (64 experts / top-8, same active FLOPs, halved expert width) | Better loss per active param ([granularity scaling laws](https://arxiv.org/pdf/2507.17702)) | Changes routing dynamics; invalidates parity reference; grouped-GEMM efficiency at half width must be measured on B200 |
| Higher sparsity (e.g., 48–64 experts, top-4) | More capacity per FLOP — but [reasoning gains saturate with sparsity](https://arxiv.org/html/2508.18672v1); memorization benefits mostly | Token budget is our binding constraint, not param count; weak case at 4–6T |
| DSA for long-context | ~3× attention cost cut at 131K | Only the long-context phase needs it; small fraction of total compute → adopt only if 131K serving economics demand |
| Hybrid linear attention (KDA/Mamba-style 3:1) | Large KV/throughput wins (Nemotron 3, Kimi Linear) | Whole new training/inference stack; defer to v2 |

**Design stance:** at a 4–6T budget the highest-leverage changes are data, tokenizer, optimizer, and precision — not architecture novelty. Architecture v1.0 is deliberately boring.

---

## 6. Tokenizer

### 6.1 Decision: train our own tokenizer (full IP + a compute lever)

You already built one for the 500M — this continues that line, upgraded:

| Field | Spec |
|---|---|
| Algorithm | **SuperBPE-style two-phase BPE**: phase 1 learns ~180K standard subwords (whitespace-pretokenized); phase 2 lifts the boundary constraint and learns ~20K cross-word "superword" merges → **200K vocab** ([SuperBPE](https://arxiv.org/pdf/2503.13423): ~33% fewer tokens per byte, +4.0% avg over 30 benchmarks at 8B; 180K/200K is the authors' recommended transition) |
| Training corpus | 2–5% stratified sample of the §7 mixture (so compression matches what we train on), incl. code, math, and the multilingual slice |
| Byte fallback | Yes (byte-level BPE base; no UNK) |
| Digits | Single-digit splitting (arithmetic fidelity) |
| Specials | Full harmony-compatible control set (channels `analysis/commentary/final`, roles, tool-call frames) reserved at fixed IDs — our renderer mirrors harmony semantics without reusing OpenAI vocab |
| Embedding cost at 200K | 2880 × 200K ≈ 0.576B per matrix (embed + untied unembed ≈ 1.15B) — matches gpt-oss budget; muP embed-LR rule in §8.1 |

**Why it matters at a fixed 4–6T-token budget:** tokens are the budget's unit. ~25–33% better bytes-per-token means each "T tokens" carries proportionally more text — effectively stretching 4T tokens toward ~5.2–6T tokens' worth of data, and 131K context toward ~175K text-equivalent. Validate compression ≥1.25× vs `o200k_harmony` on held-out corpus samples; if phase-2 superwords hurt PoC loss-per-FLOP (known sensitivity: morphology vs whitespace), ship phase-1-only at 200K.

### 6.2 Parity-harness exception

The Phase-0 forward-parity test (§14.1) necessarily runs with `o200k_harmony` + released weights *inside the test harness only*. Production lineage uses our tokenizer exclusively. Both facts recorded in the provenance ledger.

---

## 7. Data strategy (4–6T clean-room tokens)

### 7.1 Provenance tiers (the clean-room filter)

| Tier | Definition | Status |
|---|---|---|
| **A** | Human-authored, permissive/attributable license (ODC-By, CC, public domain, code with permissive SPDX) | Core corpus |
| **B** | Human-authored web text *selected* by model classifiers (FineWeb-Edu-style edu scores, DCLM fastText, ensembles) | Allowed (§2.3 rule 3) |
| **C** | LLM-generated or LLM-rewritten text (synthetic CC rephrasings, distilled CoT, synthetic textbooks) | **Excluded for v1.** Own-model synthetic becomes Tier A′ after we have a model |
| **D** | Unknown provenance / failed AI-text detector / post-2023 crawl with high LLM-slop score | Excluded or heavily downweighted |

### 7.2 Source inventory (Tier A/B pool ≈ 12–18T raw → 4–6T after curation)

| Domain | Sources (human-text subsets only) | Curated est. |
|---|---|---|
| Web (EN) | [DCLM-baseline](https://arxiv.org/abs/2406.11794), [FineWeb-Edu](https://huggingface.co/datasets/HuggingFaceFW/fineweb-edu), [Nemotron-CC HQ *actual-text* subsets](https://arxiv.org/html/2412.02595v1) (synthetic slices dropped), [TxT360](https://huggingface.co/datasets/LLM360/TxT360), [GneissWeb](https://arxiv.org/pdf/2502.14907) — cross-deduped union, classifier-ensemble scored | 2.5–3.5T |
| Code | The Stack v2 (license-filtered, opt-out honored), GitHub-derived permissive code, FineWeb code slices | 0.8–1.2T (15–20%) |
| Math/STEM | [Nemotron-CC-Math (133B, CC-extracted human math)](https://arxiv.org/html/2508.15096v1), OpenWebMath, Proof-Pile-2, arXiv (license-aware), PubMed OA | 0.3–0.5T (repeat ×2–4) |
| Reference/books | Wikipedia/Wikibooks dumps, [Common Pile](https://arxiv.org/pdf/2506.05209) openly-licensed slices, FinePDFs human-PDF text, gov/legal corpora | 0.4–0.6T |
| Multilingual | FineWeb-2 top-20 languages, classifier-filtered | 0.6–1.2T (15–25%) |
| Dialogue/forums | StackExchange, permissive forum dumps, OASST-class *human* dialogues | 0.1–0.2T |

Licensing duties tracked per source: ODC-By attribution file, Stack v2 usage agreement + opt-out re-sync at cut date, CBRN/CSAM/PII safety filters at ingest (§19).

### 7.3 Curation pipeline (order matters)

1. Ingest → language ID → extraction QA (boilerplate/nav stripping).
2. **Exact dedup** (SHA on normalized text) → **fuzzy dedup** (MinHash-LSH, doc-level, Jaccard ≥0.8) **across the union**, not per-source (the same CC pages appear in DCLM/FineWeb/Nemotron/TxT360 — skipping cross-source dedup silently triples effective epochs on web text).
3. Quality scoring: ensemble (DCLM-fastText + edu-classifier + own 500M-perplexity bucket) → keep top slices per domain, not a single global threshold.
4. Tier-D screening: AI-text detector + crawl-date heuristic; pre-2023 crawls upweighted.
5. **Benchmark decontamination**: 13-gram + embedding-similarity purge against the full §14 eval suite (questions *and* answers), with an audit log of hit counts per source.
6. Provenance ledger stamping → immutable snapshot ("DataCut-1") → tokenize with §6 tokenizer.

### 7.4 Mixture & curriculum (two-phase, Nemotron-3-style)

- **Phase A (~85–90% of tokens):** diverse mixture, mild quality floor — breadth first. Web-heavy, code 15–20%, math ≥8%, multilingual slice active from the start (don't bolt on languages late).
- **Phase B / anneal (~10–15%, overlaps §12):** top-decile quality, math/code/reasoning-dense, textbooks-and-reference-heavy; LR decay co-timed (this is where [curriculum × decay interaction](https://arxiv.org/html/2511.18903v1) pays).
- **Repeats:** highest-value subsets (math, code, reference) up to **4 epochs** — ≤4 epochs is near-equivalent to fresh data, beyond that returns collapse ([data-constrained scaling](https://arxiv.org/abs/2305.16264), [reconfirmed in 2025–26 domain studies](https://arxiv.org/pdf/2509.24356)). Web text ≤2 epochs.
- **Mixture set by ablation, not taste:** 8–10 candidate mixtures × 1B-proxy × 50–100B tokens, scored on a 20-task early-signal battery (§14.2); final mixture is the interpolation winner. Proxy-to-target risk acknowledged (mixture transfer is imperfect — a known open problem; we mitigate by re-checking at Pathfinder scale).

### 7.5 The 4–6T honesty note

25T-token competitors exist (§3.1). At 4–6T we compensate with: tokenizer compression (+25–33% effective text), ≤4× repeats on premium slices, two-phase curriculum, Muon, and MTP — call it **1.6–2.2× effective-token multiplier** vs a naive 4–6T AdamW/BPE run. That lands us in "well-trained 2025" territory, not "25T 2026" territory, for raw knowledge — the reasoning gap is then closed in post-training (§13), which is where gpt-oss-20b's capability actually lives. v2 path: grow DataCut-2 toward 10T+ and add own-model synthetic (Tier A′).

---

## 8. Pretraining methodology

### 8.1 Hyperparameter strategy: muP ladder (new vs BUILD_PLAN)

Parametrize in **μP** and tune once on small proxies; transfer to 20B zero-shot:

- Ladder: 50M → 200M → 1.3B-PoC → 6.5B-Pathfinder, fixed depth-and-shape family of the v1.0 geometry.
- Sweep on proxies: peak LR (Muon & AdamW groups separately), WD, batch ramp, z-loss coef, init σ, MTP weight.
- 2026 caveats baked in: **independent weight decay** (not λ∝1/LR coupling) for clean LR transfer ([evidence](https://arxiv.org/pdf/2510.19093)); **embedding-LR ≈ √d × hidden-LR** ratio ([optimal embedding LR](https://arxiv.org/pdf/2506.15025)); verify transfer empirically at each ladder rung (μP assumptions degrade — trust but verify).
- Expert-width enters μP as width; router treated as a vector-like (AdamW) group.

### 8.2 Optimizer (confirmed + sharpened)

| Group | Optimizer | Notes |
|---|---|---|
| All 2D hidden matrices (incl. expert FFNs, attn projections) | **Muon** (NS5 orthogonalization, momentum 0.95) | distributed Muon as in [Moonlight/K2](https://arxiv.org/html/2502.16982v1); update-RMS matched to AdamW scale |
| Embeddings, unembedding, router, norms, biases, sinks | **AdamW** (β 0.9/0.95) | router in FP32 |
| Stability | **MuonClip/qk-clip** τ≈100 (K2-proven: 15.5T tokens, zero spikes) + grad-clip 1.0 + router z-loss 1e-3 | monitor max attn logit as a first-class metric |

Keep a pure-AdamW 1.3B baseline run for sanity (cheap insurance; Muon's "~52% FLOPs to match AdamW" headline is sub-2B extrapolation — budget assuming **1.2–1.5×** token-efficiency, treat anything more as upside).

### 8.3 Schedule, batch, lengths

- **WSD**: ~8B-token warmup → long stable plateau → decay over final 10–15% co-timed with Phase-B data (Nemotron 3 Nano: WSD, peak 1e-3 → 1e-5 at 3.2B-active scale — directionally our regime; exact peaks from the muP ladder). Run a **D2Z** (linear-to-zero) arm in the Pathfinder as the [strong-at-high-TPP alternative](https://arxiv.org/pdf/2502.15938); note the 2026 [WSO finding](https://arxiv.org/abs/2603.16127) (no-decay can be better *post-SFT*) — we keep decay but snapshot pre-decay checkpoints so both downstream paths stay open.
- **Batch:** global 4M → 16M tokens with ramp; MoE wants the [larger-batch/slightly-lower-LR end](https://arxiv.org/html/2509.23678v1) — each expert sees only ~1/8 of tokens.
- **Seq len:** 4096 pretrain → 131K extension phase (§11). Document-packing with attention-isolation between packed docs.

### 8.4 Precision plan (B200-native; biggest pure-systems lever)

| Phase | Precision | Rationale |
|---|---|---|
| PoC + ablations | MXFP8 **and** NVFP4 arms | establish loss-parity evidence on our exact arch |
| Pathfinder 1T | MXFP8 working precision; NVFP4 shadow run 50–100B tokens | gate decision for the big run |
| **20B main run** | **MXFP8** (TE recipe: E4M3 fwd/bwd, per-32-block scales, FP32 master/optimizer) — switch to **NVFP4 only if** Pathfinder shadow shows ≤0.5% loss gap and stable grad-norm profile | mature today; 1.3–1.45× e2e now, 1.5–1.8× if FP4 validates |
| Final 10–15% (anneal + long-context) | **BF16** | mirrors the [NVFP4 paper's](https://arxiv.org/abs/2509.25149) late-phase higher-precision switch; cheap insurance on the tokens that matter most |
| Always-BF16 islands | router, sinks, norms, embeddings/unembed, MTP head, first/last ~2 blocks | the paper's "~15% sensitive layers" finding, mapped to our arch |

NVFP4 recipe if adopted: Random-Hadamard transforms on grads, 2D weight scaling (consistent fwd/bwd), stochastic rounding on grads, RTN on weights/activations — all per the NVIDIA recipe, available via TE/Megatron-Core (2026 Q2 NVFP4 support).

### 8.5 Stability & ops playbook

Async distributed checkpoints every 30–60 min + integrity-verified rollback; spike protocol (auto-LR-dip + data-shard skip + restart-from-last-good); expert-balance dashboard (per-expert token share, router entropy, drop rate = 0 by design with dropless EP); max-attn-logit, grad-norm, update-RMS per group; loss-per-domain streams to catch mixture pathologies early; weekly eval probes (§14.2) — **never train blind for more than 24h of wall-clock**.

---

## 9. Scaling strategy: PoC → Pathfinder → 20B (MoE Structured Growth)

The de-risking ladder, plus the program's one genuinely novel algorithm (clean-room-legal because every donor checkpoint is ours).

### 9.1 The ladder

| Stage | Shape | Tokens | Purpose |
|---|---|---|---|
| **PoC** | 12L × d1440, 32 experts top-4, head_dim 64, all v1.0 structural features (sinks, clamped SwiGLU, YaRN, SWA parity, no-aux) ≈ 1.3B total / 0.35B active | 100B | Training-stack validation: EP+FSDP, grouped GEMM, DeepEP all-to-all, Muon+qk-clip, z-loss, WSD, checkpoints/rollback, MXFP8 vs NVFP4 arms, MTP ablation, mixture ablation host |
| **Pathfinder** | 18L × d2160, 32 experts top-4 ≈ 6.5B total / 1.2B active | 1T | Everything at 1/10 cost: long-context dry run, QAT round-trip, CRB post-training full dress rehearsal, NVFP4 gate, μP verification, **growth donor** |
| **SAMATVA-20B** | 24L × d2880 (v1.0 spec) | 4–6T | The asset |

### 9.2 MoE Structured Growth (MSG) — proposed; full spec Appendix B.1

Initialize the 20B from the trained Pathfinder instead of from random:

1. **Depth**: 18→24 layers via [G_stack-style](https://openreview.net/forum?id=FXJDcriMYH) interleaved block duplication (their 7B result: same loss reached with ~35% fewer tokens, "54.6% speedup"; guidelines for growth timing/factor included).
2. **Width**: d2160→d2880 via [HyperCloning-style](https://arxiv.org/html/2409.12903v1) function-preserving expansion (output-logit-preserving block-diagonal lift).
3. **Experts**: per-expert width lift via HyperCloning; router re-initialized small + brief router-only re-warm (function preservation across routing is the open piece — hence the gate).
4. Brief whole-model LR re-warm, then standard WSD plateau.

**Evidence status:** depth-stacking and width-cloning are individually validated on *dense* models up to 7–8B; the MoE composition is **our extension — treat as experiment, not plan-of-record**. Gate (Pathfinder-scale dry run, e.g., 1.3B→3B grown vs from-scratch control at equal *total* FLOPs incl. donor cost): grown run must show **≥1.2× effective speedup to matched loss**, no router pathology, no late-training loss-curve crossover vs control. If pass → expected **1.3–1.5× savings on the 20B run** (donor is already paid for as de-risking). If fail → from-random init, nothing lost.

### 9.3 Why not direct dense→MoE upcycling from the 500M

Too small to matter (donor quality bounds the head start), wrong tokenizer, and dense→sparse upcycling underperforms training the MoE directly at meaningful token budgets. The 500M's residual value: pipeline lessons + a perplexity-scorer for §7.3. Retire it with honors.

---

## 10. Systems & infrastructure

### 10.1 Framework

**Megatron-Core + Megatron-Bridge** (plan-of-record): gpt-oss geometry already supported (YaRN, sinks, clamped activation, no-aux top-4), grouped GEMM with MXFP8, NVFP4 training path landing per the [2026 Q2 MoE roadmap](https://github.com/NVIDIA/Megatron-LM/issues/4815), MTP support, async ckpt. **TorchTitan** as a watched alternative ([MXFP8+DeepEP DSv3 recipe on B200, +41%](https://pytorch.org/blog/enabling-up-to-41-faster-pre-training-mxfp8-and-deepep-for-deepseek-v3-on-b200-with-torchtitan/)) — hedge if Megatron NVFP4-for-MoE slips. Phase-0 deliverable includes a 2-day bake-off on the PoC config.

### 10.2 Parallelism by cluster size (21B/3.6B-active is a *small* MoE — keep it simple)

| Cluster | Layout |
|---|---|
| 8–12× B200 | **FSDP/ZeRO-1 + EP8** (experts sharded 4-per-GPU at EP8; TP=1, PP=1 — Megatron's own guidance at this scale), grouped GEMM, DeepEP-style all-to-all within NVLink domain; 12-GPU = 8+4 split → prefer EP8 on the NVL8 node + DP overflow, or flat FSDP-only if all-to-all across IB hurts (measure in Phase 0) |
| 64× B200 | EP8 × DP8 (ZeRO-1), still TP=1/PP=1; all-to-all stays intra-node; gradient comms overlap via FSDP prefetch |
| 131K phase | + Context Parallelism (CP4–8); SWA layers are cheap, dense layers dominate — CP only on dense-attention blocks if the stack allows |

### 10.3 Kernel/stack checklist (Phase 0 exit)

CUDA ≥12.8 + cuDNN/NCCL Blackwell-tuned; TE ≥2.x with MXFP8 grouped-GEMM; FlashAttention-3-class fused attention with **sink support** (custom column trick validated bit-for-bit vs reference `model.py`); DeepEP or Hybrid-EP all-to-all; async distributed checkpointing (full state, sharded, integrity-hashed); deterministic-mode CI run (bitwise reproducibility on 100-step replay).

### 10.4 Observability & data infra

Per-§8.5 metrics into Prometheus/Grafana (or W&B); per-domain loss streams; expert telemetry; automated spike responder. Data side: the §7.3 pipeline as a versioned DAG (Spark/Ray on CPU nodes — keep GPUs for training), DataCut snapshots content-addressed; tokenized shards in WebDataset/Megatron-indexed format with shard-level provenance IDs.

---

## 11. Long-context extension (131K)

Standard two-stage recipe, unchanged in spirit from BUILD_PLAN:

1. Pretrain fully at 4096 with RoPE θ=150K.
2. **Extension phase (~100–150B tokens):** YaRN factor 32 (β_fast 32, β_slow 1, orig 4096) → 131K; long-document mixture (books, code repos-as-documents, concatenated-with-care technical corpora) + length-stratified curriculum 8K→32K→131K; CP per §10.2; needle/RULER-class evals at each length rung (§14.2).
3. Cost: ~4× per-token at 131K (Appendix A.3) → ~10 days on 12 GPUs / ~2 on 64. If serving economics later demand cheaper long-context, DSA retrofit is the v1.1 lever (a [post-hoc indexer-on-frozen-backbone is demonstrated](https://arxiv.org/pdf/2512.02556) in the literature) — not needed for v1 training.
4. Sinks + SWA-128 alternation are long-context-friendly by construction (that's why gpt-oss chose them); keep sink-logit telemetry through the extension to catch attention-collapse regressions.

---

## 12. Mid-training / annealing

The decay window is where benchmarks are made ([mid-training survey](https://arxiv.org/html/2510.06826v1)); co-design of LR decay × data is the whole game:

- Final 10–15% of tokens = **Phase-B mixture** (§7.4): top-decile web, reference, math/code-dense, instruction-formatted *human* data (templated NLP tasks à la FLAN from human datasets are Tier A/B — allowed; no LLM-authored instructions).
- Precision switches to BF16 here (§8.4); checkpoint *before* decay preserved as the "plateau base" for WSD-fork experiments (multiple anneals from one plateau = cheap A/B on anneal mixtures — the MiniCPM/WSD-fork trick).
- **Benchmark-to-steer** (kept from BUILD_PLAN, threshold updated): probe suite at 1T/2T/3.5T; if MMLU-class composite at 3.5T tracks <55, raise Phase-B fraction and premium-slice epoch count before burning the remainder (decision table in §14.3).
- Anneal output = **base checkpoint** for §13.

---

## 13. Post-training: the Clean-Room Reasoning Bootstrap (CRB)

Distillation being off the table, reasoning must be **grown, not transplanted**. CRB is a five-stage loop; every token it trains on is human-authored or generated by *our own* checkpoints. Full algorithmic spec in Appendix B.2. Precedent that this works without any teacher: R1-Zero (RL directly on a base model), [Absolute Zero](https://arxiv.org/pdf/2505.03335) (self-proposed tasks, zero external data), [STaR-class expert iteration](https://www.emergentmind.com/topics/self-taught-reasoning-star), and [power-sampling evidence that base models already contain most of the reasoning](https://arxiv.org/html/2510.14901v1) that RL surfaces.

### Stage 0 — Format & instruction SFT (human data only)
Harmony-semantics chat format (our tokenizer's control IDs): channels (`analysis`/`commentary`/`final`), instruction hierarchy, tool-call frames, `Reasoning: low|medium|high`. Data: in-house annotation (target ~50–100K high-quality demonstrations — budget real annotator money here; this is the only stage that *buys* data), templated-from-human-NLP-datasets instructions, human dialogue corpora. Output: `20B-SFT0`. Gate: format compliance >99%, no benchmark regression vs base.

### Stage 1 — STaR / rejection-sampling expert iteration
Problem bank: human-authored problems with **verifiable answers** (math sets, code+unit tests mined from Stack v2 with license hygiene, science MCQ from human sources) — decontaminated against evals. Loop (3–5 rounds): sample k=16–64 CoT@T≈1.0 from current policy → verify → filter (correctness + consistency + length sanity) → dedupe/balance by difficulty → SFT on winners (incl. *rationalization*: for missed problems, condition on the answer to elicit a solution, verify it re-derives). Each round shifts sampling toward problems at the policy's frontier (pass-rate 10–70%). Output: `20B-STaR`. Expected: large jump on math/code from a standing start (no external numbers to borrow under clean-room; Pathfinder dress-rehearsal calibrates the curve).

### Stage 2 — RLVR
- **Objective: GSPO-style sequence-level importance ratios** (MoE-stable; token-level GRPO ratios are noisy under expert-routing drift) + DAPO's practical kit (clip-higher, dynamic sampling — drop all-correct/all-wrong groups, token-level loss on long CoT, overlong shaping). [Group-advantage bias corrections](https://arxiv.org/html/2601.08521) and [uncertainty-aware shaping](https://arxiv.org/pdf/2510.10649) as ablations.
- Rewards: exact-match/numeric for math, hidden unit tests for code, MCQ for science; **no judge models** (clean-room); formatting rewards minimal; KL-to-SFT small or zero (R1-Zero precedent) but logged.
- **No optimization pressure on the CoT channel** (kept from BUILD_PLAN — monitorability is a feature).
- Curriculum by measured pass-rate; difficulty refreshed each epoch from Stage-1 telemetry.
- Infra: rollouts on FP4-quantized policy (~14 GB → high throughput, even on 2–4 GPUs), training updates in MXFP8/BF16; verl/slime-class orchestration on Megatron backend.

### Stage 3 — Self-play problem generation (Absolute-Zero-style, scope-limited)
The model proposes new problems (code-execution tasks, math variants) whose answers our verifiers can check; learnability-filtered (neither trivial nor unsolvable for current policy); feeds Stages 1–2. This de-bottlenecks the human problem bank — the main scaling risk of clean-room RLVR.

### Stage 4 — Effort tiers, agentic RL, safety, preference polish
Variable-effort via effort-conditioned SFT/RL (low/medium/high traces from our own policy, length-binned). Agentic tool-use RL in the harmony harness (browser/python/functions) with verifiable task suites. Safety: deliberative-alignment-style training on a written policy spec + instruction-hierarchy adversarial sets (human-authored + own-model red-team generations). Preference polish: DPO on **human** preference labels only (in-house or licensed human-pref corpora; no external-RLHF-model outputs).

### Compute & sequencing
Pathfinder runs the entire CRB end-to-end first (~2 weeks, 12 GPUs) to calibrate yields and gates; the 20B pass then budgets **2–4 weeks on 12 GPUs** (rollout-dominated; days on 64). CRB is restartable and incremental — it keeps improving the model between releases.

---

## 14. Evaluation, decontamination, and gates

### 14.1 Correctness gates (Phase 0)

1. **Forward parity** (kept): released gpt-oss-20b weights + `o200k_harmony` loaded into our module → logit diff within tolerance (BF16: ~1e-2 max-abs on logits, cosine >0.9999) across sink/SWA/YaRN/clamp unit vectors *and* full prompts. Test-vector-only firewall per §2.3.
2. Bitwise 100-step determinism replay; checkpoint save/restore equivalence; MXFP8-vs-BF16 short-run loss overlay (≤0.3% gap at 5B tokens on PoC).

### 14.2 Continuous eval (cheap, weekly, automated)

Early-signal battery at proxy scales: LAMBADA, HellaSwag, PIQA, ARC-E/C, SciQ, MMLU-var, GSM8K-subset, HumanEval-subset, per-domain val perplexities. Pretrain probes at 0.5/1/2/3.5/5T: + MMLU(-Pro), MATH, BBH, MBPP+, TriviaQA/SimpleQA (factuality watch), RULER ladder during §11. All runs through the decontamination audit (§7.3 step 5) — eval hygiene is an IP asset too.

### 14.3 Re-baselined capability gates (replaces BUILD_PLAN's distillation-anchored gates)

| Checkpoint | Gate (no-tools unless noted) | Steer action if missed |
|---|---|---|
| Base @3.5T probe | MMLU-composite ≥55 | Raise Phase-B fraction + premium epochs (§12) |
| Base, final | MMLU ≥63–66 · GSM8K(8-shot CoT) ≥55 · HumanEval ≥35 | Extend +0.5–1T anneal-heavy tokens before post-training |
| Post-STaR (Stage 1) | MATH-500 ≥60 · GSM8K ≥80 · HumanEval ≥55 · AIME'25 ≥15–25 | Add STaR rounds; expand problem bank via Stage 3 earlier |
| Post-RLVR (Stage 2) | AIME'25 ≥40–55 · GPQA-D ≥45–52 · LiveCodeBench mid-tier · SWE-bench-Verified (harness) ≥35–45 | Iterate RL curriculum; consider +RL compute (cheap vs pretrain) |
| Ship bar v1 | Within ~5–15 pts of gpt-oss-20b on reasoning suite; factuality ≥ its SimpleQA (low bar — pair with retrieval in product) | Ship as v1 + continue CRB; v2 data growth |

These are deliberately wider intervals than BUILD_PLAN's — without a teacher there is no literature anchor for "AIME ≈ 50 after SFT"; Pathfinder's CRB dress-rehearsal narrows them before the 20B commits.

### 14.4 Always

Eval with/without tools × low/medium/high effort; full model-card suite tracked vs gpt-oss-20b and Nemotron-3-Nano as the 2026 reference point; never surface raw `analysis` CoT in products.

---

## 15. Quantization & serving

- **QAT to MXFP4 on MoE weights** (deployment parity with the class standard: E2M1 + E8M0 per-32 block ≈ 4.25 bits/param → MoE ~10.2 GB; BF16 attn/router/embed/head ~3.6 GB → **~14 GB total**, single-GPU servable, even consumer-class). **NVFP4 variant** (E4M3 scales) typically recovers accuracy better on Blackwell — produce both, ship the better one. QAT during the last anneal stretch or as a short post-pretrain phase via TensorRT Model-Optimizer; gate: ≤1–2 pt regression across §14 suite.
- Serving: vLLM / TensorRT-LLM native FP4 on B200; our renderer for harmony-semantics; grammar-constrained decoding for structured outputs; MTP head (if adopted) doubles as self-speculative draft (~1.8× decode).
- Production hardening: strip `analysis` channel; tool sandboxing; rate-limited browser; observability on refusal/effort distributions.
- Release: Apache-2.0 with full provenance report (the clean-room ledger becomes a marketing asset: a model whose entire lineage is auditable).

---

## 16. Consolidated answer: training a 20B-class model with less compute

Direct answer to "how do we get near-20B capability without full-20B compute":

| # | Lever | Effective saving | Status |
|---|---|---|---|
| 1 | **Sparsity** — 3.61B active vs 20B dense | **~5.8× FLOPs** | Already in the design; the reason this project fits 12 GPUs at all |
| 2 | **MXFP8 working precision** | 1.3–1.45× wall-clock | Mature; plan-of-record |
| 3 | **NVFP4 working precision** | 1.5–1.8× wall-clock (supersedes #2) | Gated on Pathfinder loss-parity |
| 4 | **Muon + MuonClip** | 1.2–1.5× token-efficiency | Proven at 1T-param scale; conservative budgeting |
| 5 | **Own SuperBPE-style tokenizer** | ~1.25–1.5× text-per-token-budget | Validate compression on our corpus |
| 6 | **Data quality + 2-phase curriculum + ≤4-epoch premium repeats** | 1.5–3× vs naive web data (FineWeb-Edu/DCLM-class evidence) | Plan-of-record; mixture by ablation |
| 7 | **MTP auxiliary objective** | sample-efficiency + ~1.8× decode at serve | PoC-gated |
| 8 | **muP transfer** | avoids 20B-scale HP sweeps (else ~10–20% program waste / failed-run risk) | Plan-of-record |
| 9 | **MSG growth from Pathfinder** | 1.3–1.5× on the main run | Experimental; gated; free fallback |
| 10 | **WSD plateau forking** | multiple anneal/posttrain variants from one plateau | Plan-of-record |
| 11 | Smaller-but-newer alternative (ship Pathfinder-class 6.5B as a product while 20B waits for the 64-GPU window) | — | Strategic option |
| ✗ | Teacher distillation, warm-start, external synthetic data (the 2026 industry default, worth 2–5×) | forfeited | Clean-room cost, §2.3 |

Multiplicative realistic stack (2×4×5×6 conservative ends, where independent): **~2.5–4×** beyond the sparsity baseline — matching the 21-agent study's "safe levers ≈2.5–3.5×" finding, now with NVFP4 and growth as upside. Bottom line: **a 4T-token MXFP8 run on 12 B200s ≈ 67 days** carries the *effective* training signal of a ~7–12T-token naive run — short of 25T-class leaders on knowledge, competitive on reasoning after CRB.

---

## 17. Risk register (updated)

| Risk | L×I | Mitigation |
|---|---|---|
| Clean-room reasoning ramp slower than gates assume (no teacher anchor) | **H×H** | Pathfinder CRB dress-rehearsal calibrates before 20B commits; Stage-3 self-play de-bottlenecks data; gates have steer-actions, not cliff-edges; RL compute is cheap to extend |
| 64× B200 window never arrives | M×M | §4.5 contingency: 4T on 12 GPUs ≈ 10–11 wk pretrain; or rent ~43K GPU-hrs (~$130–280K) |
| First MoE → router collapse / spikes | M×H | PoC-first; z-loss; qk-clip; dropless EP; expert telemetry; 30–60 min ckpts + auto-rollback; AdamW fallback baseline |
| NVFP4 path immature for MoE in Megatron | M×M | MXFP8 is plan-of-record (mature); NVFP4 strictly gated; TorchTitan hedge |
| MSG growth fails at MoE | M×L | Gated experiment; from-random fallback costs nothing extra |
| Data: cross-source dup inflation / silent LLM contamination | M×H | Union-level fuzzy dedup; provenance tiers; AI-text screening; pre-2023 upweighting; ledger CI |
| 4–6T budget → knowledge gap vs 2026 peers | H×M | Honest positioning (§7.5); retrieval pairing in product; v2 DataCut-2 (10T+) + own-model synthetic |
| Blackwell stack regressions (CUDA/TE/NCCL) | M×M | Phase-0 burn-in; pinned container images; deterministic replay CI |
| License/compliance defect in 4–6T corpus | L×H | Per-source duty tracking; opt-out re-sync at cut; counsel review of §2.3 rule 3; audit-ready ledger |
| Factuality weakness (class-inherent: gpt-oss SimpleQA 6.7) | H×M | Product-level retrieval/grounding; never raw CoT; abstention training in Stage 4 |
| Team bandwidth: MoE infra + post-training are both new | H×H | Strict ladder discipline (never debug two scales at once); Pathfinder absorbs all first-times; hire/contract one RL-infra engineer for CRB (§18) |

---

## 18. Timeline, milestones, budget

### 18.1 Track 1 — current 8–12× B200 (weeks are wall-clock, workstreams overlap)

| Wk | Milestone | Exit gate |
|---|---|---|
| 1–3 | **M0 Foundations**: Blackwell stack burn-in, framework bake-off, arch module + unit tests, eval harness, decontam pipeline, provenance-ledger CI | ✅ Forward parity vs released weights; deterministic replay |
| 2–6 | **M1 Data factory**: ingest §7.2 pool, union dedup, classifiers, DataCut-1 (≥6T curated), own tokenizer trained + validated (≥1.25× compression) | ✅ DataCut-1 frozen + audit report |
| 3–5 | **M2 PoC 1.3B**: 100B tokens; MXFP8/NVFP4 arms; MTP ablation; μP rung check; mixture ablations hosted | ✅ Stable loss, no router collapse; precision gap ≤0.3%; ablation winners locked |
| 5–8 | **M3 Pathfinder 6.5B × 1T** + 131K dry-run + QAT round-trip + MSG dry-run (1.3B→3B grown-vs-control) | ✅ μP transfer verified; NVFP4 go/no-go; MSG go/no-go; ship-quality small base |
| 7–12 | **M4 CRB dress rehearsal** on Pathfinder (Stages 0–4 full loop, small scale); annotation pipeline live; problem banks built | ✅ CRB yield curves measured → §14.3 gates narrowed; post-training infra proven |

### 18.2 Track 2 — on 64× B200 (or contingency on 12)

| Wk (64×) | Milestone |
|---|---|
| 1–3.5 | **M5 Main pretrain** 4–6T (MSG-init if gated-in), benchmark-to-steer probes at 1/2/3.5T |
| 3.5–4.5 | **M6** 131K extension + BF16 anneal (WSD fork point preserved) |
| 4.5–7.5 | **M7 CRB at 20B** (Stages 0–3 minimum for v1) |
| 7.5–9 | **M8** Stage-4 polish + QAT MXFP4/NVFP4 + red-team + model card + release |

Contingency on 12 GPUs: M5 stretches to ~10–15 wk; everything else unchanged. Total program: **~5 months** (with 64-GPU window) to **·~8 months** (12-GPU-only).

### 18.3 Budget envelope

| Item | Estimate |
|---|---|
| Track 1 compute (12× B200 owned, 12 wk) | power/colo ≈ minor; opportunity cost only |
| Track 2 rental (if needed): 43K B200-hr | $130–280K |
| Annotation (Stage-0 SFT + prefs + red-team) | $80–200K (the only stage that buys data — don't starve it) |
| Data infra (CPU cluster/storage for 6T-token factory, ~0.5–1 PB lifecycle) | $30–80K |
| RL-infra engineer (contract, 6 mo) | market rate |
| Contingency 20% | — |

### 18.4 Team shape (minimum viable)

2× pretraining/systems (Megatron, EP, precision), 1× data lead (pipeline + ledger), 1× post-training/RL (CRB owner), 1× eval/safety (harness, decontam, red-team), fractional: counsel (licensing), annotation ops. Founders cover product/serving.

---

## 19. Licensing, compliance, safety

- **Licenses:** ODC-By attribution manifest shipped with weights; Stack v2 agreement + opt-out re-sync at DataCut; per-source duty table maintained by data lead; Apache-2.0 release gated on full-manifest legal review.
- **Clean-room ratification:** §2.3 rule 3 (classifier-selection of human text) and the parity-test firewall (§2.3 rule 1 carve-out) reviewed by counsel before M1 freeze — these are the two judgment calls in the policy.
- **Safety:** ingest-time CBRN/CSAM/PII filtering with logged hit rates; pre-release: deliberative-alignment training (Stage 4), instruction-hierarchy adversarials, frontier-safety-style uplift evals proportionate to a 20B-class open release; staged release (API-first, weights after red-team sign-off) is an option the board should decide explicitly.
- **Auditability:** provenance ledger + decontam audit log + training-config archive = the "full IP" claim made checkable. This is the asset's differentiator; treat it as a deliverable, not overhead.

---

## Appendix A — Formulas and worked math

### A.1 FLOPs per token

Core: 6 × N_active = 6 × 3.61e9 = **2.166e10**.
Attention score+value matmuls per layer per token (fwd): 4 × s_eff × d_attn, with d_attn = 64 heads × 64 = 4096.
Dense layers (12): 4 × 4096 × 4096 ≈ 6.7e7 → 8.05e8. SWA-128 layers (12): 4 × 128 × 4096 ≈ 2.1e6 → 2.5e7.
Fwd attn ≈ 8.3e8 → ×3 (fwd+bwd) ≈ 2.5e9 = +11.5% → **≈2.42e10 FLOPs/token** at seq 4096.

### A.2 Wall-clock

days = TotalFLOPs ÷ (G × PF_eff × 8.64e19).
12 GPUs × 1.4 PF (MXFP8 mid) = 1.45e21 FLOPs/day → 4T (9.7e22): **66.9 d**; 6T (1.45e23): **100 d**.
64 GPUs: 7.74e21/day → **12.5 d / 18.7 d**. NVFP4 @1.8 PF and BF16 @0.9 PF scale linearly. Cross-check: Megatron-Core reports >1.0 PF/GPU sustained on GB200 for DSv3-class MoE (much larger, more comms) — 1.2–1.6 PF on a 21B model in 1–2 nodes is conservative-to-fair.

### A.3 Long-context cost

At 131072 ctx, dense-layer attn: 4 × 131072 × 4096 ≈ 2.15e9/layer fwd → 12 layers ×3 ≈ 7.7e10, SWA negligible → ≈9.9e10 FLOPs/token ≈ **4.1×** the 4K cost. 150B tokens ≈ 1.5e22 ≈ 10 d on 12 GPUs / 2 d on 64.

### A.4 Memory (21B, Muon+AdamW, ZeRO-1/FSDP)

Weights BF16 42 GB · master FP32 84 GB · Muon momentum FP32 (≈19.7B 2D params) 79 GB · AdamW m+v (≈1.2B) 10 GB · grads BF16 42 GB → **≈257 GB total state**, sharded: ~21 GB/GPU (12×) · ~32 GB/GPU (8×) against 180 GB/GPU. Activations with selective recompute at 4K/16M-batch: well within remainder; 131K handled by CP.

### A.5 Serving footprint

MoE 19.12B × 4.25 bits ≈ 10.2 GB + BF16 non-MoE (attn 0.64B + embed/unembed ~1.15B + misc) ≈ 3.6 GB → **≈14 GB**.

### A.6 Token-budget equivalence (the §16 stack)

Effective tokens ≈ 4T × tokenizer(1.25–1.5) × Muon(1.2–1.5) × quality/curriculum(1.5–2 vs naive) ≈ 9–18T naive-equivalent — quoted conservatively in §16 as 7–12T because the factors are not fully independent (quality and tokenizer both concentrate information density).

---

## Appendix B — Proposed algorithms (full specification)

### B.1 MSG — MoE Structured Growth (proposed)

Inputs: donor D (18L × d2160, 32 experts, trained ≥0.8T tokens, post-plateau pre-decay ckpt); target T (24L × d2880, 32 experts).

```
1  DepthGrow (G_stack interleaved):
   order = [1..18] with {4,7,10,13,16,18} duplicated → 24 blocks
   duplicated blocks: copy weights; zero-init each block's output-proj residual
   branch scale α=1.0 (identity-by-residual at t0)
2  WidthGrow (HyperCloning, function-preserving):
   every Linear W[out,in] → block-structured lift to [out',in'] s.t.
   logits(T,x) == logits(D,x) ∀x at t0  (verified numerically, tol 1e-3)
   RMSNorm gains tiled; RoPE/head_dim unchanged (64); n_kv preserved (8)
   add symmetry-breaking noise ε~N(0, (1e-3·σ_w)²) to cloned halves
3  ExpertGrow: per-expert width lift as (2); expert count unchanged (32)
4  RouterReset: router re-init (small σ); freeze non-router params;
   router-only warm: 2B tokens, balanced-load monitor
5  Re-warm whole model: LR 0→peak over 4B tokens → WSD plateau as normal
GATES (run at 1.3B→3B scale first, vs from-scratch control at equal TOTAL flops):
   g1 function-preservation diff pass
   g2 no router collapse / entropy in band after step 4
   g3 ≥1.2× speedup to control's loss at 2× donor budget
   g4 no crossover of control's loss curve within probe horizon
FALLBACK: random init (cost of experiment ≈ one 3B probe run)
```

### B.2 CRB — Clean-Room Reasoning Bootstrap (proposed composition; components individually proven)

```
S0 FormatSFT(base, H_human)            # 50–100K human demos, harmony-semantics
S1 for r in 1..R (R≈3–5):              # STaR / expert iteration
     for q in Bank where 0.1≤pass@16(q)≤0.7:
        C = sample(policy, q, k=16..64, T≈1.0)
        W = verify(C) ∩ consistent(C) ∩ len_sane(C)
        if W=∅: W = verify(rationalize(policy, q, answer(q)))
     D_r = dedupe_balance(∪W);  policy = SFT(policy, D_r ∪ replay(D_{r-1}))
S2 RLVR: GSPO-objective + DAPO kit (clip-higher, dynamic sampling,
     token-level loss, overlong shaping); rewards: EM/unit-tests/MCQ;
     no judge models; KL→SFT small/0; CoT channel reward-free;
     curriculum by live pass-rate buckets; rollouts on FP4 policy
S3 SelfPlay (Absolute-Zero-style, scoped):
     P = propose(policy)  →  keep if verifiable(P) ∧ 0.1≤pass≤0.7
     Bank ← Bank ∪ P      # de-bottlenecks human problem supply
S4 EffortTiers (effort-conditioned SFT/RL on own traces, length-binned)
   AgenticRL (harmony tool harness, verifiable task suites)
   Safety (policy-spec deliberative training + hierarchy adversarials)
   DPO on human preference labels only
Invariant: every training string ∈ {human-authored} ∪ {generated by our ckpts}
```

### B.3 Precision schedule (PSP)

```
tokens 0 → 85–90%:   MXFP8 (E4M3, 32-block scales, FP32 master)
                     BF16 islands: router, norms, sinks, embed/unembed,
                     MTP head, first 2 + last 2 blocks
tokens 85–90% → 100%: BF16 everywhere (anneal + 131K extension)
NVFP4 swap-in rule:   only if Pathfinder shadow (≥50B tokens) shows
                      Δloss ≤0.5% and clean grad-norm profile; recipe =
                      RHT(grads) + 2D weight scaling + SR(grads) + RTN(w,a)
QAT tail:             last 3–5% of anneal in fake-quant MXFP4 (MoE weights)
                      → deployment regression target ≤1–2 pts
```

---

## Appendix C — References

Precision & systems: [NVFP4 pretraining (NVIDIA, 12B/10T)](https://arxiv.org/abs/2509.25149) · [MXFP4 on native FP4 hardware (May 2026)](https://arxiv.org/html/2605.09825v2) · [NVFP4 NVIDIA blog](https://developer.nvidia.com/blog/nvfp4-trains-with-precision-of-16-bit-and-speed-and-efficiency-of-4-bit/) · [NVFP4 throughput w/o accuracy loss](https://developer.nvidia.com/blog/using-nvfp4-low-precision-model-training-for-higher-throughput-without-losing-accuracy/) · [TorchTitan MXFP8+DeepEP on B200](https://pytorch.org/blog/enabling-up-to-41-faster-pre-training-mxfp8-and-deepep-for-deepseek-v3-on-b200-with-torchtitan/) · [Transformer Engine](https://github.com/NVIDIA/TransformerEngine) · [Megatron-LM](https://github.com/NVIDIA/Megatron-LM) · [Megatron-Core MoE roadmap 2026 Q2](https://github.com/NVIDIA/Megatron-LM/issues/4815) · [Scalable MoE training with Megatron Core](https://arxiv.org/abs/2603.07685) · [Megatron-Bridge mixed precision](https://docs.nvidia.com/nemo/megatron-bridge/0.2.0/training/mixed-precision.html) · [Megatron-Bridge MTP](https://docs.nvidia.com/nemo/megatron-bridge/latest/training/multi-token-prediction.html)

Optimization: [Muon is scalable (Moonlight)](https://arxiv.org/html/2502.16982v1) · [Kimi K2 / MuonClip](https://arxiv.org/pdf/2507.20534) · [MuonClip overview](https://www.emergentmind.com/topics/muonclip-optimizer) · [μP weight-decay caveat](https://arxiv.org/pdf/2510.19093) · [Optimal embedding LR](https://arxiv.org/pdf/2506.15025) · [D2Z linear-to-zero](https://arxiv.org/pdf/2502.15938) · [WSO no-decay-for-SFT](https://arxiv.org/abs/2603.16127) · [WSD schedules](https://www.emergentmind.com/topics/warmup-stable-decay-wsd-schedules)

MoE & architecture: [Optimal sparsity: params vs FLOPs](https://arxiv.org/abs/2501.12370) · [Sparsity for reasoning saturates](https://arxiv.org/html/2508.18672v1) · [Expert-granularity scaling laws](https://arxiv.org/pdf/2507.17702) · [Comprehensive MoE scaling law (batch/LR)](https://arxiv.org/html/2509.23678v1) · [DeepSeek-V3](https://arxiv.org/pdf/2412.19437) · [DeepSeek-V3.2 / DSA](https://arxiv.org/pdf/2512.02556) · [DSA first-principles](https://www.tensoreconomics.com/p/deepseek-sparse-attention-from-first) · [Kimi Linear](https://arxiv.org/abs/2510.26692) · [gpt-oss model card](https://arxiv.org/abs/2508.10925) · [Nemotron 3 Nano (25T-token recipe)](https://arxiv.org/pdf/2512.20848) · [Nemotron 3 Super](https://arxiv.org/html/2604.12374v1) · [FastMTP](https://arxiv.org/pdf/2509.18362)

Growth: [Stacking your Transformers (G_stack)](https://openreview.net/forum?id=FXJDcriMYH) · [HyperCloning](https://arxiv.org/html/2409.12903v1) · [apple/ml-hypercloning](https://github.com/apple/ml-hypercloning)

Data & tokenizer: [Nemotron-CC](https://arxiv.org/html/2412.02595v1) · [Nemotron-CC-Math](https://arxiv.org/html/2508.15096v1) · [GneissWeb](https://arxiv.org/pdf/2502.14907) · [Common Pile](https://arxiv.org/pdf/2506.05209) · [DCLM](https://arxiv.org/abs/2406.11794) · [Data-constrained scaling (4-epoch law)](https://arxiv.org/abs/2305.16264) · [Simplification+curriculum under data constraint](https://arxiv.org/pdf/2509.24356) · [Curriculum pretraining](https://arxiv.org/pdf/2506.11300) · [Mid-training survey](https://arxiv.org/html/2510.06826v1) · [Curriculum × LR-decay interaction](https://arxiv.org/html/2511.18903v1) · [SuperBPE](https://arxiv.org/pdf/2503.13423)

Post-training: [Post-training in 2026 (GRPO/DAPO/RLVR survey)](https://llm-stats.com/blog/research/post-training-techniques-2026) · [STaR](https://www.emergentmind.com/topics/self-taught-reasoning-star) · [Absolute Zero](https://arxiv.org/pdf/2505.03335) · [Reasoning with sampling (base-model capability)](https://arxiv.org/html/2510.14901v1) · [Does RL exceed the base model?](https://arxiv.org/pdf/2504.13837) · [Group-advantage bias](https://arxiv.org/html/2601.08521) · [Uncertainty-aware advantage shaping](https://arxiv.org/pdf/2510.10649) · [λ-GRPO](https://arxiv.org/pdf/2510.06870) · [RLVR update direction](https://arxiv.org/pdf/2603.22117) · [Self-improvement in LRMs](https://arxiv.org/html/2605.24998)

Landscape: [2026 open-LLM overview](https://huggingface.co/blog/daya-shankar/open-source-llms) · [Nemotron 3 family](https://research.nvidia.com/labs/nemotron/Nemotron-3/) · [Qwen3.5 vs Nemotron 3 Nano](https://awesomeagents.ai/tools/qwen-3-5-35b-a3b-vs-nemotron-3-nano/)

*Internal:* BUILD_PLAN.md (2026-06) · Research Report (uploaded; inaccessible to this session's PDF reader — findings reflected via BUILD_PLAN §2 validation table) · 500M run notes.
