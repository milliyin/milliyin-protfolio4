---
title: "Inside the Proxy Economy: Engineering Web Data at Scale"
description: A DevOps case study exploring the hidden infrastructure behind web data pipelines, from fragile scripts to reliable distributed systems with queues, idempotency, observability, and cost controls.
createdAt: 2026-11-14
updatedAt: 2026-11-14
category: DevOps & Data Engineering
readingTime: 18 min read
tags:
  - DevOps
  - Distributed Systems
  - Data Engineering
  - Proxies
  - Reliability
---

The first 50 jobs finish so smoothly that the script feels production-ready.

At 200, responses slow down. Around 400, `429 Too Many Requests` starts appearing. Keep pushing and the same network may receive `403 Forbidden`, challenges, or a temporary block. What looked like a download loop has become an operations problem.

That moment is frustrating because the code still works. The parser is fine. The IDs are valid. The failure lives between requests: pacing, shared state, retries, identity, storage, cost, and the target service's right to protect itself.

This case study follows the path from a naive one-machine collector to a reliable distributed pipeline. It uses video and transcript collection as a concrete example, but the architecture applies to any **authorized** workload that calls a rate-limited upstream service.

> **Scope and ethics:** Only collect data you are authorized to access. Prefer official APIs, honor terms, access controls, `robots.txt`, quotas, copyright, and privacy requirements. A proxy is a routing component, not permission to bypass a refusal.

## Chapter 1: Hitting the Wall

Imagine an AI dataset job that needs metadata or transcripts for 10,000 videos. A single loop begins from one machine and one public IP.

The exact thresholds vary by service, account, geography, request cost, and history, but the failure pattern is familiar:

- The first batch looks healthy because the request rate is low.
- Latency rises as throttling or queueing begins upstream.
- `429` responses indicate that the client should slow down.
- Repeated forbidden responses or challenges show that access policy, reputation, or behavior needs review.
- Continuing blindly can affect the whole network, including ordinary browser traffic from the same IP. On a home connection such as Jio Wi-Fi, that can mean challenges appearing later during normal Chrome browsing too.

```d2
direction: down
*.style.border-radius: 10
*.style.stroke-width: 2
*.style.font-size: 17

flow: "RATE-LIMIT ESCALATION" {
  grid-columns: 2
  style.fill: "#f8fafc"
  style.stroke: "#cbd5e1"
  style.font-color: "#334155"
  style.stroke-width: 1
  start: "50 JOBS\nLooks healthy" {
    style.fill: "#ecfdf5"
    style.stroke: "#16a34a"
    style.font-color: "#14532d"
  }
  slow: "200 JOBS\nLatency climbs" {
    style.fill: "#eff6ff"
    style.stroke: "#2563eb"
    style.font-color: "#1e3a8a"
  }
  limit: "400 JOBS\nHTTP 429" {
    style.fill: "#fff7ed"
    style.stroke: "#ea580c"
    style.font-color: "#7c2d12"
  }
  blocked: "800 JOBS\n403 or challenge" {
    style.fill: "#fef2f2"
    style.stroke: "#dc2626"
    style.font-color: "#7f1d1d"
  }
  decision: "STOP AND RE-DESIGN\nRespect policy + control load" {
    style.fill: "#fefce8"
    style.stroke: "#ca8a04"
    style.font-color: "#713f12"
  }
}

flow.start -> flow.slow: more concurrency
flow.slow -> flow.limit: predictable traffic
flow.limit -> flow.blocked: blind retries
flow.blocked -> flow.decision: protect the system
```

The wall is not evidence that the server is broken. It is feedback. A production client must treat upstream capacity and policy as constraints, not obstacles to brute-force through.

## Chapter 2: Engineering, Not System Hacks

Scraping at scale is not a bag of header tricks. It is distributed data engineering.

The useful comparison is a ticketing system during a demand spike, such as an IRCTC Tatkal rush: requests arrive faster than they can safely be processed, so the system needs admission control, queues, workers, retries, durable state, and honest limits. Proxies may become one network-routing layer, but they do not replace architecture.

