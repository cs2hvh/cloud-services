# Compare OpenRouter Wokey — full transcript

**Source:** <https://chatgpt.com/share/6a8d5e13-c3c0-83e8-a3c3-a5145c26427b>
**Captured:** 2026-08-25 — 8 turns.

Captured with `npm run transcript`, which renders the page and sweeps the
whole thread. Every turn below is verbatim: the learner turns are raw
speech-to-text where the conversation was spoken, and the assistant's filler
("Mm-hmm.", "Checking.") and appended citation domains are left in. Nothing is
paraphrased or tidied.

---

## 1 · User

compare openrouter vs wokey

---

## 2 · ChatGPT

They look similar on the surface—both give you one OpenAI-compatible API for many models—but underneath they are quite different businesses.

	OpenRouter	Wokey
Core idea	Large multi-provider AI gateway/router	Marketplace that can turn unused subscription/upstream capacity into API capacity
Maturity	Very mature, huge scale	Very new/small
Models	500+ active models, 80+ providers according to OpenRouter	Claude, GPT, DeepSeek, Gemini, xAI, Kimi, etc.; catalog is smaller/dynamic
Supply	Established inference/API providers	Mix of upstream capacity + Wokey Provider Nodes
Reliability	Strong automatic provider failover/routing	Availability can change depending on Provider Node/upstream state
Routing	Sophisticated provider selection, fallbacks, Auto Router, cost/throughput routing	Unified routing, but substantially less proven
API	OpenAI compatible	OpenAI compatible
Production use	Much safer choice	I'd treat it as experimental
Interesting advantage	Reliability + breadth + observability	Potentially very cheap access because spare capacity can be resold
Main risk	5.5% PAYG platform fee / intermediary	Supply reliability, account/provider-policy risk, much younger platform

OpenRouter is already enormous. It currently advertises 500+ models, 80+ providers, 10M+ users and hundreds of trillions of monthly tokens. It automatically moves traffic between providers when one becomes unhealthy, and you can explicitly optimize for price, throughput, provider, privacy policy, or use its automatic model router. 
OpenRouter
+1

Its PAYG pricing currently adds a 5.5% platform fee, while inference prices are generally passed through from providers. 
OpenRouter
+1

Wokey is the interesting one architecturally

Wokey isn't merely trying to clone OpenRouter.

Its unusual idea is:

Person has unused Claude/OpenAI/Gemini/etc. capacity → runs Wokey Provider Node → Wokey routes other users' requests through that capacity → provider earns money.

Wokey itself describes the concept as putting idle AI subscriptions to work. 
Wokey
+1

So simplified:

OpenRouter

Your app
   ↓
OpenRouter
   ↓
Fireworks / Together / Google / Anthropic /
DeepInfra / other commercial API providers
   ↓
Model

versus potentially:

Wokey

Your app
   ↓
Wokey
   ↓
Provider Node
   ↓
Someone's authorized upstream/subscription capacity
   ↓
Claude / GPT / Gemini / DeepSeek...

That can create very different economics.

Wokey explicitly says model price varies with supply, demand and network load, and that model availability changes with Provider Nodes/upstream state. 
Wokey
+1

But that's also its biggest weakness.

Wokey itself has written about the risk of upstream providers detecting relay/resale behavior and account bans. Its Provider Node architecture tries to mitigate that by making requests originate from the provider's own machine/IP. Even Wokey acknowledges this cannot guarantee zero bans. 
Wokey

That is fundamentally different from OpenRouter's established commercial provider network.

For your use case

If you're thinking about using one as an API layer in a product, I'd currently rank them:

Production SaaS

OpenRouter >>> Wokey

You get mature routing, provider fallbacks, logging, budgets, caching, privacy policies and much greater capacity.

Cheap experiments / personal agents / coding agents

Wokey could be very interesting.

Especially if the price difference is substantial. An agent burning tens or hundreds of millions of tokens can make cheap spare capacity attractive.

Building something similar yourself

Wokey may actually be more interesting to study than OpenRouter.

OpenRouter's moat increasingly comes from scale and provider relationships. Wokey is experimenting with a decentralized-ish supply side:

Lots of people own AI subscriptions
             ↓
Most don't consume 100% of quota
             ↓
Aggregate spare quota
             ↓
Sell it as unified inference

That is a clever marketplace model if upstream-provider rules allow it and reliability can be controlled.

One important privacy difference

I'd also be considerably more conservative with sensitive production data on Wokey right now. Its privacy policy says abnormal/failed requests may have the full original request payload retained for 14 days, currently without automatic masking/redaction. 
Wokey

OpenRouter, meanwhile, has much more developed data-policy routing and enterprise controls, including provider allowlists and zero-data-retention policies. 
OpenRouter

So my current verdict is:

OpenRouter = infrastructure I'd confidently build on.

Wokey = interesting new infrastructure I'd benchmark and experiment with, but I wouldn't make it the only backend for a serious product yet.

The fascinating part of Wokey isn't that it's another OpenRouter. It's the Provider Node / unused-subscription marketplace model. That's the part worth watching.

---

## 3 · User

price and cost like in my ai cloud compay i am thinking to swith openrouter to wokey
research properly

---

## 4 · ChatGPT

Yes — if your goal is to lower inference cost for your AI cloud company, Wokey is dramatically cheaper on some frontier models. But after researching how Wokey gets those prices, I would not replace OpenRouter outright. I would add Wokey as a low-cost routing tier and retain OpenRouter/direct providers as the production fallback.

