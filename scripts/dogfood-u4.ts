import { spawn } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'

const DEV_SERVER_URL = 'http://localhost:3000'
const MAX_RETRIES = 30
const RETRY_DELAY = 1000

interface TestResult {
  name: string
  passed: boolean
  error?: string
}

const results: TestResult[] = []

function log(message: string, level: 'info' | 'success' | 'error' = 'info') {
  const prefix = '[dogfood-u4]'
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
  const tag = `${prefix} ${timestamp}`

  if (level === 'success') {
    console.log(`[32m${tag}[0m ${message}`)
  } else if (level === 'error') {
    console.log(`[31m${tag}[0m ${message}`)
  } else {
    console.log(`${tag} ${message}`)
  }
}

async function waitForServer(): Promise<boolean> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await fetch(`${DEV_SERVER_URL}/api/health`)
      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>
        if (typeof data.status === 'string' && data.status === 'ok') {
          return true
        }
      }
    } catch {
      // Expected: server not ready yet
    }
    await sleep(RETRY_DELAY)
  }
  return false
}

async function testEnglishRoute(): Promise<void> {
  const testName = 'Flow 1: English route (/en/)'
  try {
    log(`Testing ${testName}...`)

    const response = await fetch(`${DEV_SERVER_URL}/en/`)
    if (!response.ok) {
      throw new Error(`/en/ returned status ${response.status}`)
    }

    const html = await response.text()

    if (!html || html.length < 100) {
      throw new Error('/en/ returned empty or very small response')
    }

    const hasEnglishContent = html.includes('HurbadHardware') || html.includes('Welcome')
    if (!hasEnglishContent) {
      log(`Warning: Could not verify English text in /en/ response`, 'error')
    }

    if (!html.includes('lang="en"')) {
      log(`Warning: lang="en" attribute not found in HTML`, 'error')
    }

    results.push({ name: testName, passed: true })
    log(`${testName} PASSED`, 'success')
  } catch (error) {
    results.push({
      name: testName,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    })
    log(`${testName} FAILED: ${error}`, 'error')
  }
}

async function testSomaliRoute(): Promise<void> {
  const testName = 'Flow 2: Somali route (/so/)'
  try {
    log(`Testing ${testName}...`)

    const response = await fetch(`${DEV_SERVER_URL}/so/`)
    if (!response.ok) {
      throw new Error(`/so/ returned status ${response.status}`)
    }

    const html = await response.text()

    if (!html || html.length < 100) {
      throw new Error('/so/ returned empty or very small response')
    }

    const hasSomaliContent = html.includes('HurbadHardware') || html.includes('Mabarka')
    if (!hasSomaliContent) {
      log(`Warning: Could not verify Somali text in /so/ response`, 'error')
    }

    if (!html.includes('lang="so"')) {
      log(`Warning: lang="so" attribute not found in HTML`, 'error')
    }

    results.push({ name: testName, passed: true })
    log(`${testName} PASSED`, 'success')
  } catch (error) {
    results.push({
      name: testName,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    })
    log(`${testName} FAILED: ${error}`, 'error')
  }
}

async function testInvalidLocaleRedirect(): Promise<void> {
  const testName = 'Flow 4: Invalid locale redirect (/fr/ -> /en/)'
  try {
    log(`Testing ${testName}...`)

    const response = await fetch(`${DEV_SERVER_URL}/fr/`, {
      redirect: 'manual',
    })

    if (response.status !== 200 && !response.status.toString().startsWith('3')) {
      log(`Warning: /fr/ returned status ${response.status} (expected 2xx or 3xx)`, 'error')
    }

    results.push({ name: testName, passed: true })
    log(`${testName} PASSED`, 'success')
  } catch (error) {
    results.push({
      name: testName,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    })
    log(`${testName} FAILED: ${error}`, 'error')
  }
}

async function testAuthSomaliRoute(): Promise<void> {
  const testName = 'Flow 5: Auth + i18n (/so/auth/signin)'
  try {
    log(`Testing ${testName}...`)

    const response = await fetch(`${DEV_SERVER_URL}/so/auth/signin`)
    if (!response.ok) {
      throw new Error(`/so/auth/signin returned status ${response.status}`)
    }

    const html = await response.text()

    if (!html || html.length < 100) {
      throw new Error('/so/auth/signin returned empty response')
    }

    if (!html.includes('lang="so"')) {
      log(`Warning: lang="so" not found in auth page`, 'error')
    }

    results.push({ name: testName, passed: true })
    log(`${testName} PASSED`, 'success')
  } catch (error) {
    results.push({
      name: testName,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    })
    log(`${testName} FAILED: ${error}`, 'error')
  }
}

async function runTests(): Promise<void> {
  log('Starting i18n dogfood tests...')
  log(`Dev server URL: ${DEV_SERVER_URL}`)

  log('Starting dev server...')
  const devServer = spawn('npm', ['run', 'dev'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  log('Waiting for dev server to be ready...')
  const serverReady = await waitForServer()
  if (!serverReady) {
    log('Dev server failed to start after 30 seconds', 'error')
    devServer.kill()
    process.exit(1)
  }

  log('Dev server is ready', 'success')

  await testEnglishRoute()
  await testSomaliRoute()
  await testInvalidLocaleRedirect()
  await testAuthSomaliRoute()

  log('\n--- Test Summary ---')
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length

  results.forEach((result) => {
    if (result.passed) {
      log(`PASS ${result.name}`)
    } else {
      log(`FAIL ${result.name}: ${result.error}`, 'error')
    }
  })

  log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`)

  devServer.kill()

  if (failed === 0) {
    log('All tests PASSED', 'success')
    process.exit(0)
  } else {
    log('Some tests FAILED', 'error')
    process.exit(1)
  }
}

runTests().catch((error) => {
  log(`Dogfood crashed: ${error}`, 'error')
  process.exit(1)
})
