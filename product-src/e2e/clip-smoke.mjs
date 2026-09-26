import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { startOfflineServer } from './clip-smoke-server.mjs'
import { inspectSurface } from './clip-smoke-checks.mjs'
import { selfcheck } from './clip-smoke-selfcheck.mjs'
import { allowlist } from './clip-smoke-allowlist.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = dirname(here)
const require = createRequire(join(root, 'package.json'))
const started = performance.now()
const failuresDir = join(here, 'clip-smoke-failures')
const reportPath = join(here, 'clip-smoke-report.json')
const viewports = [{ width: 1440, height: 1080 }, { width: 1440, height: 900 }, { width: 390, height: 844 }]
const report = { schema: 1, startedAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  viewports, surfaces: [], failures: [], allowed: [], blockedRequests: [], allowlist, runtimeSeconds: 0 }
const firm = { name: 'Summit Staffing', domain: 'sample', summary: 'Warehouse staffing in California and Texas.', states: ['CA', 'TX'], verticals: ['Warehouse'], clientTypes: ['Distribution'], size: '2,047 workers', staffing: true }
const completed = { forwarded: true, setupStep: 'ready', kickoffPending: false, setupRequest: null, timezone: 'America/New_York', firm,
  covered: ['calendar', 'workerHours', 'clientHours', 'whoseHours', 'rates', 'complaints', 'authority'],
  profile: { workerHours: 'Workers clock in with UKG.', clientHours: 'Supervisors approve time each week.', ratesWhere: 'The client contracts.', whoseHours: 'Ask me when the hours disagree.', complaints: 'Ask the supervisor before changing pay.' },
  authorityConfigured: true, authority: { autoFix: true, limit: 100, weeklyCap: 1000, textSupervisors: true, textWorkers: false, briefing: 'Email' },
  neverContact: ['Alex Morgan'], connections: {} }
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
let browser, vite, api, temp
let stopRequested = false
// No keys are passed to the server, Vite env files are disabled, and all browser
// requests outside this test's loopback origins are intercepted before transmission.
async function finish() {
  await browser?.close().catch(() => {})
  await vite?.close().catch(() => {})
  await api?.close().catch(() => {})
  if (temp) await rm(temp, { recursive: true, force: true })
}
const watchdog = setTimeout(() => {
  stopRequested = true
  report.failures.push({ kind: 'harness', reason: 'Smoke exceeded the 175-second execution budget.' })
  void browser?.close()
}, 175_000)
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stopRequested = true; void browser?.close() })

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
}

async function capture(page, failure, stem) {
  const target = page.locator(failure.selector).first()
  if (await target.count()) {
    await target.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {})
    const previous = await target.evaluate(el => {
      const style = el.getAttribute('style')
      el.style.setProperty('outline', '3px solid #e00045', 'important')
      el.style.setProperty('outline-offset', '2px', 'important')
      return style
    })
    try {
      const box = await target.boundingBox()
      const viewport = page.viewportSize()
      const x = Math.max(0, (box?.x ?? 0) - 10), y = Math.max(0, (box?.y ?? 0) - 10)
      const width = Math.min(viewport.width - x, (box?.width ?? viewport.width) + 20)
      const height = Math.min(viewport.height - y, (box?.height ?? viewport.height) + 20)
      const filename = `${stem}.png`
      await page.screenshot({ path: join(failuresDir, filename), animations: 'disabled',
        ...(width > 0 && height > 0 ? { clip: { x, y, width, height } } : {}) })
      return `clip-smoke-failures/${filename}`
    } finally {
      await target.evaluate((el, style) => style === null ? el.removeAttribute('style') : el.setAttribute('style', style), previous).catch(() => {})
    }
  }
  const filename = `${stem}.png`
  await page.screenshot({ path: join(failuresDir, filename), animations: 'disabled' })
  return `clip-smoke-failures/${filename}`
}

