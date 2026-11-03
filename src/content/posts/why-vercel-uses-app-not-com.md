---
title: Why Vercel Uses .app for Your Projects, Not .com
description: A security case study explaining why Vercel separates its control plane at vercel.com from user deployments at vercel.app.
createdAt: 2026-11-03
updatedAt: 2026-11-03
category: Cloud Security
readingTime: 13 min read
---

Deploy a project on Vercel and it immediately receives a URL like `my-project.vercel.app`. Yet Vercel's dashboard, login, billing, and API live on `vercel.com`.

Why maintain two domains? Why not place every project at `my-project.vercel.com`?

To a developer, that deployment URL feels like a small detail: a link copied at the end of a successful build. To the person opening it, however, the domain is a promise. They expect one stranger's project cannot reach their account, confuse their session, or put every other project at risk. The most effective security architecture is often invisible precisely because nothing frightening happens.

The answer is much more interesting than branding. Vercel runs code supplied by millions of developers. That code is not trusted in the same way as Vercel's own dashboard. Putting both under one registrable domain would weaken several browser security boundaries and increase the blast radius of mistakes, attacks, and abuse.

This case study expands the question through browser security documentation, Vercel's deployment model, and the current Public Suffix List.

> **The central idea:** `vercel.com` is Vercel's trusted control plane. `vercel.app` is the data plane where user-controlled applications run. The domain split creates a deliberate security boundary between them.

## Chapter 1: This Is a Trust Problem

Vercel controls the code on `vercel.com`. It protects user accounts, sessions, API tokens, team settings, deployments, and billing.

The applications under `vercel.app` are different. Anyone can create one, and the application may contain arbitrary HTML, CSS, and JavaScript. Most projects are harmless, but the platform has to design as if one deployment could be malicious.

```d2
direction: down
*.style.border-radius: 8
*.style.stroke-width: 2
*.style.font-size: 18

control: "TRUSTED PLATFORM\nvercel.com" {
  dashboard: Dashboard
  login: "Login + sessions"
  api: "API + billing"
  style.fill: "#eff6ff"
  style.stroke: "#2563eb"
  style.font-color: "#1e3a8a"
}

wall: "SEPARATE REGISTRABLE DOMAINS" {
  style.fill: "#ecfdf5"
  style.stroke: "#16a34a"
  style.font-color: "#14532d"
}

deployments: "USER-CONTROLLED CODE\nvercel.app" {
  alice: alice.vercel.app
  bob: bob.vercel.app
  unknown: "Any developer's JavaScript"
  style.fill: "#fff7ed"
  style.stroke: "#ea580c"
  style.font-color: "#7c2d12"
}

control -> wall: protected by
wall -> deployments: isolates
```

If a malicious application lives at `evil.vercel.app`, it should not be able to interfere with a session on `vercel.com` or with another customer's application at `alice.vercel.app`.

The important question is therefore not “Which domain looks better?” It is “Where should untrusted code be allowed to execute?”

## Chapter 2: Three Ways to Host User Content

A platform has three common choices for user projects. Each creates a different browser security boundary.

```d2
direction: down
*.style.border-radius: 8
*.style.stroke-width: 2
*.style.font-size: 18

path: "1  PATH-BASED\nvercel.com/alice\nSame origin - dashboard exposed" {
  style.fill: "#fef2f2"
  style.stroke: "#dc2626"
  style.font-color: "#7f1d1d"
}

subdomain: "2  SAME-SITE SUBDOMAIN\nalice.vercel.com\nDifferent origin - shared site" {
  style.fill: "#fff7ed"
  style.stroke: "#ea580c"
  style.font-color: "#7c2d12"
}

separate: "3  SEPARATE SITE\nalice.vercel.app\nDifferent origin + different site" {
  style.fill: "#ecfdf5"
  style.stroke: "#16a34a"
  style.font-color: "#14532d"
}

path -> subdomain: origin isolation added
subdomain -> separate: site isolation added
```