The reason is important: Wokey's low price isn't just "OpenRouter with a lower margin." Much of its capacity comes from an entirely different supply model.

Current price comparison

OpenRouter passes through provider inference prices and charges a 5.5% fee when purchasing PAYG credits. 
OpenRouter
+1

Wokey says its prices are real-time and change with supply, demand, and network load, so unlike OpenRouter you cannot assume today's price will remain tomorrow's. 
Wokey

The most recent independently tracked Wokey prices I could retrieve are:

Model	OpenRouter input / 1M	OpenRouter output / 1M	Recent Wokey input / 1M	Recent Wokey output / 1M	Wokey ratio
Claude Sonnet 4.6	$3.00	$15.00	~$0.54	~$2.70	18%
Claude Sonnet 4.5	$3.00	$15.00	~$0.54	~$2.70	18%
Claude Opus 5	$5.00	$25.00	~$1.10	~$5.50	22%
Claude Opus 4.8	$5.00	$25.00	~$1.10	~$5.50	22%
GPT-5.6 Sol	$5.00	$30.00	~$0.50	~$3.00	10%

The OpenRouter figures above are directly confirmed by OpenRouter. For example, Claude Opus 5 is $5/$25 and GPT-5.6 Sol is $5/$30. 
OpenRouter
+1
 Sonnet 4.6 is $3/$15. 
OpenRouter

The Wokey exact numbers come from a price tracker updated in August rather than Wokey's static HTML, because Wokey loads its current prices dynamically and explicitly says they can change request-by-request. The tracker recently recorded Sonnet 4.6 at $0.54/$2.70, Opus 5 at $1.10/$5.50, and GPT-5.6 Sol at $0.50/$3.00. 
CCNavX

So the price difference is not 10–20%.

It's potentially:

Claude: ~78–82% cheaper

GPT-5.6: ~90% cheaper

That's enormous.

What that means at AI-cloud scale

Suppose your customers collectively consume:

100M input + 20M output tokens/month.

Claude Sonnet 4.6

OpenRouter:

Input:
100 × $3       = $300

Output:
20 × $15       = $300

Inference      = $600
OpenRouter 5.5% ≈ $33

Cash cost ≈ $633/month

Recent Wokey price:

Input:
100 × $0.54    = $54

Output:
20 × $2.70     = $54

Cost ≈ $108/month

Difference:

$633 → ~$108

Saving:

~$525/month or ~83%

Now scale that by 100:

10B input
2B output

roughly:

	Cost
OpenRouter	~$63,300
Wokey at tracked rate	~$10,800
Difference	~$52,500/month

That's why Wokey becomes extremely interesting for an AI-cloud provider.

GPT-5.6 Sol is even crazier

Using the same 100M input / 20M output:

OpenRouter:

100 × $5  = $500 input
20 × $30  = $600 output

= $1,100 inference

+ 5.5%
≈ $1,160.50

Wokey tracked price:

100 × $0.50 = $50
20 × $3.00  = $60

≈ $110

So:

OpenRouter ≈ $1,160
Wokey ≈ $110

That's roughly 90.5% lower cost.

If you sold GPT-5.6 Sol to customers at, say:

$3 input
$18 output

you're still offering customers a large discount versus official/API pricing while theoretically keeping an enormous gross margin on Wokey-routed traffic.

But here's the catch that matters for your company

Why can Wokey sell GPT-5.6 for around 10% of official API economics?

Because its core model is explicitly:

turn unused AI-subscription quota into API capacity.

Wokey describes Provider Node as connecting idle official subscriptions/upstream capacity into its routing network. 
Wokey
+1

Simplified:

                     OpenRouter
                         │
Your cloud ──────────────┤
                         ↓
              Official/commercial APIs
           Anthropic / Azure / AWS /
           Vertex / OpenAI / etc.

versus:

                       Wokey
                         │
Your cloud ──────────────┤
                         ↓
                 Provider Nodes
                         ↓
            Idle subscription / other
               upstream capacity
                         ↓
                Claude / GPT / etc.

That's how you get $0.50 instead of $5.

And that is also where the risk comes from.

The biggest warning for you

Wokey itself has an entire article discussing relay account bans.

It says upstream providers look for things such as unusual concurrency, account sharing patterns, IP movement and other behavior, and Wokey built Provider Node partly to make traffic originate from the subscription owner's own network.

It explicitly says even this cannot guarantee zero bans. 
Wokey

That's a very different risk profile from OpenRouter.

OpenRouter might route Claude Opus 5 across:

Anthropic
AWS Bedrock
Google Vertex
Azure
Claude Platform on AWS

with failover. 
OpenRouter

If one provider fails, OpenRouter moves the request.

For example OpenRouter reports GPT-5 availability around 99.98% with routing, compared with much lower availability without routing in its recent telemetry. 
OpenRouter

Wokey itself says model availability changes according to Provider Node and upstream state. 
Wokey

That's not something I'd want as the sole upstream behind a cloud API SLA.

There is an even bigger commercial issue

For GPT subscription-derived capacity in particular, this deserves serious attention.

OpenAI's current help documentation states that ChatGPT Pro usage may not involve:

reselling access or using ChatGPT to power third-party services.

OpenAI Help Center
+1

OpenAI's Services Agreement separately prohibits reselling/leasing account access and buying/selling/transferring API keys. At the same time, proper API customers are allowed to integrate the API into applications made available to end users. 
OpenAI

