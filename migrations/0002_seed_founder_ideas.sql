-- Seeds the board with the founder's own ventures so it is not empty on launch.
-- Fixed ids and INSERT OR IGNORE keep this safe to re-run.
--
-- The founder's phone is intentionally left blank: update it from the admin
-- console, or with
--   UPDATE users SET phone = '+44...' WHERE id = '00000000-0000-4000-8000-000000000001';

INSERT OR IGNORE INTO users
  (id, email, phone, first_name, last_name, title, status, email_verified_at, created_at)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'sathiya@okayma.com',
  '',
  'Sathiyarajan',
  'Rajendran',
  'Founder and Solution Architect',
  'active',
  '2026-06-19T16:06:00.000Z',
  '2026-06-19T16:06:00.000Z'
);

-- Posted across the three months to 15 September 2026; the board lists them
-- newest first, so display order follows these dates.
INSERT OR IGNORE INTO ideas (id, user_id, title, description, status, created_at, decided_at)
VALUES
(
  '00000000-0000-4000-8000-00000000f001',
  '00000000-0000-4000-8000-000000000001',
  'CyberOps Intel',
  'Security teams drown in tooling yet still cannot answer a simple question: what do we actually own, and what is exposed right now? CyberOps Intel is a self-hosted intelligence platform that discovers cloud assets, indexes findings in Elasticsearch, and puts continuity of critical services at the centre rather than raw vulnerability counts. It runs entirely in Docker, inside your own boundary, so nothing sensitive leaves the estate. The value is a straight answer, not another dashboard.',
  'approved',
  '2026-09-12T11:01:00.000Z',
  '2026-09-14T17:47:00.000Z'
),
(
  '00000000-0000-4000-8000-00000000f002',
  '00000000-0000-4000-8000-000000000001',
  'Retail Intelligence',
  'Independent off-licence and speciality retailers run good businesses on tills that were never designed to think. Retail Intelligence is a multi-tenant layer that sits above any POS — Square, EPOS Now, Shopify — and turns transactions into forecasting, purchasing, supplier performance, margin and minimum-unit-pricing compliance. Thirteen event-driven services, one canonical product master, no connector writing domain data directly. The aim is not to replace the till. It is to make the shop behave like a chain.',
  'approved',
  '2026-07-29T20:05:00.000Z',
  '2026-07-30T23:26:00.000Z'
),
(
  '00000000-0000-4000-8000-00000000f003',
  '00000000-0000-4000-8000-000000000001',
  'CoRide',
  'Drivers carry the risk, the vehicle and the hours, then hand over a commission nobody can see the workings of. CoRide is an open-source ride-hailing platform where the fare breakdown is visible per ride: infrastructure cost, operations cost, a small reserve, and the rest to the driver — typically eighty to ninety-five percent. Cost rules can be changed, but only with a future effective date, never retroactively. Transparency is enforced by the schema, not promised in marketing.',
  'approved',
  '2026-08-23T18:36:00.000Z',
  '2026-08-26T16:31:00.000Z'
),
(
  '00000000-0000-4000-8000-00000000f004',
  '00000000-0000-4000-8000-000000000001',
  'CoVibe',
  'Live-in partnerships in India are increasingly common and almost entirely unsupported — no verification, no agreed terms, no record of who paid for what. CoVibe is a platform for consenting adults that combines verified identity, preference-based matching, private communication, and the unglamorous parts: a written agreement between partners and a shared ledger of contributions. Given the sensitivity, privacy and consent controls come first and the legal framing is explicit. Structure does not reduce trust. It protects it.',
  'approved',
  '2026-08-14T08:33:00.000Z',
  '2026-08-16T11:03:00.000Z'
),
(
  '00000000-0000-4000-8000-00000000f005',
  '00000000-0000-4000-8000-000000000001',
  'Nexora',
  'Every organisation is quietly accumulating AI sprawl: one team on OpenAI, another on Anthropic, a third on Bedrock, each with its own keys, costs and no shared governance. Nexora is the operating layer above all of them — one login, one workspace, one policy and metering boundary, deliberately vendor agnostic. Intelligent routing, a shared prompt library, retrieval, and per-tenant billing sit on top. It is not another model. It is the layer that makes models governable.',
  'approved',
  '2026-06-23T10:43:00.000Z',
  '2026-06-23T14:24:00.000Z'
),
(
  '00000000-0000-4000-8000-00000000f006',
  '00000000-0000-4000-8000-000000000001',
  'PhishAware',
  'Most phishing simulations fail because they look nothing like the mail that actually reaches a finance clerk or a new joiner. PhishAware generates awareness campaigns from employee persona, department, seniority and prior behaviour, so a procurement test reads like a vendor quotation and an executive test reads like a board paper. Every generated template is reviewed and approved before it sends, with guardrails that refuse genuine credential harvesting. Realistic testing, kept firmly on the ethical side.',
  'approved',
  '2026-07-08T19:47:00.000Z',
  '2026-07-10T18:37:00.000Z'
);
