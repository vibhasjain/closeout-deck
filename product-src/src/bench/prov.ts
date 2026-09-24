export interface RuleProvenance {
  doc: string
  url?: string
  verbatim?: string
  summary?: string
  dates?: string
}

export const PROV: Record<string, RuleProvenance> = {
  'CA-MB-01': { doc:'IWC Wage Order 5-2001 §11(A)', url:'https://www.dir.ca.gov/dlse/faq_mealperiods.htm', verbatim:'No employer shall employ any person for a work period of <span class="hl-cite">more than five (5) hours without a meal period of not less than 30 minutes</span>, except that when a work period of not more than six (6) hours will complete the day’s work the meal period may be waived by mutual consent of the employer and the employee', dates:'Effective 2001 to current' },
  'CA-OT-8': { doc:'California Labor Code §510(a)', url:'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=LAB&sectionNum=510', verbatim:'Eight hours of labor constitutes a day’s work. <span class="hl-cite">Any work in excess of eight hours in one workday</span> and any work in excess of 40 hours in any one workweek and the first eight hours worked on the seventh day of work in any one workweek <span class="hl-cite">shall be compensated at the rate of no less than one and one-half times the regular rate of pay</span>.', dates:'Effective 2000 to current' },
  'TB-ROUND-7': { doc:'29 CFR 785.48(b)', url:'https://www.ecfr.gov/current/title-29/section-785.48', verbatim:'…Recording the employees’ starting time and stopping time to <span class="hl-cite">the nearest 5 minutes, or to the nearest one-tenth or quarter of an hour</span>. … This practice of computing working time will be accepted, provided that it is used in such a manner that <span class="hl-cite">it will not result, over a period of time, in failure to compensate the employees properly</span> for all the time they have actually worked.' },
  'CA-ROUND-0': { doc:'Camp v. Home Depot U.S.A., Inc. (Cal. Ct. App. 2022)', url:'https://law.justia.com/cases/california/court-of-appeal/2022/h049033.html', summary:'An employer that can and does capture the exact time worked must pay for all of it — quarter-hour rounding rejected where exact capture exists', dates:'2022 to current (CA)' },
  'FED-OT-40': { doc:'FLSA §7 · 29 CFR part 778', url:'https://www.dol.gov/agencies/whd/fact-sheets/23-flsa-overtime', summary:'Hours over 40 in the defined workweek are paid at one and one-half times the regular rate; the workweek is a fixed, recurring 168-hour period', dates:'As amended to current' },
  'FED-RR-01': { doc:'29 CFR 778.207(b)', url:'https://www.ecfr.gov/current/title-29/section-778.207', summary:'Night and weekend differentials and other non-discretionary premiums are part of the regular rate, so overtime is 1.5× base plus differential', dates:'As amended to current' },
  'SRC-VMS-01': { doc:'Ops heuristic · staffing reconciliation', summary:'Pay runs from the ATS and the invoice from the hours the client approved in their VMS or time clock; when they differ, one of them is wrong before either goes out' },
  'SRC-MISS-01': { doc:'Ops heuristic · staffing reconciliation', summary:'A time entry the client’s clock recorded but the ATS never received goes unpaid unless it is added before Payroll' },
  'SRC-WEEK-01': { doc:'29 CFR 778.104', url:'https://www.ecfr.gov/current/title-29/section-778.104', summary:'Each workweek stands alone for overtime; hours worked in one week cannot be moved into the next' },
  'CON-MARGIN-01': { doc:'Ops heuristic · rate cards', summary:'A bill rate below pay plus employer burden loses money on every hour billed' },
  'NY-SOH-01': { doc:'12 NYCRR 142-2.4 (spread of hours)', url:'https://dol.ny.gov/minimum-wage-0', summary:'A workday whose interval from start to end exceeds 10 hours earns one additional hour of pay at the basic minimum hourly wage', dates:'Rates updated Dec 31 yearly' },
  'REST-GAP-01': { doc:'Seattle SMC 14.22 · NYC Fair Workweek · Chicago MCC 6-110', url:'https://www.seattle.gov/laborstandards/ordinances/secure-scheduling', summary:'Working inside the protected rest window between closing and opening owes premium pay; the window is 9–11 hours depending on jurisdiction' },
  'CHI-FWW-01': { doc:'Chicago MCC 6-110 (Fair Workweek)', url:'https://www.chicago.gov/city/en/depts/bacp/supp_info/fairworkweek.html', summary:'Employer-initiated schedule changes inside the 14-day notice window owe one hour of predictability pay at the regular rate', dates:'Effective 2020 to current' },
  'CA-SS-01': { doc:'IWC Wage Orders §4(C)', url:'https://www.dir.ca.gov/dlse/faq_splitshifts.htm', summary:'Splitting the day with an unpaid gap owes one hour at minimum wage, offset by wages earned above the minimum for the day', dates:'Effective 2001 to current' },
  'CA-RT-01': { doc:'IWC Wage Orders §5 (reporting time)', url:'https://www.dir.ca.gov/dlse/faq_reportingtimepay.htm', summary:'A worker who reports and is furnished less than half the scheduled hours is paid half the schedule — no less than 2 and no more than 4 hours', dates:'Effective 2001 to current' },
  'CON-MIN-4H': { doc:'Staffing services agreement §5 (LGC-pattern)', url:'https://lgcassociates.com/wp-content/uploads/2023/04/LGC-Staffing-Services-Agreement-July-2021.pdf', summary:'Each worker who reports as scheduled is billed and paid a minimum of four hours' },
  'CON-SUTTER-01': { doc:'Pacific Cold Storage MSA §4.2 (customer overlay)', summary:'Orientation hours pay the training rate and bill zero to the client' },
  'TW-1187': { doc:'Slack · Sam T. · Mon Aug 24, 9:12 AM', summary:'No overtime at Mercy General this week please. Compiled to a scoped, auto-expiring hold rule.', dates:'Aug 24 to Aug 30 (auto-expires)' },
  'FAC-AUTODED-01': { doc:'Quickley v. Univ. of Maryland Medical System (D. Md.)', url:'https://www.fisherphillips.com/en/insights/publication/automatically-deducting-for-meal-breaks-can-be-costly.html', summary:'Auto-deducting meal periods without a reliable way to cancel the deduction when the break is missed creates FLSA class exposure' },
  'FAC-GEO-01': { doc:'Site profile · geofence policy', summary:'Punches must be accompanied by location evidence inside the site geofence; unmatched punches route to review' },
  'FAC-BADGE-01': { doc:'Bayview site profile', summary:'No GPS indoors; door-badge events are the location evidence of record' },
  'CS-01': { doc:'Ops heuristic · interview synthesis', summary:'Two clock-ins minutes apart on a shared kiosk are one time entry. Merge, don’t double-pay.' },
  'TS-COMPLETE': { doc:'Ops heuristic · interview synthesis', summary:'Zero hours on an active day, 30+ hours of OT, a missed punch — the missed punch is the most common discrepancy across all seven interviews' },
  'CS-16H': { doc:'Timesheet-fraud audit guides', url:'https://onpay.com/insights/timesheet-fraud-prevention/', summary:'A time entry beyond the plausible-length cap is presumed a missed clock-out; hold rather than pay' },
  'CS-OVLP': { doc:'Cross-facility identity heuristic', summary:'Interval intersection across facilities for one identity is a data error or fraud; both time entries hold' },
  'CS-SPEED': { doc:'GPS audit heuristic', url:'https://smartbarrel.io/blog/how-to-eliminate-timesheet-fraud/', summary:'Consecutive punches at different sites must be reachable at road speed' },
  'CS-EXACT': { doc:'Payroll-fraud detection guides', url:'https://onpay.com/insights/timesheet-fraud-prevention/', summary:'Streaks of identical exact durations indicate hand-entered time' },
  'CS-EDIT': { doc:'Wage-theft litigation pattern', summary:'Changes to a time entry after approval re-trigger review and land in the immutable audit log' },
  'VER-HC-01': { doc:'Healthcare', summary:'Handoff overlap up to 15 minutes is expected, paid time' },
  'VER-EV-02': { doc:'Events', summary:'Post-event egress up to ~45 minutes is expected; beyond that the evidence is read, and a human decides' },
};