So there's an enormous distinction:

Official API capacity
       ↓
Your SaaS/cloud
       ↓
Customers

✅ normal commercial API model

versus:

Individual AI subscription
       ↓
Provider Node
       ↓
Relay marketplace
       ↓
Your cloud
       ↓
Customers

⚠ much more questionable / fragile

I'm not saying all Wokey supply is unauthorized—its provider documentation refers to both authorized upstream resources and subscriptions. 
Wokey

But you cannot treat $0.50/M GPT supply as economically equivalent to $5/M official API supply.

That discount exists because you're accepting additional supply risk.

Another issue: enterprise data

For your AI cloud, this matters a lot.

Wokey says normal successful requests mostly store metadata rather than full prompts/output.

However, for failed, abnormal or investigative requests, the current MVP can retain the full original request payload for 14 days, and those archived payloads aren't automatically redacted or masked. 
Wokey

That would make me uncomfortable exposing Wokey as the default backend for customers sending:

company source code

financial documents

legal documents

private RAG data

personal information

OpenRouter has substantially more mature provider-policy routing and enterprise controls.

There is also a financial/accounting issue

OpenRouter clearly offers enterprise billing/invoicing options and contractual SLA options. 
OpenRouter

The third-party Wokey review I found says Wokey currently accepts things such as USDT/USDC/Alipay, starts around $1, and it could not confirm proper business invoices. 
CCNavX

I would independently verify invoices/GST/accounting documentation with Wokey before making it a meaningful cost line for an Indian company.

Also, Wokey's published refund policy says credited balances/API capacity are generally non-refundable. 
Wokey

What I would do with your AI cloud

I would not do this:

Current

AhuraCloud
     ↓
OpenRouter


Migration

AhuraCloud
     ↓
Wokey

I'd build this:

                         ┌── Wokey
                         │   cheap route
                         │
AhuraCloud Gateway ──────┼── OpenRouter
                         │   reliable route
                         │
                         ├── Direct Anthropic
                         │
                         ├── Direct OpenAI
                         │
                         └── Your/self-hosted models

And give every upstream an internal score:

price
latency
success rate
rate limit
model availability
privacy level
provider type
SLA level

Then you can route intelligently.

For example:

Customer chooses:

Economy
   ↓
Wokey first
   ↓ fail
OpenRouter
   ↓ fail
direct provider


Standard
   ↓
OpenRouter first
   ↓
direct provider


Enterprise / ZDR
   ↓
Approved official providers only

This is much more powerful commercially.

You could create three pricing classes
AhuraCloud tier	Underlying supply	Customer price	Margin
Economy	Wokey / discounted routes	Very cheap	Potentially huge
Standard	OpenRouter	Near official API	Normal
Enterprise	Direct/OpenRouter approved providers	Premium	Lower but safer

Then you aren't forced to hide the tradeoff.

For example, you could describe Economy as:

Best-effort inference
Dynamic routing
No guaranteed upstream provider
Lower cost

while Enterprise gets:

Verified commercial providers
Region control
Data-policy controls
SLA
Guaranteed fallback

That could actually become an advantage for your platform rather than simply replacing one supplier with another.

My decision today

If I were running your cloud infrastructure:

Decision	My choice
Remove OpenRouter	❌ No
Integrate Wokey	✅ Yes
Make Wokey primary for cheap consumer traffic	✅ After testing
Put confidential enterprise data through it	❌ Not initially
Depend entirely on Wokey	❌ No
Build Wokey → OpenRouter fallback	✅ Absolutely
Exploit Wokey pricing for Economy tier	Very interesting

The economics are compelling enough that I think you should integrate Wokey and benchmark it, rather than dismiss it.

But the right move isn't really "switch OpenRouter → Wokey."

It's:

turn your cloud into its own meta-router.

Then OpenRouter becomes one supplier, Wokey another, your own GPU infrastructure another, and direct APIs another.

That gives you the thing OpenRouter itself has: control over routing economics. And if Wokey's $0.50 GPT route disappears tomorrow because a pool of subscription accounts gets restricted, your customers don't go down—you automatically move them to OpenRouter.

For an AI-cloud business, that's a much stronger architecture than betting the company on either gateway.

---

## 5 · User

read its doc see how it work all type of api and service it providng

---

## 6 · ChatGPT

I went through Wokey’s public docs, API pages, privacy policy, blog, and its open-source Provider Node repository. It is more than just an OpenRouter-style LLM gateway.

The clean way to understand Wokey is as four products connected together:

                    WOKEY

        ┌─────────────────────────────┐
        │ 1. Consumer AI Gateway      │
        │ Chat / multimodel API       │
        └─────────────┬───────────────┘
                      │
        ┌─────────────┴───────────────┐
        │ 2. Media APIs               │
        │ Images + Video              │
        └─────────────┬───────────────┘
                      │
        ┌─────────────┴───────────────┐
        │ 3. Routing Marketplace      │
        │ Dynamic supply + billing    │
        └─────────────┬───────────────┘
                      │
        ┌─────────────┴───────────────┐
        │ 4. Provider Node            │
        │ People supply AI capacity   │
        └─────────────────────────────┘
1. Main text/LLM API

The central API is OpenAI-compatible.

Base URL is essentially:

https://api.wokey.ai/v1

and the documented basic call is:

