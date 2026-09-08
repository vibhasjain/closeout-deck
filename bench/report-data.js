// Reports tab data — curated 2026-09-08 from primary sources where reachable.
// Every number below has a source in SOURCES; paragraphs cite with [source-id] markers
// that render as citation chips → drawer (verbatim quote + Open source document).
// confidence: 'primary' = the source document itself was fetched and the number read there;
// 'secondary' = confirmed via an authoritative repost (the primary was paywalled/blocked);
// 'internal' = HyperTrack's own analysis (no external link).
window.REPORT = {
  sources: {
    'kronos-2017': { key: 'Workforce Institute 2017', publisher: 'The Workforce Institute at Kronos (now UKG), reported by HR Dive', title: 'Just two payroll errors can cause 49% of employees to start job hunting', year: 2017, url: 'https://www.hrdive.com/news/just-two-payroll-errors-can-cause-49-of-employees-to-start-job-hunting/444377/', quote: '49% of American workers will start a new job search after experiencing only two problems with their paycheck.', confidence: 'secondary' },
    'kronos-2017-first': { key: 'Workforce Institute 2017', publisher: 'The Workforce Institute at Kronos (via HR Daily Advisor)', title: 'Payroll problems may undermine employee experience, says survey', year: 2017, url: 'https://hrdailyadvisor.hci.org/2017/06/15/payroll-problems-may-undermine-employee-experience-says-survey/', quote: '24%—will look for a new job after the first payroll mistake, while another 25% will seek new employment after the second issue', confidence: 'secondary' },
    'pymnts-2023': { key: 'PYMNTS · LendingClub 2023', publisher: 'PYMNTS Intelligence / LendingClub', title: 'New Reality Check: The Paycheck-to-Paycheck Report', year: 2023, url: 'https://assets.ctfassets.net/orqped9h4wgz/7CjaXlOEwMh5M8wJwNaRDd/57545a5e2afe2a6cd18d56324ae4d033/27th_Report_-_LendingClub_FINAL.pdf', quote: '62% of consumers lived paycheck to paycheck as of September 2023.', confidence: 'primary' },
    'adp-2021': { key: 'ADP Research 2021', publisher: 'ADP Research Institute', title: 'People at Work 2021: payroll accuracy', year: 2021, url: 'https://www.adp.com/-/media/adp/resourcehub/pdf/adpri/payroll-accuracy-infographic.pdf', quote: 'More than three in five (63%) say they have been underpaid at some point, with one in five (20%) saying it always or often happens.', confidence: 'primary' },
    'hibob-2025': { key: 'HiBob 2025', publisher: 'HiBob', title: 'Beyond the Paystub: Why Payroll Accuracy Is the Bedrock of Employee Experience', year: 2025, url: 'https://www.hibob.com/research/beyond-the-paystub-why-payroll-accuracy-is-a-cornerstone-of-employee-experience/', quote: '53% said repeated mistakes would make them consider leaving.', confidence: 'primary' },
    'payactiv-2019': { key: 'Payactiv 2019', publisher: 'Payactiv (vendor survey of 5,000+ shift workers)', title: '81% of users will stay with their employer because of the Payactiv benefit', year: 2019, url: 'https://payactiv.com/press/81-users-will-stay-with-their-employer-because-of-the-payactiv-benefit/', quote: 'over 81% of respondents said that they were more likely to stay in their role because of the Payactiv Benefit', confidence: 'primary' },
    'cap-2012': { key: 'Center for American Progress', publisher: 'Center for American Progress', title: 'There Are Significant Business Costs to Replacing Employees', year: 2012, url: 'https://www.americanprogress.org/article/there-are-significant-business-costs-to-replacing-employees/', quote: 'The typical cost of turnover for positions earning less than $30,000 annually is 16 percent of an employee’s annual salary.', confidence: 'primary' },
    'bullhorn-2025': { key: 'Bullhorn GRID 2025', publisher: 'Bullhorn', title: 'GRID 2025 Talent Trends Report', year: 2025, url: 'https://www.bullhorn.com/grid/grid-2025-talent-trends-report/', quote: '87% of candidates working as many hours as they want are loyal to their recruitment firms, compared with 68% of those who wish they were getting more hours', confidence: 'primary' },
    'ey-2022': { key: 'EY 2022', publisher: 'EY (sponsored by Paycom)', title: 'Cost and Risks Due to Payroll Errors: 2022 HR Processing Risk and Cost Survey', year: 2022, url: 'https://eyquest.com/files/Cost_and_Risks_Due_to_Payroll_Errors_2022_Final.pdf', quote: 'The analysis shows that, on average, a company has an 80.15% payroll accuracy rate. In the previous fiscal year, each error cost companies, on average, $291 to remedy directly and indirectly.', confidence: 'primary' },
    'ey-2022-punches': { key: 'EY 2022', publisher: 'EY (sponsored by Paycom)', title: 'Cost and Risks Due to Payroll Errors: 2022 HR Processing Risk and Cost Survey', year: 2022, url: 'https://eyquest.com/files/Cost_and_Risks_Due_to_Payroll_Errors_2022_Final.pdf', quote: 'Combining direct and indirect costs, missing/incorrect time punches costs companies about $78,700 per 1,000 employees per year, followed by sick time not entered ($70,300 per 1,000 employees)', confidence: 'primary' },
    'ey-2022-ta': { key: 'EY 2022', publisher: 'EY (sponsored by Paycom)', title: 'Cost and Risks Due to Payroll Errors: 2022 HR Processing Risk and Cost Survey', year: 2022, url: 'https://eyquest.com/files/Cost_and_Risks_Due_to_Payroll_Errors_2022_Final.pdf', quote: 'Time/attendance and expense errors are most common, occurring on average more than once per employee per year.', confidence: 'primary' },
    'ey-2022-minutes': { key: 'EY 2022', publisher: 'EY (sponsored by Paycom)', title: 'Cost and Risks Due to Payroll Errors: 2022 HR Processing Risk and Cost Survey', year: 2022, url: 'https://eyquest.com/files/Cost_and_Risks_Due_to_Payroll_Errors_2022_Final.pdf', quote: 'On average in the past fiscal year, companies spent 26 minutes per employee to fill in missing time punches or correct inaccurate ones.', confidence: 'primary' },
    'bloomberg-2019': { key: 'Bloomberg Tax 2019', publisher: 'Bloomberg Tax & Accounting', title: '2019 Payroll Benchmarks Survey Report', year: 2019, url: 'https://data.bloomberglp.com/bna/sites/9/2019/10/BTAX-Payroll-Benchmarks-Survey-Report_Final.pdf', quote: 'Based on respondents queried on the percentage of time worked submissions received error-free in 2017, the survey data shows an error-free average of 83.35% across respondents.', confidence: 'primary' },
    'bloomberg-2019-days': { key: 'Bloomberg Tax 2019', publisher: 'Bloomberg Tax & Accounting', title: '2019 Payroll Benchmarks Survey Report', year: 2019, url: 'https://data.bloomberglp.com/bna/sites/9/2019/10/BTAX-Payroll-Benchmarks-Survey-Report_Final.pdf', quote: 'It takes 2.19 business days to resolve a payroll error, according to the survey responses.', confidence: 'primary' },
    'bloomberg-2019-paper': { key: 'Bloomberg Tax 2019', publisher: 'Bloomberg Tax & Accounting', title: '2019 Payroll Benchmarks Survey Report', year: 2019, url: 'https://data.bloomberglp.com/bna/sites/9/2019/10/BTAX-Payroll-Benchmarks-Survey-Report_Final.pdf', quote: 'Overall, 27.2% of those receiving time-worked data said that 75% to 99.9% of their time was submitted electronically, and 5.4% reported they received all time submissions manually on paper.', confidence: 'primary' },
    'qb-time-2018': { key: 'QuickBooks Time 2018', publisher: 'QuickBooks Time (Intuit)', title: 'The Ultimate List of Time and Attendance Statistics', year: 2018, url: 'https://quickbooks.intuit.com/time-tracking/resources/time-attendance-stats/', quote: 'Sixteen percent of US employees and 34 percent of Canadian employees who track time admit to buddy punching. ... Buddy punching costs US employers $373 million a year', confidence: 'primary' },
    'qb-time-2017': { key: 'QuickBooks Time 2017', publisher: 'QuickBooks Time (Intuit)', title: 'The Ultimate List of Time and Attendance Statistics', year: 2017, url: 'https://quickbooks.intuit.com/time-tracking/resources/time-attendance-stats/', quote: '80 percent of employee timesheets have to be corrected', confidence: 'primary' },
    'qb-time-2018-manual': { key: 'QuickBooks Time 2018', publisher: 'QuickBooks Time (Intuit)', title: 'The Ultimate List of Time and Attendance Statistics', year: 2018, url: 'https://quickbooks.intuit.com/time-tracking/resources/time-attendance-stats/', quote: '38 percent use manual systems like punch cards, paper timesheets', confidence: 'primary' },
    'dol-whd-2025': { key: 'DOL WHD 2025', publisher: 'U.S. Department of Labor, Wage and Hour Division', title: 'WHD data — fiscal year 2025', year: 2025, url: 'https://www.dol.gov/agencies/whd/data', quote: 'WHD recovered more than $259 million in back wages for 176,957 employees nationwide in fiscal year 2025.', confidence: 'primary' },
    'dol-whd-series': { key: 'DOL WHD enforcement statistics', publisher: 'U.S. Department of Labor, Wage and Hour Division', title: 'Enforcement statistics — all acts, FY2013–FY2025', year: 2025, url: 'https://www.dol.gov/agencies/whd/data/charts/all-acts', quote: 'FY 2025: $259,294,764 back wages recovered; 176,957 employees receiving back wages. FY 2019: $322,490,774; 313,941.', confidence: 'primary' },
    'gao-2020': { key: 'GAO 2020', publisher: 'U.S. Government Accountability Office', title: 'Fair Labor Standards Act: Tracking Additional Complaint Data Could Improve DOL’s Enforcement (GAO-21-13)', year: 2020, url: 'https://www.gao.gov/products/gao-21-13', quote: 'WHD investigations concluded in fiscal year 2019 identified minimum wage and/or overtime violations in 80% of FLSA cases.', confidence: 'secondary' },
    'paga-series': { key: 'Ogletree · LWDA PAGA data', publisher: 'Ogletree Deakins, citing California LWDA PAGA notice filings', title: 'The Data Is In — California Class Action and PAGA Filings to Hit New Highs', year: 2025, url: 'https://ogletree.com/insights-resources/blog-posts/the-data-is-in-california-class-action-and-paga-filings-to-hit-new-highs/', quote: 'More than 2,000 more PAGA notices were filed in 2023 compared to 2022.', confidence: 'secondary' },
    'nelp-2025': { key: 'NELP 2025', publisher: 'National Employment Law Project', title: 'Raises from Coast to Coast in 2025', year: 2025, url: 'https://www.nelp.org/insights-research/raises-from-coast-to-coast-in-2025/', quote: 'On January 1, 2025, wage floors increased in 21 states and 48 cities and counties, for a total of 69 jurisdictions.', confidence: 'primary' },
    'chicago-fww': { key: 'Chicago OLS', publisher: 'Chicago Office of Labor Standards', title: 'Fair Workweek Ordinance FAQ (Municipal Code Ch. 6-110)', year: 2025, url: 'https://www.chicago.gov/content/dam/city/depts/bacp/OSL/faqfairworkweek2025finalv3.2.pdf', quote: 'Fines of $300 to $500 per employee for each offense; each day a violation continues is a separate offense.', confidence: 'secondary' },
    'nsi-2026': { key: 'NSI 2026', publisher: 'NSI Nursing Solutions, Inc.', title: '2026 NSI National Health Care Retention & RN Staffing Report', year: 2026, url: 'https://www.nsinursingsolutions.com/documents/library/nsi_national_health_care_retention_report.pdf', quote: 'the average cost of turnover for a bedside RN is $60,090 resulting in the average hospital losing between $4.2m – $6.2m', confidence: 'primary' },
    'nsi-2026-turnover': { key: 'NSI 2026', publisher: 'NSI Nursing Solutions, Inc.', title: '2026 NSI National Health Care Retention & RN Staffing Report', year: 2026, url: 'https://www.nsinursingsolutions.com/documents/library/nsi_national_health_care_retention_report.pdf', quote: 'Nationally, the hospital turnover rate is 18.5%, a nominal increase from CY24, and RN turnover is recorded at 17.6%, a 1.2% increase.', confidence: 'primary' },
    'nsi-2026-firstyear': { key: 'NSI 2026', publisher: 'NSI Nursing Solutions, Inc.', title: '2026 NSI National Health Care Retention & RN Staffing Report', year: 2026, url: 'https://www.nsinursingsolutions.com/documents/library/nsi_national_health_care_retention_report.pdf', quote: 'Over twenty-two percent (22.7%) of all newly hired RNs left within a year, with first year turnover accounting for twenty-nine percent (29.0%) of all RN separations.', confidence: 'primary' },
    'nsi-2026-point': { key: 'NSI 2026', publisher: 'NSI Nursing Solutions, Inc.', title: '2026 NSI National Health Care Retention & RN Staffing Report', year: 2026, url: 'https://www.nsinursingsolutions.com/documents/library/nsi_national_health_care_retention_report.pdf', quote: 'Each percent change in RN turnover will cost/save the average hospital an additional $295,000/yr.', confidence: 'primary' },
    'asa-2026': { key: 'ASA 2026', publisher: 'American Staffing Association', title: 'Staffing Employment and Sales Rebound in Fourth Quarter', year: 2026, url: 'https://americanstaffing.net/posts/2026/03/30/employment-and-sales-rebound-in-q4/', quote: 'Staffing sales totaled $113.5 billion, down 8.5% from 2024.', confidence: 'primary' },
    'asa-stats-2025': { key: 'ASA statistics', publisher: 'American Staffing Association', title: 'Staffing Industry Statistics', year: 2025, url: 'https://americanstaffing.net/research/fact-sheets-analysis-staffing-industry-trends/staffing-industry-statistics/', quote: 'Nearly 2.2 million temporary and contract employees worked for America’s staffing companies during an average week in 2024.', confidence: 'primary' },
    'sia-2026': { key: 'SIA via StaffingPulse', publisher: 'StaffingPulse, citing Staffing Industry Analysts', title: 'US staffing industry forecast 2026: the market resets at $180.2 billion', year: 2026, url: 'https://www.thestaffingpulse.com/news/revenue-decline-2025.html', quote: 'just below its pre-pandemic size of $185.5 billion and well under the 2022 peak of $243.9 billion', confidence: 'secondary' },
    'sia-hc-2026': { key: 'SIA via StaffingHub', publisher: 'StaffingHub, citing Staffing Industry Analysts', title: 'Healthcare Was Staffing’s Best Vertical. Now It’s the Worst-Hit.', year: 2026, url: 'https://staffinghub.com/healthcare-staffing/healthcare-staffing-reset-2026/', quote: 'US healthcare staffing revenue at $39.4 billion in 2025, a 6% decline from 2024.', confidence: 'secondary' },
    'bullhorn-2026': { key: 'Bullhorn GRID 2026', publisher: 'Bullhorn', title: 'GRID 2026 Recruitment Industry Trends Report', year: 2026, url: 'https://www.bullhorn.com/grid/2026-industry-trends/report/', quote: 'Firms using AI at any stage of the recruitment process are 3.5-4.5 times more likely to have grown revenue.', confidence: 'primary' },
    'manpower-10k': { key: 'ManpowerGroup 10-K', publisher: 'ManpowerGroup Inc. (SEC Form 10-K, FY2024)', title: 'ManpowerGroup Inc. Form 10-K, fiscal year 2024', year: 2025, url: 'https://www.sec.gov/Archives/edgar/data/871763/000095017025023186/man-20241231.htm', quote: 'with a days sales outstanding of 52 days as of December 31, 2024', confidence: 'primary' },
    'instawork-2026': { key: 'Instawork', publisher: 'Instawork (vendor claim)', title: 'Short-Term Temp Workers for Businesses', year: 2026, url: 'https://www.instawork.com/temporary-workers', quote: 'Over 90% fill rate (industry average: 65%)', confidence: 'primary' },
    'traba-2024': { key: 'Contrary Research', publisher: 'Contrary Research (company report on Traba)', title: 'Traba Business Breakdown & Founding Story', year: 2024, url: 'https://research.contrary.com/company/traba', quote: 'low fill rates of 46% on average for requests handled by traditional staffing companies', confidence: 'secondary' },
    'ht-report-2026': { key: 'HyperTrack Shift Reliability Report', publisher: 'HyperTrack', title: 'Shift Reliability Report · Staffing Benchmark Q2 2026 (April–June 2026, ~1M shifts/month)', year: 2026, url: 'https://closeoutcopilot.com/report', quote: '74.2% of arriving workers make it on time. ... the no-show rate is 11.5%.', confidence: 'primary' },
    'ht-internal-2026': { key: 'HyperTrack analysis', publisher: 'HyperTrack (internal customer-cohort analysis)', title: 'Growth of HyperTrack-powered staffing platforms vs the market, 2026', year: 2026, url: '', quote: 'The fastest-growing staffing platforms — growing at a 140% median compounded rate while the market shrank — run on HyperTrack.', confidence: 'internal' },
  },

  sections: [
    {
      id: 'retention', num: '01', title: 'Pay problems are a retention problem', sub: 'Two paycheck errors and half your workforce is looking.',
      hero: { value: '49%', caption: 'of U.S. workers start job hunting after two paycheck problems', src: 'kronos-2017' },
      chart: { type: 'bar', title: 'Workers who start a job search, by number of paycheck errors', unit: '%', labels: ['After one error', 'After two errors'], values: [24, 49], emphasis: 1, src: 'kronos-2017-first' },
      paras: [
        'Hourly workers have no slack for a wrong paycheck. 62% of U.S. consumers live paycheck to paycheck [pymnts-2023], and 63% of workers say they have been underpaid at some point [adp-2021]. In 2025, 53% said repeated payroll mistakes would make them consider leaving [hibob-2025].',
        'Staffing feels this first, because the worker’s loyalty is to whoever pays them right. Candidates who get the hours they want are loyal to their staffing firm 87% of the time, against 68% for those who don’t [bullhorn-2025]. Shift workers with on-demand pay say they are more likely to stay 81% of the time [payactiv-2019].'
      ],
      tiles: [
        { label: 'Cost to replace a worker earning under $30K', value: '16%', sub: 'of annual pay', src: 'cap-2012' },
        { label: 'Would consider leaving after repeated payroll mistakes', value: '53%', sub: 'of employees, 2025', src: 'hibob-2025' },
        { label: 'Live paycheck to paycheck', value: '62%', sub: 'of U.S. consumers', src: 'pymnts-2023' }
      ]
    },
    {
      id: 'cost', num: '02', title: 'Every error costs more than the error', sub: 'And the most common error is a time punch.',
      hero: { value: '$291', caption: 'average cost to fix one payroll error, direct and indirect', src: 'ey-2022' },
      tiles: [
        { label: 'Payroll accuracy rate', value: '80.15%', sub: 'about 1 in 5 payrolls has an error', src: 'ey-2022' },
        { label: 'Time & attendance errors', value: '1,139', sub: 'per 1,000 employees per year', src: 'ey-2022-ta' },
        { label: 'Missing or wrong punches', value: '$78.7K', sub: 'per 1,000 employees per year', src: 'ey-2022-punches' },
        { label: 'To resolve one payroll error', value: '2.19', sub: 'business days', src: 'bloomberg-2019-days' },
        { label: 'Fixing punches', value: '26 min', sub: 'of staff time per employee per year', src: 'ey-2022-minutes' }
      ],
      table: { title: 'What the EY rates imply at your headcount', cols: ['Workers on assignment', 'Time & attendance errors / yr', 'Cost of those errors / yr', 'Staff time on punches / yr'], rows: [['500', '570', '$124K', '217 h'], ['2,000', '2,278', '$497K', '867 h'], ['10,000', '11,390', '$2.49M', '4,333 h']], note: 'EY 2022 rates: 1,139 errors and $248,735 per 1,000 employees per year; 26 minutes per employee.', src: 'ey-2022-ta' },
      paras: [
        'Time and attendance is the single most common category of payroll error, occurring more than once per employee per year [ey-2022-ta]. Missing or incorrect punches alone cost about $78,700 per 1,000 employees per year [ey-2022-punches], and each error takes more than two business days to resolve [bloomberg-2019-days] — usually after the worker has already noticed.'
      ]
    },
    {
      id: 'compliance', num: '03', title: 'The enforcement bill keeps coming', sub: 'Back wages, penalties, and a rule set that changes every January.',
      hero: { value: '$259M', caption: 'in back wages recovered by the U.S. Department of Labor in FY2025, for 176,957 workers', src: 'dol-whd-2025' },
      chart: { type: 'line', title: 'Back wages recovered by the Wage and Hour Division, all acts', unit: '$M', labels: ['FY13', 'FY14', 'FY15', 'FY16', 'FY17', 'FY18', 'FY19', 'FY20', 'FY21', 'FY22', 'FY23', 'FY24', 'FY25'], values: [250.0, 240.8, 246.8, 266.6, 270.4, 304.9, 322.5, 257.8, 234.4, 213.2, 212.3, 202.7, 259.3], src: 'dol-whd-series' },
      chart2: { type: 'bar', title: 'PAGA notices filed in California', unit: '', labels: ['2013', '2014', '2018', '2023', '2025'], values: [1606, 4530, 5732, 7780, 10098], emphasis: 4, src: 'paga-series' },
      tiles: [
        { label: 'FLSA investigations that found violations', value: '80%', sub: 'concluded FY2019', src: 'gao-2020' },
        { label: 'Jurisdictions that changed wage floors on Jan 1, 2025', value: '69', sub: '88 over the full year', src: 'nelp-2025' },
        { label: 'Chicago Fair Workweek fine', value: '$300–500', sub: 'per employee, per violation, per day', src: 'chicago-fww' }
      ],
      paras: [
        'Enforcement is not slowing down. In FY2025 the Wage and Hour Division recovered more than $259 million for 176,957 workers [dol-whd-2025], and 80% of concluded FLSA investigations found a minimum-wage or overtime violation [gao-2020]. In California, PAGA notices reached a record 10,098 in 2025 [paga-series].',
        'The rules themselves move under you: wage floors changed in 69 jurisdictions on a single day in 2025 [nelp-2025], and predictive-scheduling ordinances fine per employee, per violation, per day [chicago-fww]. Every one of those is a rule that has to be applied to a timesheet before payroll runs.'
      ]
    },
    {
      id: 'timedata', num: '04', title: 'The root cause is the timesheet', sub: 'One in six time submissions arrives with an error.',
      hero: { value: '1 in 6', caption: 'time-worked submissions contains an error (83.35% arrive error-free)', src: 'bloomberg-2019' },
      chart: { type: 'stack', title: 'How employers receive time-worked data', unit: '%', labels: ['All electronic', '75–99.9% electronic', 'Less electronic', 'All paper'], values: [60.6, 27.2, 6.8, 5.4], src: 'bloomberg-2019-paper' },
      tiles: [
        { label: 'Timesheets that have to be corrected', value: '80%', sub: 'employer-reported', src: 'qb-time-2017' },
        { label: 'U.S. businesses tracking time manually', value: '38%', sub: 'punch cards, paper timesheets', src: 'qb-time-2018-manual' },
        { label: 'Employees who admit buddy punching', value: '16%', sub: '$373M a year', src: 'qb-time-2018' }
      ],
      paras: [
        'Payroll errors start upstream, in the time data. Only 83.35% of time-worked submissions arrive error-free [bloomberg-2019], employers report correcting 80% of timesheets [qb-time-2017], and 38% of U.S. businesses still track time with punch cards or paper [qb-time-2018-manual]. A staffing firm inherits a different one of these systems at every client site.'
      ]
    },
    {
      id: 'economics', num: '05', title: 'Thin margins, long collections, a shrinking pie', sub: 'You pay the worker this week and collect from the client in seven.',
      hero: { value: '52 days', caption: 'days sales outstanding at ManpowerGroup, FY2024', src: 'manpower-10k' },
      chart: { type: 'bar', title: 'U.S. staffing sales by year', unit: '$B', labels: ['2023', '2024', '2025'], values: [142.5, 124.0, 113.5], emphasis: 2, src: 'asa-2026' },
      tiles: [
        { label: 'U.S. staffing market, 2026 forecast', value: '$180B', sub: 'vs $244B peak in 2022', src: 'sia-2026' },
        { label: 'Healthcare staffing revenue, 2025', value: '$39.4B', sub: 'down 6%', src: 'sia-hc-2026' },
        { label: 'Temp and contract workers on assignment', value: '2.2M', sub: 'in an average week', src: 'asa-stats-2025' },
        { label: 'Staffing firms that grew revenue in 2025', value: '56%', sub: 'vs 40% in 2024', src: 'bullhorn-2026' }
      ],
      paras: [
        'Staffing sales fell for a third straight year to $113.5 billion in 2025 [asa-2026], and the market sits a quarter below its 2022 peak [sia-2026]. Cash is the constraint: a large firm waits 52 days to collect [manpower-10k] while paying workers weekly. Every billing dispute stretches that gap, and every payroll error becomes a billing dispute.',
        'The firms that grew did it on execution. 56% of firms grew revenue in 2025 against 40% the year before, and the ones using AI in the process were 3.5–4.5 times more likely to be among them [bullhorn-2026].'
      ]
    },
    {
      id: 'turnover', num: '06', title: 'Turnover is the P&L', sub: 'Healthcare pays $60,090 per nurse. Light industrial refills the whole roster.',
      hero: { value: '$60,090', caption: 'average cost of turnover for one bedside RN', src: 'nsi-2026' },
      chart: { type: 'line', title: 'Hospital staff RN turnover, by calendar year', unit: '%', labels: ['2021', '2022', '2023', '2024', '2025'], values: [27.1, 22.5, 18.4, 16.4, 17.6], src: 'nsi-2026-turnover' },
      tiles: [
        { label: 'Newly hired RNs who leave within a year', value: '22.7%', sub: 'first year is 29% of RN separations', src: 'nsi-2026-firstyear' },
        { label: 'One point of RN turnover', value: '$295K', sub: 'per hospital, per year', src: 'nsi-2026-point' },
        { label: 'Light-industrial fill rate, traditional staffing', value: '46%', sub: 'worker turnover 75–95%', src: 'traba-2024' },
        { label: 'Industry-average fill rate', value: '65%', sub: 'platform claim: over 90%', src: 'instawork-2026' }
      ],
      paras: [
        'RN turnover rose again in 2025 to 17.6%, reversing three years of improvement [nsi-2026-turnover]; nearly a quarter of new nurses leave inside a year [nsi-2026-firstyear], and each point of turnover is worth $295,000 a year to one hospital [nsi-2026-point]. In light industrial the numbers are blunter: traditional firms fill 46% of requests and turn over most of the roster every year [traba-2024].'
      ]
    },
    {
      id: 'reliability', num: '07', title: 'Reliability is measurable, and it compounds', sub: 'What a million validated shifts a month look like.',
      hero: { value: '11.5%', caption: 'of shifts are no-shows across healthcare and light-industrial staffing, Q2 2026', src: 'ht-report-2026' },
      chart: { type: 'grouped', title: 'Why workers arrive late, share of late arrivals', unit: '%', labels: ['Left too late', 'Long stop', 'Traffic', 'Last-minute assignment', 'Drive detour'], series: [{ name: 'Healthcare', values: [46.7, 16.9, 8.2, 13.1, 10.2] }, { name: 'Light industrial', values: [41.0, 16.1, 18.6, 7.1, 11.7] }], src: 'ht-report-2026' },
      tiles: [
        { label: 'Arriving workers on time', value: '74.2%', sub: '21.9% late, 3.9% unverifiable', src: 'ht-report-2026' },
        { label: 'Visibility by month 11 after go-live', value: '94%', sub: 'from 64% at go-live', src: 'ht-report-2026' },
        { label: 'Shifts validated', value: '~1M', sub: 'per month', src: 'ht-report-2026' },
        { label: 'Fastest-growing platforms, median compounded growth', value: '140%', sub: 'HyperTrack-powered, while the market shrank', src: 'ht-internal-2026' }
      ],
      paras: [
        'HyperTrack validates time and attendance for roughly a million shifts a month. In Q2 2026, 74.2% of arriving workers were on time and 11.5% of shifts were no-shows; roughly half of all lateness starts at home, before the commute [ht-report-2026]. The same ground truth that scores a shift is what settles its timesheet.',
        'The platforms growing fastest through a shrinking market run on this data [ht-internal-2026]. They pay right the first cycle, so workers come back, so fill rates hold, so clients stay.'
      ]
    },
    {
      id: 'closeout', num: '08', title: 'Pay right the first cycle', sub: 'What Closeout does with your pay cycle, this week.',
      live: true,
      paras: [
        'Connect the systems your sites already use. Every shift in the pay cycle is checked against every rule that applies to it — state, city, contract, facility, and yours — before payroll runs. Every discrepancy names the rule and the source clause. What is right goes out on time; what is wrong is fixed before a worker sees it.'
      ],
      cta: { label: 'Connect your systems →', tab: 'connect' }
    }
  ]
};
