import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

function questionArrays(source: string, file: string) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  let count = 0
  function visit(node: ts.Node) {
    if (ts.isArrayLiteralExpression(node)) {
      const questions = node.elements.filter((element) => {
        if (ts.isStringLiteralLike(element)) return element.text.trim().endsWith('?')
        if (!ts.isObjectLiteralExpression(element)) return false
        return element.properties.some((property) => ts.isPropertyAssignment(property)
          && /^(question|prompt)$/.test(property.name.getText(ast).replace(/['"]/g, '')))
      })
      // Existing operator-to-agent suggestions are not onboarding questions. Exempt
      // only these exact arrays, so adding a script anywhere (even these pages) fails.
      const operatorSuggestions: Record<string, string[]> = {
        'pages/Payroll.tsx': ['What needs my review?', 'Why does gross differ from the spreadsheet?', 'Which payments are on hold?'],
        'pages/ShiftPage.tsx': ['Why is the amount what it is?', 'Where did this come from?', 'What changes if I apply it?', 'Make this a rule'],
      }
      const exempt = Object.entries(operatorSuggestions).some(([path, labels]) => file.endsWith(path)
        && node.elements.length === labels.length && node.elements.every((element, index) => ts.isStringLiteralLike(element) && element.text === labels[index]))
      if (questions.length >= 3 && !exempt) count++
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return count
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : /\.[jt]sx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : []
  })
}

describe('onboarding stays agent-driven', () => {
  it('has no question script or deterministic turn machine in shipped source', () => {
    const root = join(import.meta.dirname, '..')
    const offenders = sourceFiles(root).flatMap((file) => {
      const name = relative(root, file)
      const source = readFileSync(file, 'utf8')
      const forbiddenName = /^(lib|pages\/setup)\//.test(name) && /\b(?:QUESTIONS|TURNS|STAGES)\s*=/.test(source)
      return forbiddenName || questionArrays(source, file) > 0 ? [name] : []
    })
    expect(offenders, 'Onboarding questions must come from the server agent, never an array in src/.').toEqual([])
  })
  it('keeps welcome, introduction and consent copy neutral rather than scripting agent speech', () => {
    const page = readFileSync(join(import.meta.dirname, '../pages/setup/Agent.tsx'), 'utf8')
    for (const step of ['welcome', 'intro'] as const) {
      const pane = page.match(new RegExp("step === '" + step + "'[\\s\\S]*?</section>"))?.[0]
      expect(pane).toBeTruthy()
      expect(pane).not.toMatch(/\bI(?:['’](?:m|ll|ve|d)| (?:read|ask|only|work|can|will))\b|Let['’]s/)
    }
    expect(readFileSync(join(import.meta.dirname, 'trust.ts'), 'utf8')).not.toMatch(/['"]I /)
  })
  it('detects unnamed and object-based question scripts as well as named constants', () => {
    expect(questionArrays('const prompts = ["Who?", "When?", "Where?"]', 'fixture.ts')).toBe(1)
    expect(questionArrays('const prompts = [{ question: "Who" }, { question: "When" }, { question: "Where" }]', 'fixture.ts')).toBe(1)
    expect(questionArrays('const prompts = ["Who?", "When?", "Where?"]', 'pages/Payroll.tsx')).toBe(1)
    expect(questionArrays('const topics = ["calendar", "workerHours", "clientHours"]', 'fixture.ts')).toBe(0)
  })
})