| Model | Example | Browser relationship to `vercel.com` | Main risk |
|---|---|---|---|
| Path | `vercel.com/alice` | Same origin | User JavaScript shares the dashboard's strongest browser boundary |
| Subdomain | `alice.vercel.com` | Different origin, same site | Storage is isolated, but cookies and `SameSite` behavior can still cross the site boundary |
| Separate domain | `alice.vercel.app` | Different origin and different site | Cross-site restrictions apply by default |

Path-based hosting would be a complete security failure for arbitrary JavaScript. The user application and dashboard would share an origin, allowing access to the same DOM, local storage, and origin-scoped browser APIs.

A subdomain is better because `alice.vercel.com` and `vercel.com` are different origins. But they are still considered the same **site**, and that distinction matters for cookies and CSRF defenses.

The separate-domain model gives Vercel both a different origin and a different site.

## Chapter 3: Origin and Site Are Not the Same

This is the browser concept that makes the entire design click.

An **origin** is the combination of scheme, hostname, and port:

```text
https://alice.vercel.com:443
  scheme     host       port
```

Change any part and the origin changes. The same-origin policy uses this boundary for DOM access, `localStorage`, IndexedDB, and reading cross-origin responses.

A **site** is broader. In modern schemeful same-site checks, it is based on the scheme plus the registrable domain, also called eTLD+1.

| Pair | Same origin? | Same site? |
|---|---:|---:|
| `alice.vercel.com` and `vercel.com` | No | Yes |
| `alice.vercel.app` and `vercel.com` | No | No |
| `alice.vercel.app` and `bob.vercel.app` | No | No, because `vercel.app` is a public suffix |

The first pair cannot read each other's local storage, but browsers still treat both hosts as part of the `vercel.com` site. That means a defense based only on `SameSite` cookies does not view `alice.vercel.com` as an outside site.

> **Origin protects JavaScript storage and response access. Site controls important cookie behavior. A secure multi-tenant platform needs to reason about both.**

## Chapter 4: The Cookie-Tossing Risk

Consider a hypothetical design where untrusted projects run at `*.vercel.com` and the dashboard uses a session cookie scoped to `vercel.com`.

A page at `evil.vercel.com` cannot read an `HttpOnly` dashboard cookie. But a subdomain may attempt to set another cookie for its parent domain:

```javascript
document.cookie = "session=attacker-value; Domain=vercel.com; Path=/; Secure";
```

The browser may now hold more than one cookie with the same name. It sends matching cookies to the dashboard, but a server can mishandle duplicates or trust the wrong value. Depending on the application's session design, this can contribute to session fixation, overwritten CSRF state, or broken feature flags.

```d2
direction: down
*.style.border-radius: 8
*.style.stroke-width: 2
*.style.font-size: 18

step1: "1  VICTIM OPENS\nevil.vercel.com" {
  style.fill: "#fff7ed"
  style.stroke: "#ea580c"
}

step2: "2  MALICIOUS JAVASCRIPT\nsets Domain=vercel.com" {
  style.fill: "#fef2f2"
  style.stroke: "#dc2626"
  style.font-color: "#7f1d1d"
}

jar: "3  BROWSER COOKIE JAR" {
  valid: "session = victim" {
    style.fill: "#ecfdf5"
    style.stroke: "#16a34a"
  }
  planted: "session = attacker" {
    style.fill: "#fff1f2"
    style.stroke: "#fb7185"
  }
  style.fill: "#f8fafc"
  style.stroke: "#64748b"
}

step4: "4  DASHBOARD RECEIVES BOTH\nServer must reject ambiguity" {
  style.fill: "#eff6ff"
  style.stroke: "#2563eb"
  style.font-color: "#1e3a8a"
}

step1 -> step2: executes
step2 -> jar.planted: plants cookie
jar -> step4: Cookie header
```

This is a simplified threat model, not a claim about a vulnerability in Vercel. Mature applications combine several defenses: host-only cookies, the `__Host-` prefix, CSRF tokens, strict validation, and careful duplicate-cookie handling.