POST /v1/chat/completions
Authorization: Bearer <WOKEY_API_KEY>

You can use a normal OpenAI SDK and mostly just change:

baseURL
apiKey
model

Wokey explicitly pitches this as working with existing OpenAI SDKs, agents, CLIs and backend services. Wokey then handles routing, billing, limits and current model supply. 
Wokey
+1

For example:

JavaScript
const client = new OpenAI({
  apiKey: process.env.WOKEY_API_KEY,
  baseURL: "https://api.wokey.ai/v1"
})

const response = await client.chat.completions.create({
  model: "claude-sonnet-4.6",
  messages: [
    { role: "user", content: "Hello" }
  ]
})

The important architectural point is that the Wokey model name isn't necessarily one physical provider account.

A request can be routed to whatever eligible supply currently exists.

2. The model catalog is dynamic

This differs substantially from a normal fixed-price API provider.

Wokey's documentation says:

model IDs and prices come from its public model catalog, and availability changes with Provider Node and upstream state.

Wokey
+1

So logically:

Request:
claude-sonnet-x
       │
       ↓
Wokey router
       │
       ├── Provider A capacity available?
       │
       ├── Provider B available?
       │
       ├── Direct/upstream capacity?
       │
       └── limits/quota/health?
       ↓
Chosen supply

This also explains why their pricing can be dynamic.

Unlike:

Anthropic:
Sonnet = fixed $X / million tokens

Wokey effectively has:

Current Sonnet supply
+ current demand
+ provider capacity
+ platform routing state
        ↓
current price

Their model page explicitly says actual settlement is based on the price at request processing time. 
Wokey

For your cloud platform, this means you should not hardcode Wokey's price as your permanent cost.

You'd want something like:

Wokey model catalog
       ↓
poll/cache pricing
       ↓
your internal model catalog
       ↓
add margin
       ↓
customer pricing
3. Automatic model routing

They also show a special model selection:

JSON
{
  "model": "auto"
}

in their own quick-start documentation. 
Wokey

That suggests Wokey can choose an available model/routing path rather than you always specifying a fixed backend.

Conceptually:

model = auto
      ↓
Wokey routing
      ↓
appropriate available capacity

For your cloud, though, I would probably avoid exposing auto directly until its routing guarantees are documented more precisely.

You probably want:

customer selects Claude Sonnet
        ↓
your gateway resolves exact family
        ↓
Wokey

rather than:

customer expects Claude
        ↓
auto
        ↓
unknown model

unless you deliberately create an "Auto / Cheapest" tier.

4. Image generation API

This was one of the more interesting discoveries.

Wokey officially exposes:

POST /v1/images/generations

and

POST /v1/images/edits

using OpenAI-compatible conventions. 
Wokey
+1

So there are two capabilities.

Generation
prompt
   ↓
image model
   ↓
generated image
Editing
existing image
+
instruction
   ↓
image editing model
   ↓
modified image

Their Studio UI uses the same underlying capability as the API. 
Wokey

They market it for:

avatars

posters

stickers

logos

illustrations

photographs

iterative conversational edits

This is important for your cloud because you don't necessarily need a separate Replicate/Fal/other provider just for images if Wokey's quality/pricing is acceptable.

You could expose:

/api/v1/images/generations
/api/v1/images/edits

through your own gateway.

5. Video generation API

Wokey has also launched video generation.

The documented public endpoint family is:

/v1/videos

and unlike text generation, it uses an asynchronous job model. 
Wokey

That means:

POST video generation
       ↓
job created
       ↓
job ID
       ↓
poll/status
       ↓
processing
       ↓
completed
       ↓
play/download result

rather than keeping one HTTP request alive for perhaps several minutes.

Their first documented video offering is:

Seedance 2.0 Mini
at 720p, billed with a fixed per-second price. 
Wokey

This is quite useful architecturally.

Your cloud could present:

POST /videos
       ↓
{
   id: "job_xxx",
   status: "queued"
}

GET /videos/job_xxx
       ↓
{
   status: "completed",
   output: ...
}

Wokey's own website and public API apparently share this job architecture. 
Wokey

6. What I did NOT find documented

This is equally important.

I could verify public documentation for:

Chat/completions
Images/generations
Images/edits
Videos

But I could not confirm proper public Wokey APIs for several services you might expect from a full AI cloud platform:

Capability	Wokey status from docs I found
Text/chat	✅
Reasoning models	✅ through model gateway
Tool/function calling	likely model-dependent, but detailed compatibility isn't clearly documented publicly
Streaming	clearly used/supported operationally, but public docs are sparse
Image generation	✅
Image editing	✅
Video generation	✅
Embeddings	Not confirmed
Reranking	Not confirmed
Speech-to-text	Not confirmed
Text-to-speech	Not confirmed
Moderation	Not confirmed
OCR-specific API	Not confirmed
Batch inference API	Not confirmed
Fine-tuning	Not found
Vector database	❌ not a Wokey service I found
Dedicated deployments	❌ not documented
GPU instances	❌
Serverless GPU	❌

So don't think of Wokey as:

Runpod + OpenRouter + ElevenLabs + Pinecone + Replicate.

It isn't that.

Right now it looks much more like:

cheap multi-provider inference marketplace + image/video gateway.

7. Provider Node is the really unusual component

This is what differentiates Wokey.

Provider Node is open-source and runs on:

macOS

Linux

Windows

Docker

GitHub

A provider installs it locally.

