/* Documentation and swap points only; the HTML intentionally carries its copy inline.
   "Verified" is the brief's status, not independent verification in this implementation. */
(() => {
  const brief = 'website/BRIEF.md §5; owner to revalidate before publication';
  const synthetic = 'website/BRIEF.md §§4,6; synthetic demonstration data';
  const entry = (value, status, source = brief) => ({ value, status, source });
  const source = (publisher, year, url) => ({ publisher, year, url });
  const report = source('HyperTrack', 2026, 'unpublished — Shift Reliability Report, coming soon');
  const metric = (value, where, source = report, confidence = 'first-party-draft') => ({ value, where, source, confidence });
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
    'station-sequence': entry('Eight agents; one team; Station 1–8 of 8', 'structural', 'Fifth website change batch; presentation structure'),
    'editorial-numbers': entry('One line; lit stations; 5am healthcare shift; two sides of one coin; one clerk at one lamp', 'provided'),
    'discrepancy-check': entry('54 checked; 3 flagged; 51 clean; #4821, #4826, #4830, #4833', 'synthetic', 'Fifth website change batch; synthetic demonstration data'),
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
    'payroll-batch': entry('ADP-0901; 41 workers; $58,420; sent Thu 18:00', 'synthetic', synthetic),
    'report-locked': metric('Q2 2026; three months; about a million validated shifts/month', '#numbers; #industries'),
    'report-no-shows': metric('11.5%', '#numbers no-shows'),
    'report-arrivals': metric({ onTime: '74.2%', late: '21.9%', unverifiable: '3.9%' }, '#numbers arriving workers'),
    'report-validation': metric('~1M/month; visibility 64% at go-live to 94% by month 11', '#numbers validated shifts'),
    'report-on-time': metric({ healthcare: { median: '69.3%', best: '75.0%', overall: '72.6%' }, lightIndustrial: { median: '83.3%', best: '85.6%', overall: '76.4%' } }, '#numbers dumbbell; #industries'),
    'report-late': metric({ series: ['Healthcare', 'Light industrial'], percent: { 'Left too late': [46.7, 41.0], 'Long stop': [16.9, 16.1], Traffic: [8.2, 18.6], 'Last-minute assignment': [13.1, 7.1], 'Drive detour': [10.2, 11.7] } }, '#numbers late arrivals'),
    'report-visibility': metric({ months: [1, 2, 3, 4, 5, 6, 7, 8], healthcarePercent: [77.4, 84.6, 89.0, 89.9, 91.9, 93.5, 94.9, 95.9], lightIndustrialPercent: [58.4, 74.2, 82.2, 85.9, 88.5, 90.6, 92.1, 92.8] }, '#numbers visibility'),
    'pay-error-job-search': metric('After one error 24%; after two errors 49%', '#retention', source('Workforce Institute', 2017, 'https://hrdailyadvisor.hci.org/2017/06/15/payroll-problems-may-undermine-employee-experience-says-survey/'), 'secondary'),
    'pay-error-cost': metric('$291; direct and indirect', '#retention', source('EY', 2022, 'https://eyquest.com/files/Cost_and_Risks_Due_to_Payroll_Errors_2022_Final.pdf'), 'primary'),
    'time-submission-errors': metric('1 in 6; 83.35% error-free', '#retention', source('Bloomberg Tax', 2019, 'https://data.bloomberglp.com/bna/sites/9/2019/10/BTAX-Payroll-Benchmarks-Survey-Report_Final.pdf'), 'primary'),
    'timesheet-corrections': metric('80%; employer-reported', '#retention', source('QuickBooks Time', 2017, 'https://quickbooks.intuit.com/time-tracking/resources/time-attendance-stats/'), 'primary'),
    'worker-replacement-cost': metric('16% of annual pay; worker earning under $30K', '#retention', source('Center for American Progress', 2012, 'https://www.americanprogress.org/article/there-are-significant-business-costs-to-replacing-employees/'), 'primary'),
    'rn-turnover-cost': metric('$60,090 per bedside RN', '#industries healthcare', source('NSI', 2026, 'https://www.nsinursingsolutions.com/documents/library/nsi_national_health_care_retention_report.pdf'), 'primary'),
    'traditional-staffing': metric('Fill rate 46%; worker turnover 75–95%', '#industries light industrial', source('Contrary Research', 2024, 'https://research.contrary.com/company/traba'), 'secondary')
  };
})();
