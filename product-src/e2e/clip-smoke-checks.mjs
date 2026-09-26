/**
 * Runs inside Chromium via page.evaluate(inspectSurface, { phone }).
 * Keep this function self-contained: Playwright serializes its source, not imports.
 * There is no defect allowlist here; exceptions belong beside the smoke scenarios.
 */
export function inspectSurface(options = {}) {
  const phone = options.phone ?? window.innerWidth <= 390
  const minimumHeight = phone ? 44 : 24
  const failures = []
  const styles = new WeakMap()
  const layouts = new WeakMap()
  const metrics = new WeakMap()
  const markers = new WeakMap()
  let markerIndex = 0
  const stats = { candidates: 0, interactive: 0, icons: 0, textNodes: 0 }
  const interactiveSelector = 'button, [role="button"], a[href], a.btn, input:not([type="hidden"]), select, textarea, summary, [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="switch"], [role="link"]'
  const iconSelector = 'svg, img, [role="img"], .icon, [data-lucide]'
  const style = element => {
    if (!styles.has(element)) styles.set(element, window.getComputedStyle(element))
    return styles.get(element)
  }
  const round = value => Math.round(value * 100) / 100
  const rectangle = rect => ({ x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) })
  const hiddenOverflow = value => value === 'hidden' || value === 'clip'
  const scrollOverflow = value => value === 'auto' || value === 'scroll'
  const outside = (rect, clip, axis) => axis === 'x'
    ? rect.right <= clip.left + 0.5 || rect.left >= clip.right - 0.5
    : rect.bottom <= clip.top + 0.5 || rect.top >= clip.bottom - 0.5

  // Vertical content in a real scrollport is still part of the rendered surface.
  // Inactive horizontal carousel slides are separate surfaces, visited by the runner.
  const isRendered = element => {
    if (layouts.has(element)) return layouts.get(element)
    let rendered = true
    const rect = element.getBoundingClientRect()
    if (!element.getClientRects().length || rect.width <= 0 || rect.height <= 0) rendered = false
    if (element.closest('[data-active="false"][inert]')) rendered = false
    let scrollX = false
    let scrollY = false
    for (let ancestor = element; rendered && ancestor; ancestor = ancestor.parentElement) {
      const css = style(ancestor)
      if (css.display === 'none' || css.contentVisibility === 'hidden' || Number(css.opacity) === 0) rendered = false
      if (ancestor === element && (css.visibility === 'hidden' || css.visibility === 'collapse')) rendered = false
      if (/^inset\(50%(?:\s|\))/.test(css.clipPath) || /^rect\((?:0px[,\s]*){4}\)$/.test(css.clip)) rendered = false
      if (ancestor === element) continue
      const clip = ancestor.getBoundingClientRect()
      const carousel = css.scrollSnapType.startsWith('x') || (scrollOverflow(css.overflowX) && ancestor.closest('[aria-roledescription="carousel"]'))
      if (carousel && outside(rect, clip, 'x')) rendered = false
      if (!scrollX && hiddenOverflow(css.overflowX) && outside(rect, clip, 'x')) rendered = false
      if (!scrollY && hiddenOverflow(css.overflowY) && outside(rect, clip, 'y')) rendered = false
      scrollX ||= scrollOverflow(css.overflowX)
      scrollY ||= scrollOverflow(css.overflowY)
    }
    layouts.set(element, rendered)
    return rendered
  }

  // Ignore visibility:hidden ActionButton reserve labels. Count actual text lines
  // by their range boxes, not control height / line-height or newline characters.
  const textMetrics = element => {
    if (metrics.has(element)) return metrics.get(element)
    if (element.tagName === 'TEXTAREA') {
      const value = element.value || element.placeholder || ''
      if (!value) {
        const result = { text: '', lineCount: 0, boxes: [] }
        metrics.set(element, result)
        return result
      }
      // Native textarea text lives in the browser's internal editor, outside DOM
      // ranges. A hidden, isolated mirror measures its current wrapping without
      // changing the control, focus, scroll position, or any visible UI.
      const host = document.createElement('div')
      host.setAttribute('aria-hidden', 'true')
      host.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;contain:layout style paint;'
      const mirror = document.createElement('div')
      const css = style(element)
      const textCss = element.value ? css : window.getComputedStyle(element, '::placeholder')
      mirror.style.cssText = 'display:block;box-sizing:border-box;height:auto;min-height:0;max-height:none;min-width:0;max-width:none;margin:0;border:0;overflow:visible;'
      for (const property of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontVariant', 'fontKerning', 'fontFeatureSettings', 'fontVariationSettings', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textTransform', 'textIndent', 'textAlign', 'direction', 'tabSize', 'wordBreak', 'overflowWrap']) {
        mirror.style[property] = textCss[property] || css[property]
      }
      mirror.style.whiteSpace = element.wrap === 'off' ? 'pre' : css.whiteSpace
      for (const property of ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']) mirror.style[property] = css[property]
      // clientWidth excludes a native vertical scrollbar while preserving padding.
      mirror.style.width = `${element.clientWidth}px`
      host.attachShadow({ mode: 'closed' }).append(mirror)
      document.body.append(host)
      let lineCount
      try {
        const padding = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom)
        mirror.textContent = 'M'
        const lineHeight = mirror.getBoundingClientRect().height - padding
        // A zero-width final glyph preserves the last blank line after a newline.
        mirror.textContent = `${value}\u200b`
        const contentHeight = mirror.getBoundingClientRect().height - padding
        lineCount = lineHeight > 0 ? Math.max(1, Math.round(contentHeight / lineHeight)) : 0
      } finally { host.remove() }
      const result = { text: value.replace(/\s+/g, ' ').trim(), lineCount, boxes: [] }
      metrics.set(element, result)
      return result
    }
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const boxes = []
    const parts = []
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement
      if (!node.textContent.trim() || !parent || parent.closest('svg, script, style, noscript, template')) continue
      // Do not reject a child because this control itself clips that child's text.
      // Those out-of-bounds lines are precisely what this check must detect.
      let visible = true
      for (let ancestor = parent; ancestor; ancestor = ancestor.parentElement) {
        const css = style(ancestor)
        if (css.display === 'none' || css.visibility !== 'visible' || Number(css.opacity) === 0) visible = false
        if (ancestor === element) break
      }
      if (!visible || !parent.getClientRects().length) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      const nodeBoxes = [...range.getClientRects()].filter(box => box.width > 0.5 && box.height > 0.5)
      if (!nodeBoxes.length) continue
      parts.push(node.textContent)
      boxes.push(...nodeBoxes)
    }
    const lines = []
    for (const box of boxes.sort((left, right) => left.top - right.top)) {
      const line = lines.find(item => Math.min(item.bottom, box.bottom) - Math.max(item.top, box.top) > Math.min(item.bottom - item.top, box.height) * 0.35)
      if (line) {
        line.top = Math.min(line.top, box.top)
        line.bottom = Math.max(line.bottom, box.bottom)
      } else lines.push({ top: box.top, bottom: box.bottom })
    }
    const result = { text: parts.join(' ').replace(/\s+/g, ' ').trim(), lineCount: lines.length, boxes }
    metrics.set(element, result)
    return result
  }
  const describe = element => {
    const parts = []
    for (let node = element; node && node !== document.body && parts.length < 4; node = node.parentElement) {
      let part = node.tagName.toLowerCase()
      if (node.id) {
        parts.unshift(`${part}#${CSS.escape(node.id)}`)
        break
      }
      part += [...node.classList].slice(0, 3).map(name => `.${CSS.escape(name)}`).join('')
      const siblings = node.parentElement ? [...node.parentElement.children].filter(sibling => sibling.tagName === node.tagName) : []
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`
      parts.unshift(part)
    }
    return parts.join(' > ') || 'body'
  }
  const report = (element, kind, reason, measurements = {}, matchedText) => {
    if (!markers.has(element)) {
      const marker = `clip-${markerIndex++}`
      element.setAttribute('data-clip-smoke-id', marker)
      markers.set(element, marker)
    }
    const marker = markers.get(element)
    failures.push({
      kind, reason, marker, selector: `[data-clip-smoke-id="${marker}"]`,
      element: describe(element), text: (matchedText ?? textMetrics(element).text).slice(0, 350),
      rect: rectangle(element.getBoundingClientRect()), measurements,
    })
  }
  for (const oldMarker of document.querySelectorAll('[data-clip-smoke-id]')) oldMarker.removeAttribute('data-clip-smoke-id')

  const allElements = [...document.body.querySelectorAll('*')]
  for (const element of allElements) {
    const interactive = element.matches(interactiveSelector)
    const cardOrTag = element.matches('article, [data-slot="card"], [data-slot="badge"], .journey-findings, .journey-task, .journey-next-step') || [...element.classList].some(name => /(?:^|-)(?:card|tag|chip|badge|tile)(?:-|$)/.test(name))
    if ((!interactive && !cardOrTag) || !isRendered(element)) continue
    stats.candidates++
    const css = style(element)
    const rect = element.getBoundingClientRect()
    const text = textMetrics(element)
    const overflowX = hiddenOverflow(css.overflowX) && element.scrollWidth > element.clientWidth + 1
    const overflowY = hiddenOverflow(css.overflowY) && element.scrollHeight > element.clientHeight + 1
    const oneLineEllipsis = css.textOverflow === 'ellipsis' && ['nowrap', 'pre'].includes(css.whiteSpace) && text.lineCount <= 1 && !overflowY
    if ((overflowX || overflowY) && !oneLineEllipsis) {
      report(element, 'clipped-content', `Content exceeds its ${overflowX && overflowY ? 'width and height' : overflowX ? 'width' : 'height'} while overflow is hidden or clipped.`, {
        clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
        overflowX: css.overflowX, overflowY: css.overflowY, lineCount: text.lineCount,
      })
    }
    if (interactive) {
      stats.interactive++
      const icons = [...element.querySelectorAll(iconSelector)].filter(isRendered)
      if (rect.height + 0.01 < minimumHeight && (text.lineCount > 1 || (icons.length && text.text))) {
        report(element, 'squashed-control', `A ${text.lineCount > 1 ? 'multiline' : 'text-and-icon'} control is shorter than ${minimumHeight}px.`, {
          height: round(rect.height), minimumHeight, lineCount: text.lineCount, iconCount: icons.length,
        })
      }
    }
  }

  // Find the nearest semantic row/control/card that actually has multiple lines.
  // A whole panel's many unrelated lines must not turn its tiny toolbar icon into
  // a multiline-row failure.
  for (const icon of document.querySelectorAll(iconSelector)) {
    if (!isRendered(icon) || icon.closest('svg') !== (icon.tagName.toLowerCase() === 'svg' ? icon : null)) continue
    stats.icons++
    const rect = icon.getBoundingClientRect()
    if (Math.min(rect.width, rect.height) + 0.01 >= 14) continue
    let row = icon.parentElement
    while (row && row !== document.body) {
      const isRow = row.matches('button, [role="button"], a[href], a.btn, [role="row"], li') || [...row.classList].some(name => /(?:^|-)(?:row|option|item|next-step)(?:-|$)/.test(name))
      if (isRow) break
      if (row.matches('article, section, aside, main, nav, header, footer, [role="dialog"]')) { row = null; break }
      row = row.parentElement
    }
    if (!row || row === document.body || !isRendered(row)) continue
    const text = textMetrics(row)
    if (text.lineCount > 1) report(icon, 'shrunk-icon', 'An icon inside a multiline row is smaller than 14px.', {
      width: round(rect.width), height: round(rect.height), minimumSize: 14,
      row: describe(row), lineCount: text.lineCount,
    }, text.text)
  }

  const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
  const viewportWidth = document.documentElement.clientWidth
  if (documentWidth > viewportWidth + 1) report(document.body, 'page-overflow', 'The page is wider than its viewport.', { documentWidth, viewportWidth })

  const forbidden = [
    { name: 'loading-copy', expression: /\bLoading(?:…|\.\.\.)/i },
    { name: 'payroll-profile-copy', expression: /\bPayroll\s+profile\b/i },
    { name: 'raw-id', expression: /\b(?:f|e|dp|t)_[a-z0-9][a-z0-9_-]*\b/i },
    { name: 'csv-filename', expression: /\.csv\b/i },
    { name: 'row-number', expression: /\brow\s+\d+\b/i },
    { name: 'rule-code', expression: /\b(?:[A-Z]{2,8}-[A-Z]{2,12}-\d+[A-Z]*|CS-(?:\d+[A-Z]*|OVLP|SPEED|EXACT|EDIT)|TS-COMPLETE|TW-\d+)\b/ },
  ]
  const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const textParents = new Set()
  for (let node = textWalker.nextNode(); node; node = textWalker.nextNode()) {
    const parent = node.parentElement
    if (!parent || !node.textContent.trim() || parent.closest('svg, script, style, noscript, template, input, textarea, select') || !isRendered(parent)) continue
    stats.textNodes++
    textParents.add(parent)
    // A phrase split across inline emphasis or inline layout still counts as visible text.
    if (['inline', 'inline-block', 'inline-flex', 'inline-grid'].includes(style(parent).display) && parent.parentElement && isRendered(parent.parentElement)) textParents.add(parent.parentElement)
  }
  const bannedMatches = []
  for (const element of textParents) {
    const text = textMetrics(element).text
    for (const rule of forbidden) {
      const match = text.match(rule.expression)
      if (match) bannedMatches.push({ element, name: rule.name, match: match[0] })
    }
  }
  for (const match of bannedMatches) {
    if (bannedMatches.some(other => other !== match && other.name === match.name && match.element.contains(other.element) && match.element !== other.element)) continue
    report(match.element, 'forbidden-text', `Visible text contains ${match.name}: ${JSON.stringify(match.match)}.`, { rule: match.name, match: match.match })
  }
  // Form values are painted by the browser, so a text-node walk cannot see them.
  // Read the current value (not stale textarea default text), and placeholders
  // only when empty. Passwords and non-text native input values are not visible.
  for (const control of document.querySelectorAll('input, textarea, select')) {
    if (!isRendered(control)) continue
    if (control.tagName === 'INPUT' && ['hidden', 'password', 'checkbox', 'radio', 'range', 'color', 'image'].includes(control.type)) continue
    const text = control.tagName === 'SELECT'
      ? [...control.selectedOptions].map(option => option.label).join(' ')
      : control.value || control.placeholder || ''
    for (const rule of forbidden) {
      const match = text.match(rule.expression)
      if (match) report(control, 'forbidden-text', `Visible text contains ${rule.name}: ${JSON.stringify(match[0])}.`, {
        rule: rule.name, match: match[0], source: control.value ? 'value' : 'placeholder',
      }, text)
    }
  }
  return { failures, stats }
}
