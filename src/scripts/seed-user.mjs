#!/usr/bin/env node
/**
 * seed-user.mjs — create an account with the Supabase admin API, email
 * pre-confirmed so nobody has to click through an inbox. Camera Shy's script.
 *
 * Use it to mint the first employee/test account in a fresh clone (or a second
 * test user) without clicking around the Supabase dashboard. Uses
 * SUPABASE_SECRET_KEY — server-only, never ships to the client.
 *
 * Run from src/:  npm run seed:user -- [email] [password]
 * With no password it generates one and prints it ONCE — there's no way to
 * read it back afterward.
 */

import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
if (!url || !secretKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SECRET_KEY in src/.env')
  process.exit(1)
}

const email = process.argv[2]
if (!email) {
  console.error('Usage: npm run seed:user -- <email> [password]')
  process.exit(1)
}
// base64url of 24 random bytes — 32 chars, no shell-hostile punctuation.
const password = process.argv[3] || randomBytes(24).toString('base64url')

const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true
})

if (error) {
  // Already existing is the expected re-run outcome, not a failure.
  if (/already/i.test(error.message)) {
    console.log(`User ${email} already exists — nothing to do.`)
    process.exit(0)
  }
  console.error('createUser failed:', error.message)
  process.exit(1)
}

console.log(`Created ${email}`)
console.log(`  id:       ${data.user?.id}`)
console.log(`  password: ${password}`)
console.log('Save it now — it is not recoverable. Change it after first login.')