The normal flow is:

Provider's computer
      │
      ├── Claude subscription
      ├── Codex/OpenAI authorization
      ├── Grok authorization
      ├── Kimi
      ├── DeepSeek
      └── etc.

Then:

Provider Node
     │
     │ outbound WebSocket
     ↓
Wokey Platform

The documented bridge is:

wss://node.wokey.ai:8443/internal/provider/connect

GitHub

The platform sends jobs over this WebSocket.

8. Surprisingly, Provider Node does NOT read the prompts

This is a technically clever design.

I initially imagined:

Wokey
 ↓
Provider Node
 ↓
decrypt request
 ↓
Claude

but that's not how they've implemented it.

Their repo documents:

Wokey Platform
     ↓
encrypted tunnel
     ↓
Provider Node
     ↓
raw TCP connection
     ↓
Official vendor

Wokey Platform performs the TLS session through the node.

The node only relays encrypted TCP bytes.

Therefore Provider Node itself supposedly cannot see:

prompts

responses

authorization headers

GitHub
+1

In simplified networking terms:

                      TLS encrypted
                   <==============>

Wokey Platform  ── Provider Node ── Claude/OpenAI
                         ↑
                      TCP relay

The provider's machine acts mostly like a restricted egress gateway.

That's a much better design than giving random provider-node operators plaintext customer prompts.

9. But Wokey Platform itself DOES hold provider credentials

This distinction matters.

The provider node doesn't construct the vendor request.

Instead:

Wokey Platform
      ↓
constructs vendor HTTPS request
      ↓
uses provider credential
      ↓
TLS through provider node
      ↓
vendor

During provider onboarding, the provider explicitly authorizes/imports credentials, and the credential bundle gets uploaded to Wokey's encrypted credential store. 
GitHub
+1

So the trust model is:

Provider trusts:
Wokey Platform

Consumer trusts:
Wokey Platform

Provider Node operator:
doesn't see consumer payload

That nuance is important.

10. Supported provider authorization

The current open-source node supports several authorization methods.

Documented ones include:

Codex auth.json

Claude Code credentials

manual OAuth token JSON

Claude OAuth authorization-code flow

Codex device-code/OAuth

Grok/xAI device-code OAuth

Jimeng/Dreamina device authorization

GitHub
+1

Interestingly, Wokey explicitly does not scrape:

browser cookies
browser sessions
browser safe-storage secrets

GitHub

That's a good security decision.

11. Provider vendors supported

The node's hardcoded egress allowlist currently contains at least:

Vendor	Capacity
OpenAI / Codex	✅
Anthropic / Claude	✅
Alibaba Qwen	✅
Zhipu	✅
Moonshot / Kimi	✅
MiniMax	✅
Xiaomi MiMo	✅
DeepSeek	✅
Google Gemini	✅
xAI / Grok	✅
Jimeng / Dreamina	✅

GitHub
+1

The official domain list is even hardcoded in the open-source node, rather than something Wokey can silently change remotely.

For example:

*.openai.com
*.chatgpt.com

*.anthropic.com
*.claude.com
*.claude.ai

generativelanguage.googleapis.com

*.deepseek.com

*.x.ai
*.grok.com

and others. 
GitHub

12. Provider supply behaves like a marketplace

Provider side:

unused Claude quota
       ↓
Wokey Provider Node
       ↓
successful requests
       ↓
usage recorded
       ↓
earnings
       ↓
payout

Consumer side:

money/balance
       ↓
Wokey
       ↓
request
       ↓
routing
       ↓
provider supply
       ↓
model output

Wokey itself describes the arrangement as:

Buyers get unified access, sharers monetize unused quota, and Wokey handles routing, billing, settlement and risk.

Wokey

This is almost a two-sided compute marketplace.

That's the key idea.

13. Provider health and routing

The Provider Node reports things such as:

availability
health
capacity/saturation
connection status
credential status

The central Wokey platform decides:

routing
billing
entitlement
quota
model mapping
settlement

Provider Node explicitly cannot decide these things. 
GitHub

So Wokey controls the marketplace while nodes provide the exit capacity.

14. They built proper tunnel backpressure

I also looked at the technical transport because it tells us how serious the implementation is.

Their current node supports:

json_base64_v1
binary_v1

relay transports.

The newer binary transport has per-session credit/window flow control.

That prevents:

slow provider connection
        ↓
unlimited queued WebSocket data
        ↓
RAM blowup

There is also a 1 MiB WebSocket message cap and drain behavior during upgrades. 
GitHub

So this isn't merely a tiny HTTP proxy script. Someone has put real engineering into the relay transport.

15. Streaming appears to be taken seriously

The Provider Node releases include work on streaming idle timeouts, and its transport specifically handles stream backpressure. 
GitHub
+1

So streamed LLM output is clearly part of the system.

For your gateway:

client
  ↑ SSE
AhuraCloud
  ↑ SSE
Wokey
  ↑ tunnel
provider capacity

should be technically viable.

I would still benchmark:

TTFT

token/sec

stream stalls

reconnect behavior

abort handling

before putting it in production.

16. Billing system is more sophisticated than simply deducting tokens

Their privacy/technical documentation reveals internal concepts including:

request
execution
token usage
charges
settlement strategy
routing snapshot
lease snapshot
price snapshot
ledger entries

Wokey

That gives us clues about Wokey's architecture:

incoming call
   ↓
price snapshot
   ↓
