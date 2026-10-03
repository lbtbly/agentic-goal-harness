#!/usr/bin/env node
// The build workflow's input. Workflow scripts cannot read files, so the lead
// runs this and passes its JSON as the workflow's args.
//
//   slices.mjs            every slice, with its ledger state
//   slices.mjs --open     only slices not yet green, in plan order
//
// Reads the ARMED PLAN.md (the approved one) and .forge/ATTEMPTS.json, so a
// relaunch after a crash resumes at the right slice and the right rung.
import { readFileSync, existsSync } from 'node:fs'
import { enterProject, pinned, parsePlan, armedSha } from './forge-lib.mjs'

if (!enterProject()) process.exit(0)

const plan = pinned('.forge/PLAN.md')
if (plan.error) { console.log(JSON.stringify({ error: plan.error })); process.exit(2) }
const { checks, slices } = parsePlan(plan.text)

let ledger = {}
try { ledger = JSON.parse(readFileSync('.forge/ATTEMPTS.json', 'utf8')) } catch {}

const rows = slices.map(s => {
  const r = ledger[s.id] || {}
  // Same rule as attempt.mjs: the latest entry decides, and a RESET (a
  // rewind) reopens the slice whatever came before it.
  const hist = r.history || []
  const last = hist.length ? hist[hist.length - 1].verdict : null
  return { ...s, fails: r.fails || 0, base: r.base || null, status: last === 'PASS' ? 'green' : 'open' }
})

const open = process.argv.includes('--open')
const out = {
  armed: armedSha(),
  pinned: !!plan.pinned,
  checks: Object.fromEntries(Object.entries(checks).filter(([k]) => k !== 'holdout')),
  milestone: (rows.find(s => s.milestone) || {}).id || null,
  building: existsSync('.forge/BUILDING'),
  screens: existsSync('.forge/SCREENS.md'),
  slices: open ? rows.filter(s => s.status !== 'green') : rows,
}
console.log(JSON.stringify(out, null, 2))