async function check(page, surface, expected) {
  if (expected) await page.locator(expected).first().waitFor({ state: 'visible' })
  await settle(page)
  const viewport = `${page.viewportSize().width}x${page.viewportSize().height}`
  const result = await page.evaluate(inspectSurface)
  const entry = { surface, viewport, url: page.url(), ...result.stats, failures: 0 }
  const screenshots = new Map()
  for (const failure of result.failures) {
    const full = { surface, viewport, ...failure }
    const allowed = allowlist.find(item => ['surface', 'viewport', 'kind', 'element', 'reason'].every(key => item[key] === full[key]))
    if (allowed) { assert(allowed.justification?.trim()); report.allowed.push({ ...full, justification: allowed.justification }); continue }
    if (!screenshots.has(failure.selector)) {
      screenshots.set(failure.selector, await capture(page, failure, `${viewport}-${slug(surface)}-${screenshots.size + 1}`))
    }
    full.screenshot = screenshots.get(failure.selector)
    report.failures.push(full)
    entry.failures++
  }
  report.surfaces.push(entry)
  console.log(`${viewport} ${surface}: ${entry.failures ? `${entry.failures} FAIL` : 'OK'}`)
}

async function scenario(page, surface, fn) {
  const before = report.surfaces.length
  try { await fn() }
  catch (error) {
    if (stopRequested) throw error
    const viewport = `${page.viewportSize().width}x${page.viewportSize().height}`
    const failure = { surface, viewport, kind: 'coverage', reason: error.message, selector: 'body' }
    failure.screenshot = await capture(page, failure, `${viewport}-${slug(surface)}-coverage`).catch(() => undefined)
    report.failures.push(failure)
    report.surfaces.push({ surface, viewport, failures: 1, covered: false })
    console.error(`${viewport} ${surface}: COVERAGE FAILURE ${error.message.split('\n')[0]}`)
  }
  assert(report.surfaces.length > before, `${surface} must record a check`)
}