If the server accepts the planted value, the consequences depend on what that cookie controls. A victim could appear inside an attacker's session, add private information to the wrong account, follow links created by the attacker, inherit a poisoned feature flag, or submit a request with an overwritten CSRF value. The attacker does not need to read the victim's original cookie to create trouble; planting a second value can be enough when server-side parsing is ambiguous.

Imagine the human moment behind that failure: someone signs in, sees a familiar dashboard, and trusts what is on the screen. They may upload a private file, connect a repository, or change a setting without realizing the session belongs to someone else. A browser boundary that looks abstract in an architecture diagram can become a very personal breach of confidence.

The cleanest platform defense is to avoid giving untrusted applications a shared cookie parent with the dashboard in the first place. A deployment on `evil.vercel.app` cannot set a cookie for `vercel.com`.

## Chapter 5: SameSite and CSRF

`SameSite=Lax` or `SameSite=Strict` can stop cookies from being sent with many cross-site requests. That is useful protection against cross-site request forgery, but the word **site** is doing the work.

If a malicious project were hosted at `evil.vercel.com`, it would be cross-origin but same-site with the dashboard. A defense that assumes “subdomain means third party” would be wrong.

Move that project to `evil.vercel.app`, and a request to `vercel.com` becomes cross-site. Now `SameSite` restrictions can apply as intended.

```text
evil.vercel.com  -- same-site POST --> vercel.com
evil.vercel.app  -- cross-site POST -> vercel.com
                                     SameSite can block the session cookie
```

`SameSite` is still defense in depth, not a replacement for CSRF tokens, Origin checks, or Fetch Metadata validation. The domain split makes those defenses stronger by restoring the cross-site boundary.

## Chapter 6: Why the Public Suffix List Matters

Separating `vercel.com` from `vercel.app` protects the dashboard, but Vercel also needs to isolate customers from each other.

Normally, two hosts under the same registrable domain are same-site. If the browser treated `vercel.app` like an ordinary company domain, `alice.vercel.app` and `bob.vercel.app` would still share a site boundary.

