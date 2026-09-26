import assert from 'node:assert/strict'
import { inspectSurface } from './clip-smoke-checks.mjs'

/** Small isolated render contracts: a broken detector must fail the smoke too. */
export async function selfcheck(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  let cases = 0
  try {
    const page = await context.newPage()
    const render = async html => {
      await page.setContent(`<style>body{margin:0;font:14px/20px Arial,sans-serif}*{box-sizing:border-box}</style>${html}`)
      const result = await page.evaluate(inspectSurface)
      cases++
      return result.failures
    }
    const clean = await render(`
      <style>.tag{width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .labels{display:grid}.labels>span{grid-area:1/1}.reserve{visibility:hidden}
      .track{width:200px;overflow:hidden}.inactive{width:200px;height:12px;overflow:hidden}
      .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}</style>
      <div class="tag">A deliberately truncated single line of text</div>
      <button style="height:50px"><span class="labels"><span>Continue</span><span class="reserve">Loading…<br>Payroll profile</span></span></button>
      <div class="track"><article class="inactive" data-active="false" inert><button style="height:12px;overflow:hidden">Loading…<br>CA-MB-01</button></article></div>
      <span class="sr">f_hidden123</span>`)
    assert.deepEqual(clean, [], 'Ellipsis, reserve labels, inactive slides, and screen-reader text are not visual defects')

    const desktop = await render(`
      <button style="display:block;width:220px;height:32px;padding:0;overflow:hidden;font:14px/20px Arial">
        <span style="display:grid;grid-template-columns:18px auto;grid-template-rows:auto auto;text-align:left">
          <svg style="width:12px;height:12px;grid-row:1/3"></svg><b>Connect calendar</b><span>Sync the shared calendar</span>
        </span>
      </button>`)
    assert(desktop.some(item => item.kind === 'clipped-content'), 'A 32px button clips its two visible lines')
    assert(desktop.some(item => item.kind === 'shrunk-icon'), 'A 12px multiline-row icon fails')
    assert(!desktop.some(item => item.kind === 'squashed-control'), 'Desktop minimum remains 24px')

    const wrappers = await render('<style>.journey-findings,.journey-task,.journey-next-step{height:12px;overflow:hidden}</style><div class="journey-findings">One<br>Two</div><div class="journey-task">One<br>Two</div><div class="journey-next-step">One<br>Two</div>')
    assert.equal(wrappers.filter(item => item.kind === 'clipped-content').length, 3, 'Journey cards and next-step rows are checked')

    const overflow = await render('<div style="width:1600px">Page overflow</div>')
    assert(overflow.some(item => item.kind === 'page-overflow'), 'Horizontal document overflow fails')

    const forbidden = await render(`
      <p><strong>Payroll</strong> profile</p><p>Loading…</p><p>export.csv</p><p>row 12</p>
      ${['inline-block', 'inline-flex', 'inline-grid'].map(display => `<p><span style="display:${display}">Payroll</span> <span style="display:${display}">profile</span></p>`).join('')}
      <p>f_fixture123</p><p>e_fixture123</p><p>dp_fixture123</p><p>t_fixture123</p>
      <p>CA-MB-01</p><p>FED-OT-40</p><p>REST-GAP-01</p><p>CA-OT-8</p><p>CA-ROUND-0</p><p>FAC-AUTODED-01</p><p>CON-MIN-4H</p><p>CS-16H</p><p>TS-COMPLETE</p>
      <input value="f_input123"><input placeholder="Loading…"><textarea>dp_textarea123</textarea><input type="password" value="f_masked123">`)
    const byRule = rule => forbidden.filter(item => item.measurements.rule === rule)
    assert.equal(byRule('payroll-profile-copy').length, 4, 'Forbidden phrases split by inline, inline-block, inline-flex, and inline-grid markup fail')
    assert.equal(byRule('loading-copy').length, 2, 'Visible loading copy and placeholders fail')
    assert.equal(byRule('csv-filename').length, 1)
    assert.equal(byRule('row-number').length, 1)
    assert.equal(byRule('raw-id').length, 6, 'All raw-ID prefixes and native field values fail; masked values are excluded')
    assert.equal(byRule('rule-code').length, 9, 'Rule codes support actual engine shapes')

    await page.setViewportSize({ width: 390, height: 844 })
    const phone = await render('<button style="height:32px;display:flex;align-items:center"><svg style="width:16px;height:16px"></svg>Continue</button>')
    assert(phone.some(item => item.kind === 'squashed-control' && item.measurements.minimumHeight === 44), 'Phone icon-and-text controls need 44px')

    await page.setContent(`<style>body{margin:0}textarea{display:block;box-sizing:border-box;width:200px;height:15px;resize:none;font:14px/16px Arial;padding:0;border:0}</style>
      <textarea id="explicit">Stale default</textarea><textarea id="wrapped"></textarea>
      <textarea id="blank"></textarea><textarea id="trailing"></textarea>
      <textarea id="placeholder" placeholder="Line one&#10;Line two"></textarea><textarea id="single"></textarea>`)
    await page.evaluate(() => {
      const values = { explicit: 'Line one\nLine two', wrapped: 'A long answer that naturally wraps over several lines within this two hundred pixel text field', blank: 'One\n\nThree', trailing: 'One\n', single: 'Single line' }
      for (const [id, value] of Object.entries(values)) document.getElementById(id).value = value
    })
    const textareas = (await page.evaluate(inspectSurface)).failures.filter(item => item.kind === 'squashed-control')
    cases++
    const textarea = id => textareas.find(item => item.element === `textarea#${id}`)
    assert.equal(textarea('explicit')?.measurements.lineCount, 2, 'Current textarea value, not default DOM text, supplies line count')
    assert(textarea('wrapped')?.measurements.lineCount > 1, 'Textarea soft wrapping is measured')
    assert.equal(textarea('blank')?.measurements.lineCount, 3, 'Blank lines are counted')
    assert.equal(textarea('trailing')?.measurements.lineCount, 2, 'A final empty line is counted')
    assert.equal(textarea('placeholder')?.measurements.lineCount, 2, 'Visible multiline textarea placeholders are measured')
    assert.equal(textarea('single'), undefined, 'A single-line textarea is not a multiline control')
    assert.equal(await page.locator('body > div').count(), 0, 'Textarea measurement mirrors are removed')
    return { passed: true, cases }
  } finally { await context.close() }
}