capacity lease
   ↓
routing decision
   ↓
execution
   ↓
token accounting
   ↓
consumer charge
   ↓
provider settlement
   ↓
ledger

That's actually quite close to what you'd need to build an inference marketplace yourself.

17. Payments / blockchain components

Their privacy policy mentions infrastructure involving:

wallet addresses

transaction hashes

on-chain settlement

USDC

Base

x402

internal transfers

payouts

referrals

Wokey

So it looks like Wokey has or is developing crypto-based settlement infrastructure in addition to normal account balances.

Again, this is why I would think of Wokey as a marketplace, not merely an API proxy.

18. Referral system

There's also a referral product:

referral link
     ↓
new API consumer/provider
     ↓
reward tracking

The public referral page explicitly targets both developer communities and Provider Node networks. 
Wokey

For your cloud this isn't especially important, but it reinforces their strategy:

grow both demand AND supply.

19. Privacy architecture

For successful normal inference calls, Wokey says its main request tables generally store metadata rather than full prompts/outputs:

model
vendor
status
timestamps
tokens
charge
routing info

Wokey

However:

failed/abnormal/investigative requests

can have their full request payload archived for 14 days, currently without automatic redaction. 
Wokey

So I'd classify Wokey internally as:

Consumer workloads:
✅ probably acceptable after testing

Enterprise confidential:
⚠️ separate policy decision

Zero-data-retention:
❌ don't claim this based on current docs
20. What's relevant to your AI cloud

This is where things get more interesting.

You already have many higher-level AI services. Wokey shouldn't replace your cloud.

It should replace part of your inference supply layer.

Think:

YOUR AI CLOUD

API Gateway
│
├── Chat
├── Embeddings
├── Images
├── Video
├── OCR
├── TTS
├── STT
├── Reranking
├── Moderation
├── Vector DB
├── Fine-tuning
└── Dedicated deployment

Underneath:

INFERENCE ROUTER

            ┌── Wokey
            │   ├ Claude
            │   ├ GPT
            │   ├ Gemini
            │   ├ Grok
            │   ├ Kimi
            │   ├ DeepSeek
            │   ├ Images
            │   └ Video
            │
            ├── OpenRouter
            │
            ├── Runpod
            │
            ├── direct providers
            │
            └── your GPU infrastructure

Wokey does not remove the need for your own:

vector DB

fine tuning

deployment orchestration

dedicated GPUs

observability

accounts

quotas

billing

API keys

enterprise controls

custom inference products

But it could dramatically reduce the COGS of the commodity model portion.

21. I would map your APIs like this
Your product	Wokey
Chat completions	Primary candidate
Claude models	Strong candidate
GPT models	Strong candidate but policy-risk investigate
Gemini	Candidate
Grok	Candidate
DeepSeek	Candidate
Kimi	Candidate
Qwen	Candidate
Image generation	Candidate
Image editing	Candidate
Video	Candidate
Embeddings	Keep existing
Reranking	Keep existing
TTS	Keep existing
STT	Keep existing
OCR	Keep existing
Moderation	Keep existing
Vector DB	Keep yours
Fine tuning	Keep yours
Dedicated deployment	Keep yours
GPU workloads	Keep yours/Runpod
22. One major insight for your business

After reading the node source/docs, I no longer think the main opportunity is merely:

"replace OpenRouter with Wokey."

The much bigger strategic idea is:

AhuraCloud
    ↓
build your own routing layer
    ↓
Wokey + OpenRouter + Direct + Your GPUs

because Wokey itself proves that inference supply doesn't need to come from one source.

Your internal interface could be:

TypeScript
interface InferenceProvider {
  models(): Promise<Model[]>
  price(model): Promise<Price>
  health(model): Promise<Health>
  completion(request): AsyncIterable<Chunk>
}

Then:

Claude Sonnet request
        ↓
Ahura Router
        ↓
compare:

Wokey       $0.54/M   healthy
OpenRouter  $3.00/M   healthy
Direct      $3.00/M   healthy

        ↓
Wokey

If Wokey starts failing:

Wokey
  ↓ failure / latency / unavailable
OpenRouter
  ↓
success

That lets you capture Wokey economics without inheriting Wokey reliability as your customer experience.

And after inspecting their Provider Node, I'd actually say Wokey is worth doing a serious technical proof-of-concept with. The provider-side exit architecture, binary tunnel/backpressure, credential onboarding, health reporting, marketplace accounting and media APIs show substantially more engineering than I initially assumed. 
GitHub
+1

The next thing I would investigate before you make the migration decision is their complete current model catalog + exact live prices + context limits + image/video prices, then put it directly against OpenRouter in one table. That will show exactly which of your existing AI-cloud models should route to Wokey and which should stay where they are.

---

## 7 · User

are sure because we are using it of openrouter?
"

Embeddings	Not confirmed
Reranking	Not confirmed
Speech-to-text	Not confirmed
Text-to-speech	Not confirmed
Moderation	Not confirmed
OCR-specific API	Not confirmed
Batch inference API	Not confirmed
Fine-tuning	Not found
Vector database	❌ not a Wokey service I found
Dedicated deployments	❌ not documented"
Show more

---

## 8 · ChatGPT

You’re right to challenge that. My earlier table was misleading because I compared Wokey against a broader “AI cloud feature list” instead of checking what OpenRouter itself currently provides.