try {
  await rm(failuresDir, { recursive: true, force: true })
  await mkdir(failuresDir, { recursive: true })
  temp = await mkdtemp(join(tmpdir(), 'clip-smoke-vite-'))
  api = await startOfflineServer()
  const { createServer } = await import('vite')
  vite = await createServer({ root, envDir: temp, cacheDir: join(temp, 'vite-cache'), clearScreen: false, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false, open: false, proxy: {
      '/api': { target: api.apiOrigin, changeOrigin: true, rewrite: path => path.replace(/^\/api/, ''),
        configure(proxy) { proxy.on('proxyReq', req => req.removeHeader('origin')) } },
    } },
    plugins: [{ name: 'clip-smoke-offline-html', transformIndexHtml: {
      order: 'post', handler(html) {
        return html.replace(/<link\b[^>]*(?:https?:)?\/\/[^>]*>/gi, '').replace(/<script src="\/job\/config.js"><\/script>/, '')
      },
    } }],
  })
  await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  let playwrightPath
  try { playwrightPath = require.resolve('playwright') }
  catch { playwrightPath = createRequire('/Users/vibes/.claude/plugins/cache/dev-browser-marketplace/dev-browser/b549fb0ecf9f/skills/dev-browser/package.json').resolve('playwright') }
  const { chromium } = require(playwrightPath)
  browser = await chromium.launch({ headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-sync', '--no-first-run', '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'] })
  report.browser = browser.version()
  report.detectorSelfCheck = await selfcheck(browser)
  const identity = await api.seedIdentity({ email: 'clip-smoke@hypertrack.io', doc: completed })
  const cycles = identity.cycles
  const review = cycles.find(cycle => cycle.sample && cycle.runAt) ?? cycles.find(cycle => cycle.status === 'needs-review')
  assert(review, 'Real sample seeding must produce a review cycle')
  const cycleId = review.id
  const payload = await api.request(identity.session, `/data/cycles/${cycleId}`)
  const shiftId = payload.week[0]?.id
  assert(shiftId, 'Sample cycle must have a time entry')
  await api.request(identity.session, '/chat/history', { method: 'POST', body: { messages: [{ id: 'clip-smoke-findings', role: 'agent', text: 'Review these issues.', at: Date.now(), cards: [{ kind: 'findings', cycleId }] }] } })
  report.fixture = { cycleId, shiftId, entries: payload.week.length }

  async function newPage(viewport, session) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block', timezoneId: 'America/New_York', locale: 'en-US' })
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin === origin || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
      report.blockedRequests.push({ url: url.origin + url.pathname, type: route.request().resourceType() })
      return route.abort('blockedbyclient')
    })
    await context.addInitScript(session => {
      if (location.protocol === 'http:') localStorage.setItem('closeout:session:v1', JSON.stringify(session))
    }, session)
    const page = await context.newPage()
    page.setDefaultTimeout(7000)
    page.on('pageerror', error => report.failures.push({ kind: 'browser-error', viewport: `${viewport.width}x${viewport.height}`, reason: error.message, url: page.url() }))
    return page
  }
  const goto = async (page, path, expected) => {
    await page.goto(`${origin}/product${path}`, { waitUntil: 'domcontentloaded' })
    await page.locator(expected).first().waitFor({ state: 'visible' })
    await settle(page)
  }

  for (const viewport of viewports) {
    const page = await newPage(viewport, identity.session)
    await scenario(page, 'Payroll Review', async () => {
      await goto(page, `/payroll?cycle=${cycleId}&step=review`, '.payroll-head')
      await check(page, 'Payroll Review', '.payroll-summary')
      await check(page, 'Next-step row', '[aria-label="Next step"]')
    })
    await scenario(page, 'Payroll Collect', async () => {
      await page.getByRole('button', { name: 'Collect', exact: true }).click()
      await check(page, 'Payroll Collect', '.intake')
    })
    await scenario(page, 'Timesheets', async () => {
      const href = await page.getByRole('link', { name: 'Timesheets', exact: true, includeHidden: true }).getAttribute('href')
      assert(href)
      await goto(page, href.replace(/^\/product/, ''), '.payroll-head')
      await check(page, 'Timesheets', '.intake')
    })
    await scenario(page, 'Time-entry sheet', async () => {
      await goto(page, `/payroll/${shiftId}?cycle=${cycleId}&step=review`, '.shift-page:not([data-shift-pending])')
      await check(page, 'Time-entry sheet', '[aria-label="Time entry evidence"]')
    })
    for (const [surface, path, expected] of [['Rules', '/rules', '.rules-sheet'], ['Profile', '/profile', '.payroll-profile-editor'], ['Settings', '/settings', '.source-tile']]) {
      await scenario(page, surface, async () => {
        await goto(page, path, expected)
        await check(page, surface)
        if (surface === 'Profile') {
          // Profile has no header Rulebook button (the Rules tab owns rules); its permissions section opens the modal.
          const opener = page.getByRole('button', { name: 'Edit in Rulebook', exact: true })
          try { await opener.scrollIntoViewIfNeeded({ timeout: 1000 }); await opener.click({ timeout: 1000 }) }
          catch (error) {
            // Preserve a real pointer obstruction as a failure, then exercise the
            // same control with a keyboard so modal coverage is still complete.
            const failure = { surface: 'Profile Rulebook opener', viewport: `${viewport.width}x${viewport.height}`,
              kind: 'obstructed-control', selector: '#profile-authority .btn', reason: error.message }
            failure.screenshot = await capture(page, failure, `${failure.viewport}-profile-rulebook-opener`)
            report.failures.push(failure)
            await opener.focus()
            await opener.press('Enter')
          }
          await check(page, 'Rulebook modal', '.profile-modal')
          const sections = page.locator('.rulebook-rail button')
          for (let index = 0; index < await sections.count(); index++) {
            const title = await sections.nth(index).innerText()
            await sections.nth(index).click()
            await check(page, `Rulebook ${title}`, '.profile-modal')
          }
          await page.getByRole('button', { name: 'Done', exact: true }).click()
        }
        if (surface === 'Settings') {
          const tiles = page.locator('.source-tile')
          const count = await tiles.count()
          assert(count > 0, 'Settings must contain connector tiles')
          for (let index = 0; index < count; index++) {
            const name = await tiles.nth(index).getAttribute('aria-label')
            await scenario(page, `Connect ${name}`, async () => {
              await tiles.nth(index).click()
              await check(page, `Connect ${name}`, '.connect-method-option')
              await page.locator('.modal').getByRole('button', { name: 'Close', exact: true }).click()
              await page.locator('.modal').waitFor({ state: 'detached' })
            })
          }
        }
      })
    }
    await scenario(page, viewport.width === 390 ? 'Phone drawer and account' : 'Account menu', async () => {
      await goto(page, '/settings', '.source-tile')
      if (viewport.width === 390) {
        await page.getByRole('button', { name: 'Open sidebar' }).click()
        await check(page, 'Phone drawer and account', '[aria-label="Navigation"]')
      } else {
        await page.getByRole('button', { name: 'Account menu', exact: true }).click()
        await check(page, 'Account menu', '[role="menu"]')
      }
    })
    await scenario(page, 'Issues in chat and Evidence', async () => {
      await goto(page, `/payroll?cycle=${cycleId}&step=review&agent=1`, '.journey-finding[data-active="true"]')
      const slides = await page.locator('.journey-finding').count()
      assert(slides > 0, 'Sample must contain issue slides')
      for (let index = 0; index < slides; index++) {
        const active = page.locator('.journey-finding[data-active="true"]')
        await active.scrollIntoViewIfNeeded()
        await check(page, `Issues slide ${index + 1} of ${slides}`, '.journey-finding[data-active="true"]')
        if (index === 0) {
          await active.getByRole('button', { name: 'Evidence', exact: true }).click()
          await check(page, 'Evidence', '.drawer[aria-modal="true"]')
          await page.getByRole('button', { name: 'Close drawer' }).click()
          await page.locator('.drawer:not(.agent-panel)').waitFor({ state: 'detached' })
        }
        if (index + 1 < slides) {
          await page.getByRole('button', { name: 'Next finding' }).click()
          await page.locator(`.journey-finding:nth-child(${index + 2})[data-active="true"]`).waitFor()
        }
      }
    })
    await page.context().close()

    const fresh = await api.seedIdentity({ email: `clip-onboard-${viewport.width}-${viewport.height}@hypertrack.io`, doc: {}, sample: false })
    for (const [surface, patch, expected] of [
      ['welcome', { setupStep: 'welcome' }, '.setup-welcome'],
      ['basics', { setupStep: 'basics' }, '.setup-basics'],
      ['question', { setupStep: 'conversation', setupHistory: [{ question: 'How do workers send you their hours?', card: { kind: 'question', input: 'chips', topics: ['workerHours'], chips: ['Time clock', 'Spreadsheet', 'Email or text'] } }] }, '.setup-question[data-input="chips"]'],
      ['calendar question', { setupStep: 'conversation', setupHistory: [{ question: 'What is your pay calendar?', card: { kind: 'question', input: 'calendar', topics: ['calendar'] } }] }, '.setup-question[data-input="calendar"]'],
      ['ready', { ...completed, forwarded: false, setupStep: 'ready' }, '.setup-ready'],
      ['never-contact', { ...completed, forwarded: false, setupStep: 'never-contact' }, '.setup-contact-dialog'],
    ]) {
      const onboarding = await newPage(viewport, fresh.session)
      await scenario(onboarding, `Onboarding ${surface}`, async () => {
        await api.setState(fresh.session.email, { forwarded: false, setupRequest: null, kickoffPending: false, ...patch })
        // A fresh context also isolates IndexedDB response caches and pending writes.
        await goto(onboarding, '/setup/agent', expected)
        await check(onboarding, `Onboarding ${surface}`)
      })
      await onboarding.context().close()
    }
    const onboarding = await newPage(viewport, fresh.session)
    await scenario(onboarding, 'Call screen (mock session)', async () => {
      await goto(onboarding, '/e2e/clip-smoke-call.html', '[data-call-status="active"]')
      await check(onboarding, 'Call screen (mock session)')
    })
    await onboarding.context().close()
  }
} catch (error) {
  report.failures.push({ kind: 'harness', reason: error.stack ?? String(error) })
  console.error(error)
} finally {
  clearTimeout(watchdog)
  report.blockedServerCalls = api?.blockedCalls ?? []
  for (const call of report.blockedServerCalls) report.failures.push({ kind: 'offline-violation', reason: JSON.stringify(call) })
  await finish()
  report.runtimeSeconds = Math.round((performance.now() - started) / 100) / 10
  report.passed = report.failures.length === 0 && !stopRequested
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
  console.log(`Clip smoke: ${report.surfaces.length} surfaces, ${report.failures.length} failures, ${report.runtimeSeconds}s. ${reportPath}`)
  process.exitCode = report.passed ? 0 : 1
}