The [Public Suffix List](https://publicsuffix.org/) fixes this. It tells browsers which domain suffixes are shared boundaries under which independent parties can receive names. The current list explicitly includes `vercel.app`.

```d2
direction: down
*.style.border-radius: 8
*.style.stroke-width: 2
*.style.font-size: 18

browser: "BROWSER READS THE PSL" {
  style.fill: "#eff6ff"
  style.stroke: "#2563eb"
  style.font-color: "#1e3a8a"
}

rule: "vercel.app = PUBLIC SUFFIX" {
  style.fill: "#f8fafc"
  style.stroke: "#64748b"
}

sites: "INDEPENDENT SITES" {
  alice: "alice.vercel.app\nSite A" {
    style.fill: "#ecfdf5"
    style.stroke: "#16a34a"
  }
  bob: "bob.vercel.app\nSite B" {
    style.fill: "#fff7ed"
    style.stroke: "#ea580c"
  }
  style.fill: "#ffffff"
  style.stroke: "#cbd5e1"
}

blocked: "Domain=vercel.app COOKIE\nREJECTED" {
  style.fill: "#fef2f2"
  style.stroke: "#dc2626"
  style.font-color: "#7f1d1d"
}

browser -> rule: finds entry
rule -> sites: assigns separate eTLD+1
sites -> blocked: prevents shared parent cookie
```

Because `vercel.app` is a public suffix, browsers treat each direct child as its own registrable site. A deployment cannot set `Domain=vercel.app`, just as an ordinary website cannot set a cookie for all of `.com`.

This produces two walls:

1. A separate domain protects `vercel.com` from user deployments.
2. The PSL protects one `vercel.app` deployment from another.

## Chapter 7: Wildcard Trust Becomes Safer

Engineers often reach for wildcard allowlists because they are convenient:

```text
https://*.vercel.com
```

That pattern becomes dangerous if arbitrary users can create subdomains beneath it.

- A permissive CORS rule could expose credentialed API responses.
- A CSP rule such as `script-src *.vercel.com` could trust attacker-hosted JavaScript.
- A loose OAuth redirect check could send authorization codes to a tenant.
- Webhook validation based on a hostname suffix could accept untrusted senders.

Moving user content to `vercel.app` means an allowlist for trusted `*.vercel.com` services no longer automatically matches customer deployments.

The safest rule is still to allow exact origins whenever possible. The domain split reduces the cost of a future wildcard mistake; it does not make wildcard trust universally safe.

## Chapter 8: Reputation and Blast Radius

Security products, browsers, email filters, and corporate firewalls build reputation around domains and URLs. User-generated hosting inevitably attracts some phishing and abuse.

If that content lived under `vercel.com`, enforcement against a malicious subdomain could damage trust in Vercel's dashboard, login links, documentation, or transactional email.

With a separate deployment domain, the platform can contain more of the damage:

```text
vercel.com                         vercel.app
control plane                      user content
dashboard + login                  millions of deployments
stable brand reputation            separate abuse surface
```

The visual trust problem matters too. A phishing URL such as `account-security.vercel.com` looks like an official Vercel service to many users. A name such as `account-security.vercel.app` is not harmless, but the different deployment suffix makes the trust boundary more visible.

This separation helps several systems make narrower decisions:

- **Safe Browsing and browser warnings** can target a malicious deployment without automatically making the dashboard look related to it.
- **Email filters** can continue treating login links from `vercel.com` differently from user-created deployment URLs.
- **Corporate firewalls** can block shared hosting domains while preserving access to the platform's management interface.
- **The abuse team** can suspend one deployment or project without changing the control-plane hostname.

This is containment, not prevention. A phishing page can still appear under `vercel.app`, and Vercel still needs detection, reporting, and takedown systems. The split simply prevents one abusive deployment from sharing the exact same site identity as the control plane.

## Chapter 9: Control Plane vs Data Plane

The domain design mirrors a common cloud architecture pattern.

- The **control plane** is where users configure the system: dashboard, authentication, account settings, APIs, and billing.
- The **data plane** is where workloads and traffic run: deployments, edge delivery, custom domains, and application requests.

```d2
direction: down
*.style.border-radius: 8
*.style.stroke-width: 2
*.style.font-size: 18

control: "CONTROL PLANE - vercel.com" {
  dns: "DNS zone: vercel.com"
  tls: "TLS certificate: vercel.com"
  waf: "WAF: login + API rules"
  product: "Dashboard + auth + billing"
  style.fill: "#eff6ff"
  style.stroke: "#2563eb"
  style.font-color: "#1e3a8a"
}

handoff: "SIGNED DEPLOYMENT + CONFIGURATION" {
  style.fill: "#ecfdf5"
  style.stroke: "#16a34a"
  style.font-color: "#14532d"
}

data: "DATA PLANE - vercel.app" {
  dns: "DNS zone: vercel.app"
  tls: "Wildcard + tenant certificates"
  edge: "CDN + deployment WAF"
  apps: "Millions of user deployments"
  domains: "Custom domains via CNAME"
  style.fill: "#fff7ed"
  style.stroke: "#ea580c"
  style.font-color: "#7c2d12"
}

incident: "ATTACK OR OUTAGE\nData plane degraded" {
  style.fill: "#fef2f2"
  style.stroke: "#dc2626"
  style.font-color: "#7f1d1d"
}

response: "CONTROL PLANE STAYS AVAILABLE\nInvestigate, block, or roll back" {
  style.fill: "#ecfdf5"
  style.stroke: "#16a34a"
  style.font-color: "#14532d"
}

internet: "INTERNET TRAFFIC" {
  style.fill: "#f8fafc"
  style.stroke: "#64748b"
}

control.product -> handoff: publishes
handoff -> data.apps: activates
internet -> data.domains: serves requests
incident -> data.edge: targets deployments
control -> response: separate fate
response -> data.apps: block or roll back
```

The split also helps operations. The two planes can have independent DNS zones, certificate issuance paths, web application firewall rules, rate limits, logs, monitoring, and incident-response procedures. The control plane can be tuned for login and API abuse, while the data plane can be tuned for DDoS traffic, arbitrary applications, and per-deployment limits.

If an attack or outage affects large numbers of hosted sites, the dashboard can remain available for incident communication, configuration changes, takedowns, and rollbacks. The domains do not guarantee independent availability on their own, but they allow the underlying stacks to be separated instead of forcing both planes to share every dependency.

The analogy is similar to separating a cloud provider's management console from the workloads running inside customer accounts.

## Chapter 10: The Split Has Costs

The safer design is not free.

**Cross-site product features are harder.** Preview comments, toolbars, authentication handoffs, and protected deployments cannot casually reuse a dashboard cookie. They need short-lived tokens, redirects, or explicit messaging between origins.

**Third-party cookie restrictions matter.** A `vercel.com` cookie is third-party inside a `vercel.app` frame. Safari's tracking protection and browser privacy changes can break designs that rely on embedded cookies.

**Operations are duplicated.** The platform manages separate DNS, certificates, monitoring, abuse controls, and incident response for the two domains.

**The PSL is intentionally sticky.** Browser updates distribute the list gradually. Changing a public-suffix boundary later can break cookie assumptions, so this architecture should be chosen carefully and early.

**Reputation is still shared within the hosting domain.** Some networks may block an entire free-hosting suffix after enough abuse, affecting legitimate projects too.

**Brand confusion does not disappear.** Attackers can still create convincing names under `vercel.app`, and many users do not know the difference between a platform domain and customer content. The separate suffix reduces implied trust; it does not teach every user how DNS works.

**Migration is painful.** Moving from an old user-content domain means maintaining redirects, updating documentation and CNAME targets, repairing hard-coded callbacks, and accepting that some old links or printed URLs may eventually break. Browsers also receive PSL changes on different schedules, so cookie-boundary changes cannot be treated like an instant DNS switch.

The trade-off is worthwhile because most costs fall on platform engineering, while the isolation benefits every user.

## Chapter 11: This Is an Industry Pattern

Vercel is not unique. Multi-tenant platforms commonly separate their trusted product domain from user-controlled content.

| Platform | Trusted domain | User-content domain | What happened |
|---|---|---|---|
| GitHub Pages | `github.com` | `github.io` | [Migrated in April 2013](https://github.blog/news-insights/product-news/new-github-pages-domain-github-io/) to reduce related-domain cookie and phishing risks |
| Vercel | `vercel.com` | `vercel.app` | Rebranded from ZEIT in 2020; [automatic `now.sh` URLs moved in February 2021](https://vercel.com/changelog/urls-are-becoming-consistent) |
| Netlify | `netlify.com` | `netlify.app` | [Customer sites moved in 2020](https://answers.netlify.com/t/deprecating-automatic-com-redirects/115442) to separate them from Netlify-operated properties |
| Cloudflare | `cloudflare.com` | `pages.dev` and `workers.dev` | User workloads start on dedicated hosting domains |
| Firebase | `firebase.google.com` | `web.app` and `firebaseapp.com` | Hosted applications are separated from Google's product interface |
| Google | `google.com` | `googleusercontent.com` | User uploads and generated content use a separate content domain |
| Dropbox | `dropbox.com` | `dropboxusercontent.com` | Shared files are served from a sandboxed content domain |
| Heroku | `heroku.com` | `herokuapp.com` | Applications use a dedicated hosting domain |
| Render | `render.com` | `onrender.com` | Applications use a separate service domain |
| Fly.io | `fly.io` | `fly.dev` | Application traffic is separated from the product domain |

The names differ, but the principle is consistent: do not serve arbitrary tenant code from the same registrable domain that holds privileged user sessions.

Platforms designed today should establish this boundary from the beginning. Migrating later means redirects, broken links, cookie changes, customer communication, and long compatibility windows.

GitHub's migration is especially useful evidence. Its official announcement named the same two families of risk discussed here: related-domain cookies that could contribute to session fixation or CSRF problems, and phishing pages that looked trustworthy because they ended in `github.com`. Old Pages URLs received permanent redirects, showing that even a security-driven domain change needs a careful compatibility plan.

## Chapter 12: A Checklist for Your Own Platform

If you are building a SaaS product that hosts customer pages, uploads, plugins, previews, or executable code, use this checklist.

- Put user-controlled content on a separate registrable domain, not a subdomain of your control plane.
- Give each tenant its own hostname instead of only a path.
- Submit the shared hosting suffix to the Public Suffix List when the model requires tenant-to-tenant site isolation.
- Prefer an HSTS-preloaded TLD or preload the hosting domain carefully.
- Keep CORS, CSP, OAuth redirects, and webhook allowlists exact; avoid broad wildcards.
- Verify webhooks with cryptographic signatures, not only a sender domain or IP address.
- Use host-only session cookies with `Secure`, `HttpOnly`, and an explicit `SameSite` value.
- Prefer the `__Host-` cookie prefix for sensitive host-bound cookies.
- Keep CSRF tokens and request-origin validation even when `SameSite` is enabled.
- Separate rate limits, WAF rules, logging, and abuse response for control-plane and user-content traffic.
- Plan DNS, certificates, redirects, CNAME targets, and legacy-link retention before migrating an existing hosting domain.
- Design cross-site authentication handoffs explicitly instead of depending on ambient cookies.

A hardened session cookie starts with a shape like this:

```http
Set-Cookie: __Host-session=<opaque-value>; Path=/; Secure; HttpOnly; SameSite=Lax
```

The `__Host-` prefix requires `Secure`, forbids a `Domain` attribute, and requires `Path=/` in supporting browsers. That keeps the cookie bound to the exact host that set it.

## Conclusion

Vercel's use of `vercel.app` is not mainly about finding a fashionable domain ending. It is a platform-security decision.

The separation creates a different site between Vercel's trusted control plane and user-controlled deployments. The Public Suffix List then creates another boundary between individual deployments. Together, those choices strengthen cookie isolation, `SameSite` defenses, allowlists, reputation containment, and operational resilience.

The final architecture is easy to summarize:

```text
vercel.com  = trusted control plane
vercel.app  = untrusted deployment plane
PSL entry   = tenant-to-tenant isolation
```

A domain is not just a label at the edge of a system. In a browser, it is part of the security model.

That is what makes this design so compelling. Millions of developers can press **Deploy**, share what they built, and move on with their day. Behind that simple action is a boundary chosen before an incident forced the lesson: creative freedom belongs on one side, and the trust people place in their accounts belongs safely on the other.

> **The best outcome is deliberately uneventful:** a malicious deployment remains only a malicious deployment. It does not become a stolen session, a compromised dashboard, or a reason for every honest project to lose trust.

## Sources and Further Reading

- [Video source: Why Vercel Uses `.app` for Your Projects, Not `.com`](https://www.youtube.com/watch?v=7KeFUBs5vvg)
- [Vercel: Accessing deployments through generated URLs](https://vercel.com/docs/deployments/generated-urls)
- [Vercel: Working with domains](https://vercel.com/docs/domains/working-with-domains)
- [Vercel: Automatic URLs moving from `now.sh` to `vercel.app`](https://vercel.com/changelog/urls-are-becoming-consistent)
- [GitHub: New GitHub Pages domain, `github.io`](https://github.blog/news-insights/product-news/new-github-pages-domain-github-io/)
- [GitHub: Technical explanation of related-domain cookies](https://github.blog/engineering/yummy-cookies-across-domains/)
- [Netlify: Deprecating legacy `netlify.com` redirects](https://answers.netlify.com/t/deprecating-automatic-com-redirects/115442)
- [MDN: Same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)
- [MDN: What is a site?](https://developer.mozilla.org/en-US/docs/Glossary/Site)
- [MDN: Using HTTP cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies)
- [MDN: Cross-site request forgery](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF)
- [Public Suffix List](https://publicsuffix.org/)
- [Current PSL entry for Vercel](https://github.com/publicsuffix/list/blob/master/public_suffix_list.dat)
- [Google Registry: `.app` and HSTS preloading](https://www.registry.google/domains/app/)