I re-checked OpenRouter’s current August 2026 docs. You can indeed be using several of those directly through OpenRouter.

Capability	OpenRouter today	Wokey docs I found	Migration impact
Embeddings	✅ Dedicated /api/v1/embeddings	❓ Not confirmed	Gap
Reranking	✅ Dedicated rerank API/models	❓ Not confirmed	Gap
Speech-to-text	✅ /api/v1/audio/transcriptions	❓ Not confirmed	Gap
Text-to-speech	✅ /api/v1/audio/speech	❓ Not confirmed	Gap
Moderation / safety	✅ Safety models + Guardrails	❓ Not equivalent/documented	Gap
OCR / PDF processing	✅ PDF OCR via mistral-ocr	❓ Not confirmed	Gap
Batch inference	✅ /api/beta/batches	❓ Not confirmed	Gap
Fine-tuning	❌ I still don't find a general OpenRouter fine-tuning service	❌ Not found	No loss
Vector database	❌ OpenRouter isn't a vector DB	❌	No loss
Dedicated deployment	⚠️ Private Models/enterprise options exist, but not a general GPU deployment platform	❌ not equivalent	Depends on your usage

So a full OpenRouter → Wokey replacement would currently break important parts of your API offering if you're using these OpenRouter endpoints.

Embeddings — definitely OpenRouter

OpenRouter has a proper OpenAI-compatible endpoint:

http
POST https://openrouter.ai/api/v1/embeddings

and models such as:

openai/text-embedding-3-small
openai/text-embedding-3-large

OpenRouter currently lists text-embedding-3-small around $0.02/M tokens and routes embedding traffic just like other inference traffic. 
OpenRouter
+1

So my earlier:

Embeddings — not confirmed

was only correct for Wokey, not OpenRouter.

If your platform currently does:

AhuraCloud Embeddings API
        ↓
OpenRouter /embeddings

then changing only:

baseURL = Wokey

is not something I can currently verify will work.

Reranking — OpenRouter now has this too

This one is very clear.

OpenRouter currently exposes dedicated rerank functionality and models including:

cohere/rerank-v3.5
cohere/rerank-4-fast
...

For example, Cohere Rerank v3.5 is currently listed at:

$0.001/search

and OpenRouter describes an API where you pass:

query
+
documents[]

and receive relevance-ranked documents. 
OpenRouter
+1

So:

AhuraCloud
  ↓
Rerank API
  ↓
OpenRouter
  ↓
Cohere / NVIDIA / etc.

is a real OpenRouter service.

I haven't found an equivalent documented Wokey rerank endpoint.

Speech-to-text — definitely OpenRouter

OpenRouter added a dedicated transcription API:

http
POST /api/v1/audio/transcriptions

in 2026.

Models include Whisper and newer transcription models. 
OpenRouter
+1

For example:

audio
 ↓
OpenRouter
 ↓
Whisper / GPT Transcribe / Voxtral
 ↓
text

And the same OpenRouter key/billing system is used.

That's potentially a major migration blocker if your cloud currently exposes STT through OpenRouter.

TTS — definitely OpenRouter

OpenRouter also has:

http
POST /api/v1/audio/speech

for text-to-speech.

They specifically say the endpoint can route speech models from providers including OpenAI, Google and Mistral. 
OpenRouter

Its current TTS catalog includes models such as Gemini TTS and Kokoro. 
OpenRouter

So:

text
 ↓
OpenRouter /audio/speech
 ↓
TTS model
 ↓
MP3 / PCM

is absolutely part of OpenRouter now.

Again, I haven't verified that Wokey offers the equivalent.

OCR — yes, OpenRouter effectively provides OCR

It's not simply called:

POST /ocr

but OpenRouter has Universal PDF Support, including scanned/image PDFs.

Their PDF processing system supports:

mistral-ocr

at:

$2 / 1,000 pages

and a free:

pdf-text

parser for text-only PDFs. 
OpenRouter

So if your current OCR workflow is:

PDF
 ↓
OpenRouter
 ↓
mistral-ocr
 ↓
text + images
 ↓
LLM

Wokey currently appears to have a feature gap there.

Important distinction:

Vision isn't the same as OCR.

Wokey can route multimodal models that may read an image, but that doesn't automatically give you a dedicated OCR/PDF-processing service with predictable page pricing.

Batch — OpenRouter has a real Batch API

This one I can also confirm.

OpenRouter supports:

http
POST /api/beta/batches
GET /api/beta/batches/:id

with asynchronous processing.

For example:

10,000 requests
      ↓
POST /api/beta/batches
      ↓
batch ID
      ↓
async processing
      ↓
poll
      ↓
results

It supports request shapes including:

/v1/chat/completions
/v1/responses
/v1/messages

and OpenRouter currently has batch-specific model variants. 
OpenRouter

I haven't found a corresponding general Wokey batch inference API.

Moderation is slightly more complicated

OpenRouter has two different safety mechanisms.

1. Moderation/safety models

Models such as:

meta-llama/llama-guard-4
openai/gpt-oss-safeguard-20b

can classify inputs or outputs for safety. 
OpenRouter
+1

So you can build:

user prompt
    ↓
safeguard model
    ↓
safe / unsafe
2. OpenRouter Guardrails

This is now significantly broader.

OpenRouter's workspace Guardrails support:

prompt-injection detection

PII detection

PII redaction

PII blocking

model restrictions

provider restrictions

ZDR enforcement

budgets

