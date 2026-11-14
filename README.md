<div align="center">

# 🛡️ OfferProof

**Your Next Opportunity Deserves Verification.**  
*An explainable, privacy-first job and internship offer verification platform built for students and job seekers.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TanStack Start](https://img.shields.io/badge/TanStack-Start%20%2F%20Router-FF4154?logo=tanstack&logoColor=white)](https://tanstack.com/start)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%2F%20Edge%20Functions-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![NVIDIA AI](https://img.shields.io/badge/NVIDIA-Nemotron--3.5--bolt--e4b-76B900?logo=nvidia&logoColor=white)](https://build.nvidia.com/)
[![Tests Passing](https://img.shields.io/badge/Tests-64%20passed%20(11%20suites)-brightgreen?logo=vitest&logoColor=white)](./docs/09-security-and-testing.md)
[![License](https://img.shields.io/badge/License-Proprietary%20%2F%20All%20Rights%20Reserved-blue)](#license)

[**Explore Documentation**](./docs/README.md) • [**Download Technical Report (.docx)**](./docs/OfferProof_Documentation.docx) • [**View Application Sitemap**](./docs/11-sitemap.md) • [**Explore Features**](./docs/01-overview.md#feature-list-implemented)

</div>

---

## 📌 Problem & Solution

### The Challenge
Employment fraud has surged, specifically targeting fresh college graduates, early-career engineers, and remote workers. Threat actors deploy sophisticated tactics:
- Demanding "refundable" registration, security, or equipment fees before joining.
- Impersonating corporate recruiters using free webmail (`@gmail.com`) or look-alike domains (`acme-careers.net`).
- Demanding sensitive identity documents (Aadhaar, PAN, SSN) or financial passwords/OTPs under manufactured urgency.
- Distributing fake cheques and demanding candidates forward "excess funds" to third-party vendors.

### The Solution: OfferProof
OfferProof scans employment offers, appointment letters, and communication screenshots using **deterministic, explainable client-side heuristics**. Unlike black-box models, every warning is tied to exact evidence highlighted directly in the offer text, paired with pragmatic next steps and NVIDIA AI advisory guidance.

---

## ✨ Key Features

- **🔍 Client-Side Verification Engine**  
  Scans text across 11 rule-based heuristic patterns in milliseconds. Results are classified into *Low Concern*, *Needs Review*, or *High Concern* with zero server upload.
- **📄 In-Browser Document & OCR Extraction**  
  Extracts text locally from PDFs (up to 20 pages via **PDF.js** Web Worker) and images/screenshots (via **Tesseract.js** Web Worker). Raw documents never leave the client browser.
- **🤖 NVIDIA AI Advisory Guidance**  
  Asynchronously queries NVIDIA's `nemotron-3.5-bolt-e4b` model via Supabase Edge Functions to generate structured next steps: *Verification Steps*, *Recruiter Questions*, and *Important Precautions*.
- **📊 Real Threat Analytics (BigQuery Integration)**  
  The Scam Awareness Centre connects live to Google BigQuery (`xenon-hub-514707-f9.offerproof_analytics.job_postings`, ~17,880 records), allowing users to explore real-world fraudulent vs. legitimate job postings with instant filtering.
- **⚖️ Side-by-Side Offer Comparison**  
  Enables authenticated users to compare multiple job offers across annualized compensation, benefits, work mode, career growth, and safety signals.
- **🔒 Multi-User Session Isolation**  
  Strict `sessionStorage` scoping guarantees concurrent users in different browsers or tabs never overwrite or clear each other's offer text or verification state.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph Client["Browser (Client-Side SPA)"]
        UI["React 19 + TanStack Router UI"]
        ENGINE["Heuristic Engine (Pure TS)\nsrc/lib/verify/engine.ts"]
        WORKERS["Web Workers\nPDF.js (PDF) / Tesseract.js (OCR)"]
        SESSION["sessionStorage\n(Session Isolation)"]
    end

    subgraph Backend["Supabase Platform"]
        AUTH["Supabase Auth (Magic Links / OAuth)"]
        DB[("PostgreSQL Database\n(Row Level Security)")]
        FN_AI["Edge Function: offerproof-ai-recommendations\n(Deno)"]
        FN_BQ["Edge Function: offerproof-job-postings\n(Deno)"]
    end

    subgraph External["External Cloud Services"]
        NVIDIA["NVIDIA Inference API\nnvidia/nemotron-3.5-bolt-e4b"]
        GOOGLE["Google Cloud\nBigQuery & OAuth2"]
    end

    UI -->|Local Text| ENGINE
    UI -->|Uploaded Document| WORKERS
    WORKERS -->|Extracted Text| UI
    ENGINE -->|Findings & Score| UI
    UI <-->|Session State| SESSION

    UI -->|Auth & Session| AUTH
    UI -->|Save Report / History| DB
    DB -.->|RLS Enforces auth.uid()| AUTH

    UI -->|Invoke Async| FN_AI
    FN_AI -->|Chat Completion| NVIDIA
    NVIDIA -->|Structured Guidance| FN_AI

    UI -->|Query Job Postings| FN_BQ
    FN_BQ -->|Service Account RS256 JWT| GOOGLE
```

---

## 🖥️ Application Preview & Workflow

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 1. Ingestion Workspace (/verify)                                       │
│    [ Paste Offer Text ]  or  [ Drop PDF / Screenshot ]                 │
│    └─► Local Web Worker extracts raw text without network transmission │
├────────────────────────────────────────────────────────────────────────┤
│ 2. Deterministic Heuristic Engine                                      │
│    └─► Runs 11 fraud rules: fee checks, domain validation, urgency     │
├────────────────────────────────────────────────────────────────────────┤
│ 3. Results Dashboard (/verify results)                                 │
│    ┌───────────────────────────────────┬─────────────────────────────┐ │
│    │ Concern Signals (Scrollable 420px)│ AI Recommendations (NVIDIA) │ │
│    │ • Payment requested (High)        │ • Verification Steps        │ │
│    │ • Personal recruiter email (Med)  │ • Recruiter Questions       │ │
│    │ • Pressure / urgency language     │ • Important Precautions     │ │
│    ├───────────────────────────────────┴─────────────────────────────┤ │
│    │ Extracted Details (Company, Role, Salary, Location, Contacts)   │ │
│    ├─────────────────────────────────────────────────────────────────┤ │
│    │ OfferProof Action Guide & Verification Checklist                │ │
└────┴─────────────────────────────────────────────────────────────────┴─┘
```

---

## 🧰 Technology Stack

| Domain | Technology | Purpose & Implementation |
|---|---|---|
| **Frontend Framework** | **React 19** + **TanStack Start** | Full-stack SSR and modern React architecture |
| **Routing** | **TanStack Router** | Type-safe, file-based routing with layout nesting |
| **State & Data Fetching** | **TanStack Query** (React Query 5) | Server-state caching and asynchronous mutation management |
| **Styling & Design System** | **Tailwind CSS v4** + **shadcn/ui** | Design token system, dark/light theme, accessible primitives |
| **3D Graphics** | **Three.js** + **@react-three/fiber** | Interactive 3D scene on the landing hero |
| **Document Processing** | **PDF.js** + **Tesseract.js** | In-browser PDF extraction and OCR via Web Workers |
| **Backend & Database** | **Supabase** (PostgreSQL) | Managed database with strict owner-only Row Level Security |
| **Serverless Functions** | **Supabase Edge Functions** (Deno) | Mediates secure calls to NVIDIA and Google BigQuery |
| **Artificial Intelligence** | **NVIDIA Nemotron 3.5** | Model `nvidia/nemotron-3.5-bolt-e4b` for contextual guidance |
| **Threat Intelligence** | **Google BigQuery** | Queries `offerproof_analytics.job_postings` (17,880+ records) |
| **Test Runner** | **Vitest** + **Testing Library** | 11 test suites covering rules, session isolation, and UI |
| **Runtime & Deployment** | **Nitro** (Cloudflare Workers) | Production server build target with edge compatibility |

---

## 🚦 Fraud Detection Heuristics Summary

The core engine ([`src/lib/verify/engine.ts`](./src/lib/verify/engine.ts)) evaluates offers against 11 specialized heuristic rules:

| ID | Finding Name | Severity | Points | Trigger Condition |
|---|---|:---:|:---:|---|
| `payment_request` | Payment or Fee Requested | **High** | 6 | Requests registration, security, or processing deposits |
| `training_payment` | Training or Equipment Payment | **High** | 6 | Demands candidates pay for training, laptops, or badges |
| `cheque_fraud` | Potential Cheque Fraud | **High** | 6 | Cheque deposit paired with instruction to forward funds |
| `sensitive_info` | Sensitive Info Requested | **High / Med** | 6 / 3 | OTPs, PINs, banking credentials (High) or Aadhaar/PAN (Med) |
| `personal_email` | Recruiter Uses Free Email | **Medium** | 3 | Recruiter email uses Gmail, Yahoo, Outlook, Proton, etc. |
| `domain_mismatch` | Domain & Company Mismatch | **Medium** | 3 | Sender email domain does not match extracted company name |
| `suspicious_links` | Suspicious Links | **Medium** | 3 | Shorteners (bit.ly), bare IP addresses, HTTP, or risky TLDs |
| `unrealistic_pay` | Unrealistic Promises | **Medium** | 3 | High daily income, "no interview needed", guaranteed money |
| `urgency` | Urgency / Pressure Language | **Med / Low** | 3 / 1 | "Reply within 24 hours", "failing which", "limited slots" |
| `missing_details` | Missing Key Details | **Med / Low** | 3 / 1 | Offer omits company, role, salary, location, or contacts |
| `multiple_domains` | Multiple Sender Domains | **Low** | 1 | Emails originate from multiple conflicting root domains |

> **Assessment Scoring:** Any High-severity signal OR points ≥ 8 → **High Concern**. Points 3–7 → **Needs Review**. Points 0–2 → **Low Concern**.

---

## 📖 Comprehensive Documentation Hub

All technical specifications, architectural blueprints, and operation guides are centralized in the [`docs/`](./docs/README.md) directory:

| Document | Description |
|---|---|
| [**`docs/01-overview.md`**](./docs/01-overview.md) | Executive summary, problem statement, key capabilities, and user personas |
| [**`docs/02-tech-stack.md`**](./docs/02-tech-stack.md) | Exhaustive breakdown of all frontend, backend, AI, and build dependencies |
| [**`docs/03-architecture.md`**](./docs/03-architecture.md) | System architecture diagrams, data flow models, and security boundaries |
| [**`docs/04-workflow.md`**](./docs/04-workflow.md) | End-to-end lifecycle: ingestion, parsing, verification, and comparison |
| [**`docs/05-fraud-detection.md`**](./docs/05-fraud-detection.md) | In-depth rule specifications, regex signatures, and negation clause handling |
| [**`docs/06-ai-integration.md`**](./docs/06-ai-integration.md) | Edge function architecture, NVIDIA Nemotron prompt design, and JSON parsing |
| [**`docs/07-database-and-apis.md`**](./docs/07-database-and-apis.md) | Supabase schema (`offers`, `verification_reports`, `comparisons`) and RLS |
| [**`docs/08-setup-and-deployment.md`**](./docs/08-setup-and-deployment.md) | Prerequisites, local installation, migrations, and Cloudflare deployment |
| [**`docs/09-security-and-testing.md`**](./docs/09-security-and-testing.md) | Session isolation, data protection, troubleshooting, and test matrix |
| [**`docs/10-future-scope.md`**](./docs/10-future-scope.md) | Current technical trade-offs and future enhancement roadmap |
| [**`docs/11-sitemap.md`**](./docs/11-sitemap.md) | Complete application route tree, access controls, and SEO specifications |
| [**`docs/roadmap.md`**](./docs/roadmap.md) | Development phase tracker, completed milestones, and upcoming work |
| [**`docs/OfferProof_Documentation.docx`**](./docs/OfferProof_Documentation.docx) | **Standalone compiled Microsoft Word document containing all chapters** |

---

## 🚀 Quick Start & Installation

### 1. Prerequisites
- **Node.js** >= 18.0.0
- **npm** >= 9.0.0 (or **Bun**)

### 2. Clone & Install
```bash
git clone <repository-url>
cd OfferProof-mmc
npm install
```

### 3. Environment Setup
Copy the template and configure your Supabase variables:
```bash
cp .env.example .env
```
Configure your Edge Function secrets in Supabase:
```bash
supabase secrets set NVIDIA_API_KEY="nvapi-..."
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing & Quality Assurance

OfferProof maintains a comprehensive test suite using **Vitest** and **React Testing Library** with 100% test pass rates across all functional units.

```bash
# Run all 64 automated tests
npm test

# Run tests with interactive watch mode
npm run test:watch

# Execute TypeScript strict type-checking
npx tsc --noEmit

# Production build verification
npm run build
```

---

## 🗺️ Sitemaps & Search Crawling

- **Application Route Architecture:** [`docs/11-sitemap.md`](./docs/11-sitemap.md)
- **Production XML Sitemap:** [`public/sitemap.xml`](./public/sitemap.xml)
- **Robots Policy:** [`public/robots.txt`](./public/robots.txt) *(Disallows private user dashboard routes `/history`, `/compare`, `/reports/`)*

---

## ⚖️ License

Proprietary / All Rights Reserved. Contact the OfferProof development team for licensing, deployment permissions, or educational placement cell integrations.