```d2
direction: down
*.style.border-radius: 8
*.style.stroke-width: 2
*.style.font-size: 18

script: "FRAGILE SCRIPT\nOne program does everything\nA single failure stops the job" {
  width: 420
  style.fill: "#fef2f2"
  style.stroke: "#dc2626"
  style.font-color: "#7f1d1d"
}

control: "1  CONTROL THE TRAFFIC\nCheck permission\nSlow requests when needed" {
  width: 420
  style.fill: "#fefce8"
  style.stroke: "#ca8a04"
  style.font-color: "#713f12"
}

process: "2  PROCESS JOBS SAFELY\nJobs wait in a queue\nWorkers take one at a time" {
  width: 420
  style.fill: "#eff6ff"
  style.stroke: "#2563eb"
  style.font-color: "#1e3a8a"
}

store: "3  SAVE THE RESULT\nStore files and job status\nA retry will not create duplicates" {
  width: 420
  style.fill: "#ecfdf5"
  style.stroke: "#16a34a"
  style.font-color: "#14532d"
}

script -> control: add rules
control -> process: approved work
process -> store: completed result
```

Reliable pipelines come from network design, error handling, state management, observability, and legal clarity. The goal is not to make a client invisible. The goal is to make its behavior controlled, explainable, and recoverable.

## Chapter 3: Version Zero, the Naive Scraper

Version zero usually looks harmless:

```text
for item_id in item_ids:
    try:
        collect(item_id)
    except Exception:
        pass
```

It runs sequentially, one request at a time. Low traffic may hide its weaknesses, but the design has no durable job state, no error taxonomy, and no distinction between a network dropout and a permanent refusal.

It is also mechanically predictable: the same network origin, the same client stack, the same sequence, and often the same interval between calls. Adding more threads only makes that predictability arrive faster.

Worst of all, `except: pass` destroys the evidence needed to recover. The pipeline cannot answer which jobs failed, why they failed, whether they are safe to retry, or whether an output is complete.

> A script that cannot explain failure is not ready to scale. Before adding workers, make one job observable and resumable.

## Chapter 4: The Four Missing Pieces

Four controls turn a loop into a client that can cooperate with an upstream system:

1. **Exponential backoff:** wait progressively longer after retryable failures.
2. **Error taxonomy:** separate temporary transport failures, throttling, permanent absence, and authorization refusal.
3. **Pacing and jitter:** prevent synchronized workers from retrying at the same instant.
4. **Identity and session state:** keep legitimate sessions internally consistent and avoid routing every job through one overloaded path.

These controls belong together. Backoff without classification retries permanent failures. Jitter without a global limit still permits the fleet to exceed its budget. Multiple egress paths without session ownership can break continuity.

## Chapter 5: What the Server Can See

A proxy changes the source network address seen by the destination. It does not erase the rest of the connection.

Defensive systems can combine several signal families:

```d2
direction: down
*.style.border-radius: 10
*.style.stroke-width: 2
*.style.font-size: 17

request: "INCOMING REQUEST" {
  style.fill: "#f8fafc"
  style.stroke: "#475569"
}

signals: "MULTI-LAYER SIGNALS" {
  ip: "1  NETWORK\nIP / ASN reputation\nGeography / velocity" {
    style.fill: "#eff6ff"
    style.stroke: "#2563eb"
  }
  tls: "2  TLS / TRANSPORT\nJA3 or JA4 family\nProtocol characteristics" {
    style.fill: "#fff7ed"
    style.stroke: "#ea580c"
  }
  http: "3  APPLICATION\nHeaders / cookies\nClient consistency" {
    style.fill: "#ecfdf5"
    style.stroke: "#16a34a"
  }
  behavior: "4  BEHAVIOR\nTiming / sequence\nSession history" {
    style.fill: "#fff1f2"
    style.stroke: "#e11d48"
  }
  style.fill: "#ffffff"
  style.stroke: "#cbd5e1"
}

policy: "POLICY DECISION\nAllow / throttle / challenge / deny" {
  style.fill: "#fefce8"
  style.stroke: "#ca8a04"
  style.font-color: "#713f12"
}

request -> signals.ip
request -> signals.tls
request -> signals.http
request -> signals.behavior
signals.behavior -> policy: combined risk
```

### Layer 1: Network reputation

IP reputation can include the network owner, ASN, region, previous abuse, request velocity, and how many identities appear behind one address. Datacenter ranges such as major cloud providers are easy to classify. Consumer ISP space such as Jio or Airtel may carry different baseline reputation, but no provider or address type is automatically authorized or trustworthy.

### Layer 2: TLS fingerprints