and can be assigned at API-key/workspace level. 
OpenRouter

So if your cloud relies on OpenRouter Guardrails, that's not something I'd assume Wokey replaces merely because Wokey accepts the same chat request format.

Fine-tuning: different story

Here my original statement still stands.

I do not find OpenRouter acting as a general:

upload training dataset
 ↓
start fine-tuning job
 ↓
train
 ↓
deploy custom checkpoint

platform.

OpenRouter may route access to private/custom models for enterprise customers, but that's different from providing a broad fine-tuning platform.

So if you already have fine-tuning in your AI cloud, that probably comes from your own backend / Runpod / direct providers, rather than OpenRouter.

Vector database: also not OpenRouter

Likewise, OpenRouter gives you:

embedding generation

but not:

vector storage
indexing
namespaces
metadata filtering
ANN search
collections

Those are different layers.

Typically:

OpenRouter
    ↓
embedding vector
    ↓
your vector DB
Postgres pgvector / Qdrant / Pinecone / etc.

So Wokey missing a vector DB isn't really a disadvantage relative to OpenRouter.

Dedicated deployments

This also needs nuance.

OpenRouter now mentions Private Models for Enterprise, and has enterprise/provider controls. 
OpenRouter

But OpenRouter still isn't equivalent to:

Runpod
Together Dedicated Endpoints
Fireworks Dedicated Deployment
your Kubernetes GPU cluster

where you provision:

GPU
replicas
VRAM
autoscaling
checkpoint
container

So if by “Dedicated Deployments” your cloud means actual dedicated model-serving infrastructure, that's likely not coming from standard OpenRouter either.

More importantly: OpenRouter has grown a lot

This is where my previous comparison underestimated it.

OpenRouter's current API is no longer simply:

Chat models

Its own 2026 documentation describes one base API covering:

                     OpenRouter

Chat / Responses ────────────────┐
                                 │
Vision input ────────────────────┤
                                 │
PDF / OCR ───────────────────────┤
                                 │
Audio input ─────────────────────┤
                                 │
Image generation ────────────────┤
                                 ├── one key
Video generation ────────────────┤   one billing layer
                                 │   provider routing
Embeddings ──────────────────────┤
                                 │
Reranking ───────────────────────┤
                                 │
Text-to-Speech ──────────────────┤
                                 │
Speech-to-Text ──────────────────┘

OpenRouter itself describes dedicated endpoints for images, videos, speech, transcription and embeddings, alongside multimodal chat. 
OpenRouter

And now reranking exists too.

So OpenRouter in August 2026 is significantly closer to a general AI inference gateway than it used to be.

Therefore my Wokey recommendation changes somewhat

Originally I said:

integrate Wokey and potentially make it the cheap primary route.

After checking all these OpenRouter capabilities, I'd make the architecture more selective.

Don't do:

OPENROUTER
    ↓
replace baseURL
    ↓
WOKEY

because that assumes endpoint parity.

Instead:

                    Your AI Gateway
                           │
       ┌───────────────────┼──────────────────────┐
       │                   │                      │
       ▼                   ▼                      ▼
     Wokey             OpenRouter           Your infra
       │                   │                      │
       │                   │                      │
 Chat/LLM              Embeddings             Vector DB
 cheap Claude          Rerank                 Fine tuning
 cheap GPT             STT                    GPU deployments
 Images (?)            TTS
 Video (?)             OCR/PDF
                       Batch
                       Guardrails

And possibly overlap where both work:

CHAT:

Your router
   │
   ├── Wokey        ← cheapest
   │
   ├── OpenRouter   ← fallback
   │
   └── direct       ← final fallback

while:

EMBEDDINGS:
Your API → OpenRouter

RERANK:
Your API → OpenRouter

STT:
Your API → OpenRouter

TTS:
Your API → OpenRouter

OCR:
Your API → OpenRouter

BATCH:
Your API → OpenRouter

until Wokey documents compatible replacements.

This changes the cost calculation too

You shouldn't compare your entire OpenRouter monthly bill against Wokey.

We need to split your OpenRouter consumption by service:

OpenRouter monthly spend
        │
        ├── LLM/chat              $X
        ├── Embeddings            $X
        ├── Rerank                $X
        ├── STT                   $X
        ├── TTS                   $X
        ├── Image                 $X
        ├── Video                 $X
        ├── PDF/OCR               $X
        └── Batch                 $X

Then identify only the Wokey-replaceable portion.

For example, suppose your OpenRouter cost is:

Workload	Monthly
Chat/LLMs	$10,000
Embeddings	$600
Rerank	$500
STT	$1,000
TTS	$800
OCR	$500
Image/video	$2,000
Total	$15,400

If Wokey can safely replace only $10k of chat traffic, you compare savings against $10k, not $15.4k.

And if Wokey eventually supports image/video compatibly, that replacement pool becomes larger.

So yes: you caught an important issue.

OpenRouter currently provides Embeddings, Reranking, STT, TTS, OCR/PDF processing, Batch, moderation/safety models and substantial guardrail functionality. 
OpenRouter
+5
OpenRouter
+5
OpenRouter
+5

I have not yet found equivalent documented Wokey APIs for several of those, so a complete switch would be premature.

For your cloud, the more sensible next comparison is endpoint-by-endpoint OpenRouter vs Wokey, including exact request compatibility and prices. That will tell us precisely what percentage of OpenRouter you can replace rather than guessing from model pricing alone.
