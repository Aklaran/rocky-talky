// Global test setup — load env vars for tests.
// Uses .env.test to isolate tests from the dev/prod database.
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../../.env.test') })