JA3 hashes selected fields from a TLS `ClientHello`. JA4 was designed to remain more stable when modern browsers randomize extension order and adds useful dimensions such as ALPN. The broader JA4+ family includes fingerprints for other protocols, including HTTP.

The operational lesson is not "copy a browser fingerprint." It is that inconsistent layers are visible. A request claiming one client identity while its transport and behavior tell a different story can be treated as higher risk.

### Layer 3: Application headers

Browsers and SDKs differ in header sets, ordering behavior, cookies, compression support, and protocol use. Randomly changing a `User-Agent` string does not transform one client implementation into another.

### Layer 4: Behavior

Machines often traverse sequential IDs, hit exact periodic intervals, and create sharp concurrency spikes. Human traffic tends to follow relationships and contains natural variance. Platforms can evaluate those patterns across sessions, not only one request.

## Chapter 6: JA3, JA4, and JA4+ Without the Hype

The screenshot's core idea is right: transport fingerprinting is one detection layer, and behavior adds more context. The naming deserves precision:

- **JA3** focuses on ordered TLS ClientHello properties and can become unstable when extension order changes.
- **JA4** is a newer TLS client fingerprint designed to handle modern protocol behavior more consistently, including extension randomization and QUIC-related identification.
- **JA4+** is a family of fingerprints for multiple protocols. It is not one magic score for every behavior.
- **Inter-request signals** are separate behavioral features computed across traffic over time.

This matters to DevOps teams on both sides. Defenders should avoid blocking a fingerprint with no context because browser and OS updates change legitimate traffic. Client teams should stop assuming that one header or one IP defines an identity.

## Chapter 7: The Proxy Fallacy

Buying a larger proxy pool only changes Layer 1. If the transport, HTTP client, session behavior, or request rate is inconsistent, the remaining signals still exist.

```d2
direction: down
*.style.border-radius: 10
*.style.stroke-width: 2
*.style.font-size: 17

client: "COLLECTOR" {
  style.fill: "#f8fafc"
  style.stroke: "#475569"
}

proxy: "PROXY\nChanges network route" {
  style.fill: "#eff6ff"
  style.stroke: "#2563eb"
  style.font-color: "#1e3a8a"
}

remaining: "SIGNALS THAT REMAIN" {
  tls: "TLS / transport"
  headers: "HTTP consistency"
  behavior: "Timing + sequence"
  session: "Session continuity"
  style.fill: "#fff7ed"
  style.stroke: "#ea580c"
  style.font-color: "#7c2d12"
}

governance: "SUSTAINABLE ACCESS\nPermission + quotas\nRate control + observability" {
  style.fill: "#ecfdf5"
  style.stroke: "#16a34a"
  style.font-color: "#14532d"
}

client -> proxy: route
proxy -> remaining.tls: request continues
remaining.behavior -> governance: architecture wins
```

> A proxy is a tool, not a magic switch. If a service says no, changing the route does not turn that refusal into permission.

## Chapter 8: Proxy Types and Their Trade-Offs

When a workload is authorized to use proxies, selection is an infrastructure decision:

### Datacenter proxies

They are fast, inexpensive, and operationally simple. Their address ranges are also easy to classify. They fit high-volume, low-sensitivity services where the provider explicitly permits automated access and cost matters most.

### Static ISP proxies

They use ISP-assigned address space with a stable endpoint. Stability can support long-lived sessions, but the product is usually more expensive and provider quality matters.

### Rotating residential proxies

They route through changing consumer-network addresses and are commonly billed per transferred gigabyte. They can be costly for media workloads and create serious sourcing, consent, privacy, and compliance questions. Use only reputable providers that can document how endpoints are obtained and permitted.

The practical selection framework is:

- **High volume, low sensitivity, explicit automation support:** favor datacenter capacity.
- **Session continuity and stable network identity:** consider a dedicated static endpoint.
- **Geo-specific authorized testing:** use the narrowest compliant regional product available.
- **Large media transfer:** dedicated capacity may avoid shared-IP reputation and per-GB surprises.

Price is only one axis. Add trust requirements, session duration, geography, provider ethics, failure rate, and bandwidth billing before choosing.

## Chapter 9: Rotation Is Not Capacity

Round-robin rotation spreads requests, but it does not create unlimited safe throughput. An address that is selected every few seconds never gets a chance to cool down.

