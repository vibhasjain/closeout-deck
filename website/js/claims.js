/* Documentation and swap points only; the HTML intentionally carries its copy inline.
   "Verified" is the brief's status, not independent verification in this implementation. */
(() => {
  const brief = 'website/BRIEF.md §5; owner to revalidate before publication';
  const synthetic = 'website/BRIEF.md §§4,6; synthetic demonstration data';
  const entry = (value, status, source = brief) => ({ value, status, source });
  window.CLAIMS = {
    'growth-140': entry('140% median annual growth', 'unconfirmed'),
    'market-925': entry('98.7% vs 92.5% show rate', 'unconfirmed'),
    'show-rate-987': entry('98.7% healthcare show rate', 'unconfirmed'),
    'show-rate-974': entry('97.4% light industrial show rate', 'unconfirmed'),
    'wonolo-15-80': entry('10,000 shifts/month; break confirmations 15% → 80%', 'unconfirmed'),
    'naming-rights-shiftkey': entry('ShiftKey mark', 'unconfirmed'),
    'naming-rights-nursa': entry('Nursa mark', 'unconfirmed'),
    'naming-rights-wonolo': entry('Wonolo mark', 'unconfirmed'),
    'naming-rights-traba': entry('Traba mark', 'unconfirmed'),
    'naming-rights-instawork': entry('Instawork mark', 'unconfirmed'),
    'naming-rights-clipboard-health': entry('Clipboard Health mark', 'unconfirmed'),
    'quote-competitive-advantage': entry('Reserved customer quotation', 'unconfirmed'),
    'connectors-live': entry('UKG, ADP, Ubeya, 7shifts, Paylocity, Gusto, QuickBooks, Bullhorn, SAP, NetSuite, Workday', 'unconfirmed'),
    'call-expectations': entry('Real shift sample, discrepancies and settlements, show-rate benchmark', 'unconfirmed'),
    'sia-growth-1': entry('1% US staffing growth, 2026 forecast (SIA)', 'verified'),
    'monthly-shifts-1000000': entry('Over 1,000,000 shifts a month', 'verified'),
    'traba-quote': entry('100% of shifts; 98.3% fulfillment rate', 'provided', 'website/BRIEF.md §5; attributed to Akshay Buddiga; supplied case-study link https://hypertrack.com/traba-case-study; not independently verified'),
    'pricing': entry('$0.35 to $1 per shift; contracts from $10k a year', 'provided'),
    'proposal-date': entry('© 2026; September 2026', 'provided'),
    'station-sequence': entry('Seven stations; one agent; Station 1–7 of 7', 'structural', 'website/BRIEF.md §§5,6; presentation structure'),
    'editorial-numbers': entry('One line; seven lit stations; 5am healthcare shift; two sides of one coin; one clerk at one lamp', 'provided'),
    'pay-cycle': entry('Aug 24–30; Aug 27 location example; 54 shifts/timecards; 6 sites; 14 workers', 'synthetic', synthetic),
    'maria-shift': entry('#4821; scheduled 09:00–16:30; ADP 08:58 → —; geofence 08:52; off floor 12:10–12:41; left 17:01; paper 09:00–17:00; $24.50/h; reconciled 08:58 → 17:01; 8.05 h; $197.23', 'synthetic', synthetic),
    'luis-shift': entry('#4826; 06:01–14:31; no meal break before hour 5; CA-MB-01; +$24.50 premium; 9.50 h; $232.75', 'synthetic', synthetic),
    'priya-shift': entry('#4825; 06:58–15:02; CON-SUTTER-01; orientation bills $0 and pays training rate', 'synthetic', synthetic),
    'aisha-shift': entry('#4830; 43.0 h this week; 3.0 h OT held; 40.00 h in pay table; TW-1187; expires Sun Aug 30; $980.00 held', 'synthetic', synthetic),
    'tom-shift': entry('#4833; 08:02–16:00', 'synthetic', synthetic),
    'clipboard-read': entry('4 rows read', 'synthetic', synthetic),
    'worker-messages': entry('17:06; 17:09; worker reply 5:01; recorded 17:01', 'synthetic', synthetic),
    'timeline-axis': entry('06:00–18:00; ticks 06, 09, 12, 15, 18', 'synthetic', synthetic),
    'compiled-rules': entry('CA-MB-01: 30-minute meal before end of 5th hour, 1-hour premium, +1.0 h; CON-SUTTER-01: bill $0; TW-1187: hold OT > 40 h, expires Sun Aug 30; ran on 54 shifts, fired 1, #4825', 'synthetic', synthetic),
    'supervisor-messages': entry('14:40; 14:52; floor 06:01–14:31; hour 5; 1-hour premium; CA-MB-01; +$24.50; 3 attachments', 'synthetic', synthetic),
    'payroll-batch': entry('ADP-0901; 41 workers; $58,420; sent Thu 18:00', 'synthetic', synthetic)
  };
})();