export const SCOPE_TEXT: Record<string, string> = {
  'CS-01':'All time entries', 'TS-COMPLETE':'All time entries', 'CS-16H':'All time entries', 'CS-OVLP':'All time entries', 'CS-SPEED':'All time entries', 'CS-EXACT':'All time entries', 'CS-EDIT':'All time entries', 'FED-OT-40':'All time entries', 'FED-RR-01':'Time entries with a differential', 'SRC-VMS-01':'Time entries with client-approved hours', 'SRC-MISS-01':'Time entries in a client clock', 'SRC-WEEK-01':'Overnight time entries', 'CON-MARGIN-01':'Orders with a bill rate',
  'FAC-GEO-01':'Sites with geofences', 'FAC-BADGE-01':'Bayview Warehouse', 'FAC-AUTODED-01':'Mercy General',
  'CA-ROUND-0':'California time entries', 'CA-MB-01':'California time entries', 'CA-OT-8':'California time entries', 'CA-SS-01':'California time entries', 'CA-RT-01':'California time entries',
  'TB-ROUND-7':'Time entries outside California', 'NY-SOH-01':'New York time entries', 'REST-GAP-01':'New York, Chicago, Seattle and Philadelphia time entries', 'CHI-FWW-01':'Chicago time entries',
  'CON-MIN-4H':'Time entries with a contractual minimum', 'CON-SUTTER-01':'Pacific Cold Storage', 'TW-1187':'Mercy General this week', 'VER-HC-01':'Healthcare time entries', 'VER-EV-02':'Event time entries',
};