```d2
direction: down
*.style.border-radius: 10
*.style.stroke-width: 2
*.style.font-size: 17

ready: "READY POOL\nEligible endpoints" {
  style.fill: "#ecfdf5"
  style.stroke: "#16a34a"
  style.font-color: "#14532d"
}

active: "ACTIVE\nOwns one bounded session" {
  style.fill: "#eff6ff"
  style.stroke: "#2563eb"
  style.font-color: "#1e3a8a"
}

cooling: "COOLING\nNo new work\nTimer running" {
  style.fill: "#fff7ed"
  style.stroke: "#ea580c"
  style.font-color: "#7c2d12"
}

probe: "PROBE\nOne low-cost health check" {
  style.fill: "#fefce8"
  style.stroke: "#ca8a04"
  style.font-color: "#713f12"
}

ready -> active: lease
active -> cooling: session ends
cooling -> probe: cooldown expires
probe -> ready: healthy
probe -> cooling: still limited
```

A useful planning model is:

```text
effective capacity = pool size x busy_time / (busy_time + cooldown_time)
```

This is not a promise of allowed throughput. The upstream quota remains the real ceiling. The formula only shows why a pool of 100 endpoints does not behave like 100 continuously available workers.

## Chapter 10: The Sticky Session Rule

Do not change network identity halfway through one logical session unless the upstream protocol explicitly supports it.

For segmented media, one playback or download session suddenly arriving from several cities can look broken or risky. It can also invalidate cookies, signed URLs, affinity, and audit trails.

```d2
direction: down
*.style.border-radius: 10
*.style.stroke-width: 2
*.style.font-size: 17

scheduler: "JOB SCHEDULER" {
  style.fill: "#f8fafc"
  style.stroke: "#475569"
}

videoA: "VIDEO A SESSION\nEndpoint A leased" {
  a1: "Segment 1"
  a2: "Segment 2"
  a3: "Segment 3"
  style.fill: "#eff6ff"
  style.stroke: "#2563eb"
}

videoB: "VIDEO B SESSION\nEndpoint B leased" {
  b1: "Segment 1"
  b2: "Segment 2"
  b3: "Segment 3"
  style.fill: "#fff7ed"
  style.stroke: "#ea580c"
}

release: "RELEASE LEASE\nRotate between jobs" {
  style.fill: "#ecfdf5"
  style.stroke: "#16a34a"
  style.font-color: "#14532d"
}

scheduler -> videoA: assign A
scheduler -> videoB: assign B
videoA.a3 -> release: complete
videoB.b3 -> release: complete
```

The rule is simple: rotate between independent jobs, not between segments of the same job. A worker should acquire a lease, preserve session state, finish or fail clearly, then release the lease.

## Chapter 11: Architecture V1, One Machine Done Properly

Do not jump to Kubernetes before one machine is reliable.

Version one can run on a single host with four durable components:

```d2
direction: down
*.style.border-radius: 10
*.style.stroke-width: 2
*.style.font-size: 17

jobs: "POSTGRES JOB TABLE\npending / in_progress\nretryable / terminal" {
  style.fill: "#eff6ff"
  style.stroke: "#2563eb"
  style.font-color: "#1e3a8a"
}

pool: "FIXED WORKER POOL\nBounded concurrency\nEnvironment-tuned" {
  style.fill: "#fff7ed"
  style.stroke: "#ea580c"
  style.font-color: "#7c2d12"
}

objects: "S3 / R2 OBJECT STORE\nImmutable raw files\nNo local-disk dependency" {
  style.fill: "#ecfdf5"
  style.stroke: "#16a34a"
  style.font-color: "#14532d"
}

metrics: "METRICS + LOGS\nAttempts / latency\nBytes / outcomes" {
  style.fill: "#fefce8"
  style.stroke: "#ca8a04"
  style.font-color: "#713f12"
}

jobs -> pool: claim job
pool -> objects: stream output
pool -> jobs: persist result
pool -> metrics: emit telemetry
```

The job table is the source of truth. A crash leaves enough state to resume. Fixed concurrency prevents accidental overload. Large artifacts stream directly to object storage instead of filling the server disk.

This design may be enough for many workloads. Distribution should solve a measured capacity or availability problem, not satisfy an architecture diagram.

## Chapter 12: Smart Error Classification

Every failure needs a policy, not a generic retry:

