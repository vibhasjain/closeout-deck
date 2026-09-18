/* Documentation and swap points only; the HTML intentionally carries its copy inline.
   Pruned to the r5 page (Sep 17 2026). Earlier report, retention and synthetic-demo entries are in git history. */
(() => {
  const r5 = 'website/PLAN-r5.md; Sep 17 2026 review (Voicenotes Tn78jyuo); owner to revalidate before publication';
  const entry = (value, status, source = r5) => ({ value, status, source });
  const speaker = (name, title, company, session, replay, year) => ({ name, title, company, session, replay, source: `hypertrack-content/website/data/sws-${year}-sessions.csv` });
  window.CLAIMS = {
    'growth-140': entry('Platforms on HyperTrack grew 140% while the staffing market is forecast to grow 7% (SIA U.S. staffing forecast, 2026; HyperTrack customer cohort analysis)', 'unconfirmed'),
    'sia-growth-7': entry('Staffing market forecast to grow 7% (SIA, 2026). Unverified: a search summary of the SIA September 2026 update says 2.4%. https://www.staffingindustry.com/research/research-reports/americas/us-staffing-industry-forecast-september-2026-update', 'unconfirmed'),
    'fortune-1000': entry("Fortune 1000 companies prefer HyperTrack customers. *Based on our customers' live client lists.", 'unconfirmed'),
    'pricing-per-pay': entry('Priced per pay. Contracts from $10k a year; paid pilots available.', 'unconfirmed'),
    'report-locked': entry('Shift Reliability Report 2026; a million validated shifts a month across healthcare and light industrial; no public URL yet', 'unconfirmed'),
    'naming-rights-shiftkey': entry('ShiftKey mark', 'unconfirmed'),
    'nursa-case-study': entry('Ben Chapman, Product Leader, Nursa; quote shortened from https://hypertrack.com/nursa-case-study', 'unconfirmed'),
    'naming-rights-nursa': entry('Nursa mark', 'unconfirmed'),
    'connectors-live': entry('UKG, ADP, Ubeya, 7shifts, Paylocity, Gusto, QuickBooks, Bullhorn, SAP, NetSuite, Workday', 'unconfirmed'),
    'call-expectations': entry('A sample of real shifts closed out; every discrepancy the agent finds', 'unconfirmed'),
    'traba-quote': entry('100% of shifts; 98.3% fulfillment rate', 'approved', 'Akshay Buddiga, Traba; https://hypertrack.com/traba-case-study')
  };
  // Shift Work Summit speakers, in Jared's order. Summit speakers, not customers.
  window.SPEAKERS = [
    speaker('Curtis Anderson', 'CEO', 'Nursa', 'Building a High-Growth Business in Times of Extreme Uncertainty', 'https://youtu.be/Oq1exHaaHGk', 2025),
    speaker('Waynn Lue', 'VP Engineering', 'Wonolo', 'Building AI Agents with Empathy for Workers', 'https://youtu.be/oT17w6biQr4', 2025),
    speaker('Mike Shebat', 'CEO', 'Traba', 'How to Build a Culture for Hypergrowth and Excellence in the Staffing Industry', 'https://youtu.be/V4O5MVnD1xw', 2025),
    speaker('Novo Constare', 'CEO', 'Indeed Flex', 'How Workforce Automation for Deskless Workers Is Transforming with AI', 'https://youtu.be/maesEHlpGow', 2025),
    speaker('Barbara Simmer', 'EVP', 'Staffmark', 'Retaining Humanity in a World of Tech', 'https://youtu.be/fJI1Q8-3ODM', 2025),
    speaker('Jarah Euston', 'President & COO', 'WorkWhile', 'Building worker-first automation with AI', 'https://youtu.be/0oPakKA9s1M', 2025),
    speaker('Curt Baldwin', 'CTO', 'Medical Solutions', 'The Tech Evolution of Flex Worker Pools', 'https://youtu.be/eom9rVnVrgU', 2025),
    speaker('Brian Neely', 'Chief Sales Officer', 'Job&Talent', 'Revolutionizing staffing: how Job&Talent leverages technology to shape the future of workforce solution', 'https://www.youtube.com/watch?v=rp-i26osfGI', 2024),
    speaker('Ivan Sathianathan · Kirti Shenoy', 'Staff Product Manager, Wonolo', 'Founder & CEO, Zeal', 'How Wonolo does daily pay for W-2 workers', 'https://www.youtube.com/watch?v=hsJu26U47G4', 2024)
  ];
})();
