import { FACILITIES, fmtT } from './engine.js'

/** When a source usually sends: nightly, or weekly on `day` (0 is Sunday), at `at` minutes past midnight. */
export interface SendSchedule { day?: number; at: number }

export interface Source {
  id: string
  name: string
  short: string
  tile?: string
  icon?: string
  mark?: string
  builtin?: boolean
  group: string
  status: string
  method: string
  sites: string[]
  pulls: string[]
  lastSync: string | null
  sends?: SendSchedule
}

export interface Destination {
  id: string
  name: string
  tile?: string
  group: string
  status: string
  method: string
  sites: string[]
  format: string
  lastSync: string | null
}

const L = import.meta.env.BASE_URL + 'logos/'
const TIME_PULLS = ['Punches','Schedules','Meal punches','Timecard edits'];
export const SOURCES: Source[] = [
  { id:'ukg-ready', name:'UKG', short:'UKG', tile:L+'ukg.svg', status:'connected', method:'API', sites:['Pacific Cold Storage'], sends:{ at:4 * 60 } },
  { id:'adp-wfn', name:'ADP Workforce Now', short:'ADP WFN', tile:L+'adp.jpg', status:'connected', method:'Export · nightly', sites:['Mercy General', 'Lonestar Packaging'], sends:{ at:2 * 60 } },
  { id:'ubeya', name:'Ubeya', short:'Ubeya', tile:L+'ubeya.svg', status:'connected', method:'API', sites:['Northbank Arena'], sends:{ at:3 * 60 } },
  { id:'7shifts', name:'7shifts', short:'7shifts', tile:L+'7shifts.png', status:'connected', method:'API', sites:['Wicker Park Kitchen'], sends:{ at:3 * 60 } },
  { id:'paylocity', name:'Paylocity', short:'Paylocity', tile:L+'paylocity.svg', status:'connected', method:'API', sites:['Harbor Point Hotel'], sends:{ at:5 * 60 } },
  { id:'tempworks', name:'TempWorks', tile:L+'tempworks.png' },
  { id:'avionte', name:'Avionté', tile:L+'avionte.svg' },
  { id:'wheniwork', name:'When I Work', tile:L+'when-i-work.svg' },
  { id:'wallclock', name:'Facility wall clock', short:'Wall clock', icon:'clock', group:'Facility', status:'connected', method:'Email · xlsx', sites:['Bayview Warehouse'], pulls:['Punches','Badge reader events'], sends:{ day:0, at:23 * 60 } },
  { id:'paper', name:'Paper sign-in sheet', icon:'camera', group:'Facility', method:'Photo', pulls:['Names','Work dates','Signed hours'] },
  { id:'qr', name:'QR kiosk', icon:'qr', group:'Facility', method:'Browser kiosk', pulls:['Punches','Site check-ins'] },
  { id:'hypertrack', name:'HyperTrack location', mark:import.meta.env.BASE_URL+'logo-small.svg', group:'Location', status:'connected', method:'Built in', builtin:true, sites:Object.values(FACILITIES).map(f=>f.name), pulls:['Geofence enter/exit','Route','Badge reader (Bayview)'] },
  { id:'upload', name:'Upload a time export', icon:'upload', group:'Manual', method:'CSV · PDF · XLSX', pulls:['Names','Sites','Work dates','Punches'] },
].map(s=>({group:'Time & attendance', status:'available', method:'API', sites:[], pulls:TIME_PULLS, short:s.name, ...s, lastSync:s.status==='connected'?fmtT(4 * 60 + 10):null}));
export const DESTS: Destination[] = [
  {id:'adp', name:'ADP', tile:L+'adp.jpg', status:'connected', format:'ADP WFN hours import'},
  {id:'gusto', name:'Gusto', tile:L+'gusto.jpg'},
  {id:'paychex', name:'Paychex', tile:L+'paychex.jpg'},
  {id:'paylocity', name:'Paylocity', tile:L+'paylocity.svg'},
  {id:'rippling', name:'Rippling', tile:L+'rippling.svg'},
  {id:'workday', name:'Workday', tile:L+'workday.jpg'},
  {id:'quickbooks', name:'QuickBooks', tile:L+'quickbooks.jpg', group:'Billing', status:'connected', format:'QuickBooks hours export'},
  {id:'netsuite', name:'NetSuite', tile:L+'netsuite.jpg', group:'Billing'},
  {id:'bullhorn', name:'Bullhorn', tile:L+'bullhorn.jpg', group:'Billing'},
  {id:'sap', name:'SAP', tile:L+'sap.jpg', group:'Billing'},
  {id:'dailypay', name:'DailyPay', tile:L+'dailypay.jpg', group:'Earned wage access'},
  {id:'branch', name:'Branch', tile:L+'branch.jpg', group:'Earned wage access'},
  {id:'zeal', name:'Zeal', tile:L+'zeal.svg', group:'Earned wage access'},
].map(d=>({group:'Payroll', status:'available', method:'API', sites:['All sites'], format:'Approved hours import', ...d, lastSync:d.status==='connected'?fmtT(4 * 60 + 10):null}));

export function sourceFor(fac: string): Source | undefined {
  const facility = FACILITIES[fac]
  if (!facility) return undefined
  return SOURCES.find(v => v.sites.includes(facility.name) && !v.builtin && v.id !== 'upload')
}