- **`429 Too Many Requests`:** honor `Retry-After` when present, apply capped exponential backoff with jitter, and reduce admission rate.
- **`403 Forbidden`:** do not automatically repeat through another route. Pause the job, verify authorization and credentials, and quarantine the workflow if policy is unclear.
- **`404 Not Found` or `410 Gone`:** mark terminal with a reason unless the domain guarantees eventual creation.
- **Network timeout or reset:** retry a bounded number of times with backoff because the outcome may be transient.
- **`5xx`:** retry cautiously within a budget; the dependency may already be overloaded.
- **Parser or schema error:** preserve the raw input, alert on version drift, and avoid re-downloading until processing code is fixed.

```d2
direction: down
*.style.border-radius: 10
*.style.stroke-width: 2
*.style.font-size: 17

failure: "FAILED ATTEMPT" {
  style.fill: "#f8fafc"
  style.stroke: "#475569"
}

classify: "CLASSIFY\nStatus + exception\nPolicy + attempt count" {
  style.fill: "#eff6ff"
  style.stroke: "#2563eb"
}

retry: "RETRY LATER\n429 / timeout / selected 5xx\nBackoff + jitter" {
  style.fill: "#fff7ed"
  style.stroke: "#ea580c"
}

terminal: "TERMINAL\n404 / 410\nRecord reason" {
  style.fill: "#ecfdf5"
  style.stroke: "#16a34a"
}

review: "HUMAN REVIEW\n403 / policy ambiguity\nStop automatic access" {
  style.fill: "#fff1f2"
  style.stroke: "#e11d48"
}

failure -> classify
classify -> retry: transient
classify -> terminal: permanent
classify -> review: authorization
```

Jitter matters because identical workers otherwise wake together and create a retry storm. Retries must also have a maximum attempt count, a time budget, and a dead-letter path.

## Chapter 13: Architecture V2, a Distributed Fleet

When one host is genuinely the bottleneck, split scheduling from execution.

```d2
direction: down
*.style.border-radius: 10
*.style.stroke-width: 2
*.style.font-size: 17

api: "JOB PRODUCERS\nValidated manifests" {
  style.fill: "#f8fafc"
  style.stroke: "#475569"
}

governor: "SHARED TRAFFIC LIMIT\nPermission + request budget\nControls every worker" {
  style.fill: "#fefce8"
  style.stroke: "#ca8a04"
  style.font-color: "#713f12"
}

queues: "WAITING LINES - REDIS + BULLMQ" {
  high: "New and important jobs"
  retry: "Jobs waiting to retry"
  dead: "Jobs needing review"
  style.fill: "#eff6ff"
  style.stroke: "#2563eb"
}

fleet: "WORKER CONTAINERS" {
  w1: "Worker pod A"
  w2: "Worker pod B"
  w3: "Worker pod N"
  style.fill: "#fff7ed"
  style.stroke: "#ea580c"
}

data: "SAVED RESULTS" {
  db: "Postgres job status"
  s3: "S3 / R2 files"
  style.fill: "#ecfdf5"
  style.stroke: "#16a34a"
}

api -> governor: submit
governor -> queues.high: admit safely
queues.high -> fleet.w1: lease
queues.retry -> fleet.w2: retry when due
fleet.w1 -> data.db: save status
fleet.w2 -> data.s3: save file
fleet.w2 -> queues.retry: retryable failure
fleet.w3 -> queues.dead: terminal / exhausted
```

Use separate delayed-retry and active-work paths so a retry storm cannot starve fresh jobs. Workers remain stateless and scale horizontally from queue depth, but autoscaling must stay behind the global governor. Otherwise, adding pods only multiplies the upstream burst.

Postgres stores operational metadata; object storage holds heavy files. Redis coordinates ephemeral queue and rate state, not irreplaceable artifacts.

## Chapter 14: Idempotency and Global Rate Limits

Distributed queues can deliver a job more than once, especially when a worker loses its lock after completing external work but before acknowledging the message. Design for at-least-once execution.

Before processing, derive a stable idempotency key from the source item, requested format, and pipeline version. Check whether a valid artifact and completion record already exist. If they do, acknowledge the duplicate instead of downloading again.

A shared Redis token bucket can govern the entire fleet:

```text
worker may start only when:
global token available
AND tenant budget available
AND endpoint lease available
AND circuit breaker closed
```

This prevents 20 workers from each believing they own the full request allowance. Managed proxy services can own address lifecycle and routing, but application-level admission control still belongs to the pipeline.

## Chapter 15: Build the Proxy Manager as a State Machine

Treat each endpoint as a stateful resource governed by a circuit breaker.

```d2
direction: down
*.style.border-radius: 10
*.style.stroke-width: 2
*.style.font-size: 17

active: "READY\nHealthy and available" {
  style.fill: "#ecfdf5"
  style.stroke: "#16a34a"
  style.font-color: "#14532d"
}

cooling: "RESTING\nWait before reuse" {
  style.fill: "#fff7ed"
  style.stroke: "#ea580c"
  style.font-color: "#7c2d12"
}

probing: "TESTING\nTry one safe request" {
  style.fill: "#fefce8"
  style.stroke: "#ca8a04"
  style.font-color: "#713f12"
}

quarantine: "NEEDS REVIEW\nRepeated failure or refusal\nDo not use automatically" {
  style.fill: "#fff1f2"
  style.stroke: "#e11d48"
  style.font-color: "#881337"
}

dead: "REMOVED\nNo longer used" {
  style.fill: "#f1f5f9"
  style.stroke: "#64748b"
  style.font-color: "#334155"
}

active -> cooling: too many failures
cooling -> probing: wait ends
probing -> active: test succeeds
probing -> quarantine: test fails
quarantine -> active: approved again
quarantine -> dead: exhausted / revoked
```

Health checks should reflect the authorized target and actual protocol, not merely prove that a generic website is reachable. A proxy that can reach a test endpoint may still fail DNS, TLS, geography, authentication, or policy checks for the real dependency.

Expose Prometheus-style metrics for success rate, latency, bytes, active leases, cooldowns, response classes, and state transitions. Logs should connect `job_id`, `attempt_id`, `worker_id`, and `endpoint_id` without recording secrets.

## Chapter 16: A Self-Healing Pool

A healthy pool adapts without hiding failure.

- Track rolling success rate and latency per endpoint, such as the last 50 authorized calls.
- Prefer healthy endpoints while still sending a small amount of probe traffic to marginal ones.
- A sample policy might route 80% to proven endpoints and 20% to recovery candidates, but tune it from evidence.
- Open a pool-level circuit breaker when aggregate success drops below a threshold, such as 50%.
- Pause the whole pipeline when the failure is likely application-wide rather than sacrificing every endpoint to the same bug.

The pool-level breaker is crucial. If a bad release sends malformed requests, rotating faster burns the entire fleet. Stopping is often the most reliable action a system can take.

## Chapter 17: Bandwidth Is an Architecture Decision

For speech or NLP work, downloading full video is usually the most expensive way to obtain audio or text.

Illustrative sizes from the case study are:

- A 10-minute 1080p video may be around **300 MB**.
- An audio-only Opus stream may be around **8 MB**.
- A transcript may be around **50 KB**.

Actual sizes vary by codec, bitrate, duration, and caption availability, but the order-of-magnitude difference is the point. Selecting audio or text instead of video can reduce transfer by well over 95% for the right workload.

The intuition is similar to listening to music on Wynk instead of streaming a 4K video on Hotstar when all you need is audio. Format selection is therefore the strongest cost-control lever. Do not optimize proxy pricing while moving 30 times more data than the model needs.

## Chapter 18: Budget the Pipeline Before Running It

Suppose planning uses a conservative average of 12 MB of audio per item:

```text
10,000 items x 12 MB = about 120 GB
120 GB x 1.15 retry factor = about 138 GB transferred
```

That 15% retry allowance covers transient failures and partial attempts; it is a budget, not permission to retry forever.

Compare the complete cost model:

- Per-GB proxy plans scale linearly and work well for low or uncertain volume.
- Dedicated per-endpoint plans can become cheaper at sustained high transfer.
- Shared endpoints may carry reputation risk outside your control.
- Object storage charges include operations, retention, and sometimes retrieval or egress.
- Cloudflare R2 currently does not charge direct egress, though storage, operations, retrieval classes, and connected services can still cost money.

Track bytes by source, format, attempt, and final artifact. Without that telemetry, retry overhead and accidental video downloads remain invisible until the bill arrives.

## Chapter 19: The AI Dataset Processing Pipeline

Downloading is only the first stage. Keep acquisition separate from transformation so processing bugs do not trigger expensive network work again.

```d2
direction: down
*.style.border-radius: 10
*.style.stroke-width: 2
*.style.font-size: 17

flow: "FROM RAW FILES TO AN AI DATASET" {
  grid-columns: 2
  style.fill: "#f8fafc"
  style.stroke: "#cbd5e1"
  style.font-color: "#334155"
  style.stroke-width: 1
  manifest: "APPROVED JOB LIST\nSource + permission\nFile type needed" {
    style.fill: "#fefce8"
    style.stroke: "#ca8a04"
    style.font-color: "#713f12"
  }
  raw: "1  KEEP THE ORIGINAL\nNever change the raw file\nStore in S3 / R2" {
    style.fill: "#eff6ff"
    style.stroke: "#2563eb"
    style.font-color: "#1e3a8a"
  }
  normalize: "2  PREPARE THE AUDIO\nConvert to 16 kHz mono WAV\nRecord file details" {
    style.fill: "#fff7ed"
    style.stroke: "#ea580c"
    style.font-color: "#7c2d12"
  }
  extract: "3  CREATE THE TEXT\nUse captions or approved\nspeech-to-text" {
    style.fill: "#fff1f2"
    style.stroke: "#e11d48"
    style.font-color: "#881337"
  }
  dataset: "READY DATASET\nText + source history\nQuality checks" {
    style.fill: "#ecfdf5"
    style.stroke: "#16a34a"
    style.font-color: "#14532d"
  }
}

flow.manifest -> flow.raw: download once
flow.raw -> flow.normalize: prepare
flow.normalize -> flow.extract: turn into text
flow.extract -> flow.dataset: check and save
```

Stage 1 keeps original downloaded files immutable. Stage 2 converts approved audio to a standard format such as 16 kHz mono WAV. Stage 3 uses existing captions where permitted or runs an approved speech-recognition model. Every stage writes its own status and artifact checksum.

Decoupling means a normalization or transcription bug can be fixed and replayed from raw storage without paying to reacquire data. It also creates lineage: every dataset row can point back to its authorized source, processing version, and quality checks.

## Chapter 20: The Production Checklist

Before scaling, verify the following:

- Written authorization, terms, privacy, copyright, and retention requirements are clear.
- Official APIs and bulk export paths were evaluated first.
- The job model has durable states, attempt history, and terminal reasons.
- Every retryable operation is idempotent and bounded.
- `429`, `403`, `404`, `410`, timeouts, `5xx`, and parser failures have different policies.
- Global and tenant-level rate limits exist outside individual workers.
- Concurrency and autoscaling cannot exceed the admission budget.
- Session-scoped work keeps one leased network identity until completion.
- Proxy providers can document endpoint sourcing, consent, and acceptable use.
- Raw artifacts are immutable; transformations are replayable and versioned.
- Metrics cover latency, success, response classes, retries, bytes, cost, queue age, and circuit state.
- Pool-level breakers stop fleet-wide damage during upstream incidents or bad releases.
- Operators have a dead-letter queue, runbook, alerts, and a safe kill switch.

## Conclusion

The most important lesson is not which proxy to buy. It is recognizing when a script has become a distributed system.

At small scale, one loop can hide missing state, missing budgets, and missing failure semantics. At larger scale, every omission becomes visible at once. More workers and more IPs amplify the architecture you already have; they do not repair it.

The production path is less dramatic and far more effective: obtain permission, minimize the data, admit work through a global budget, preserve sessions, classify errors, make jobs idempotent, store artifacts durably, observe everything, and stop safely when the system loses confidence.

> **The goal is not to "beat" the upstream service. The goal is to build a pipeline both teams could inspect without surprises.**

## Sources and Further Reading

- [Video source: proxy and scraping architecture case study](https://www.youtube.com/watch?v=Y9VrScEzsb8)
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 6585: HTTP 429 Too Many Requests](https://www.rfc-editor.org/rfc/rfc6585.html)
- [RFC 9309: Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html)
- [AWS: Timeouts, retries, and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- [AWS Well-Architected: Control and limit retry calls](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_mitigate_interaction_failure_limit_retries.html)
- [Cloudflare: JA4 fingerprints and inter-request signals](https://blog.cloudflare.com/ja4-signals/)
- [FoxIO: JA4+ technical documentation](https://github.com/FoxIO-LLC/ja4)
- [BullMQ: Idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs)
- [BullMQ: Queue and worker documentation](https://docs.bullmq.io/)
- [Redis: Token bucket rate limiting](https://redis.io/glossary/rate-limiting/)
- [Cloudflare R2 pricing and egress](https://developers.cloudflare.com/r2/pricing/)
