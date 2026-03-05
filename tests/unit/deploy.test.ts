import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = join(__dirname, '../..')

describe('Deploy script', () => {
  const scriptContent = readFileSync(join(REPO_ROOT, 'scripts/deploy.sh'), 'utf-8')

  it('supports dev, staging, prod, and promote commands', () => {
    expect(scriptContent).toContain('dev)')
    expect(scriptContent).toContain('staging)')
    expect(scriptContent).toContain('prod)')
    expect(scriptContent).toContain('promote)')
  })

  it('uses correct port map (dev: 7205/7206, staging: 7210/7211, prod: 7202/7201/7200)', () => {
    // Dev ports
    expect(scriptContent).toContain('7205')
    expect(scriptContent).toContain('7206')
    // Staging port
    expect(scriptContent).toContain('7210')
    // Prod ports
    expect(scriptContent).toContain('7202')
    expect(scriptContent).toContain('7201')
    expect(scriptContent).toContain('7200')
  })

  it('uses launchd (not systemd) for service management', () => {
    expect(scriptContent).toContain('launchctl')
    expect(scriptContent).not.toContain('systemctl')
    expect(scriptContent).not.toContain('systemd')
  })

  it('checks for postgres before deploying', () => {
    expect(scriptContent).toContain('check_postgres')
  })

  it('checks for nginx before staging and prod', () => {
    expect(scriptContent).toContain('check_nginx')
  })

  it('runs prisma generate and pnpm build', () => {
    expect(scriptContent).toContain('pnpm generate')
    expect(scriptContent).toContain('pnpm build')
  })

  it('runs database migrations with environment-specific DATABASE_URL', () => {
    expect(scriptContent).toContain('rocky_talky_staging')
    expect(scriptContent).toContain('rocky_talky_dev')
    expect(scriptContent).toContain('prisma migrate deploy')
  })

  it('uses separate databases per environment', () => {
    expect(scriptContent).toContain('rocky_talky_dev')
    expect(scriptContent).toContain('rocky_talky_staging')
    expect(scriptContent).toContain('rocky_talky"')  // prod (just rocky_talky)
  })

  it('configures tailscale serve for production only', () => {
    // tailscale should only appear in the prod section
    const prodSection = scriptContent.split('prod)')[1]?.split(';;')[0] || ''
    expect(prodSection).toContain('tailscale serve')

    const stagingSection = scriptContent.split('staging)')[1]?.split(';;')[0] || ''
    expect(stagingSection).not.toContain('tailscale')
  })
})

describe('LaunchAgent plists', () => {
  const stagingPlist = readFileSync(
    join(REPO_ROOT, 'deploy/launchd/com.annapurna.rocky-talky-staging.plist'), 'utf-8'
  )
  const prodPlist = readFileSync(
    join(REPO_ROOT, 'deploy/launchd/com.annapurna.rocky-talky.plist'), 'utf-8'
  )

  it('staging listens on port 7210', () => {
    expect(stagingPlist).toContain('<string>7210</string>')
  })

  it('production listens on port 7202', () => {
    expect(prodPlist).toContain('<string>7202</string>')
  })

  it('staging uses rocky_talky_staging database', () => {
    expect(stagingPlist).toContain('rocky_talky_staging')
  })

  it('production uses rocky_talky database', () => {
    expect(prodPlist).toContain('rocky_talky</string>')
    expect(prodPlist).not.toContain('rocky_talky_staging')
  })

  it('both use production NODE_ENV', () => {
    expect(stagingPlist).toContain('<string>production</string>')
    expect(prodPlist).toContain('<string>production</string>')
  })

  it('both set TRUST_PROXY for nginx', () => {
    expect(stagingPlist).toContain('TRUST_PROXY')
    expect(prodPlist).toContain('TRUST_PROXY')
  })

  it('both have KeepAlive on failure', () => {
    expect(stagingPlist).toContain('SuccessfulExit')
    expect(prodPlist).toContain('SuccessfulExit')
  })

  it('log to ~/.local/state/rocky-talky/', () => {
    expect(stagingPlist).toContain('.local/state/rocky-talky/staging.log')
    expect(prodPlist).toContain('.local/state/rocky-talky/production.log')
  })
})

describe('Nginx config', () => {
  const nginxConf = readFileSync(
    join(REPO_ROOT, 'deploy/nginx/rocky-talky.conf'), 'utf-8'
  )

  it('staging listens on 7211, proxies to 7210', () => {
    expect(nginxConf).toContain('listen 7211')
    expect(nginxConf).toContain('proxy_pass http://127.0.0.1:7210')
  })

  it('production listens on 7201, proxies to 7202', () => {
    expect(nginxConf).toContain('listen 7201')
    expect(nginxConf).toContain('proxy_pass http://127.0.0.1:7202')
  })

  it('serves static assets with immutable caching', () => {
    expect(nginxConf).toContain('expires 1y')
    expect(nginxConf).toContain('immutable')
  })

  it('supports WebSocket upgrades', () => {
    expect(nginxConf).toContain('proxy_set_header Upgrade')
    expect(nginxConf).toContain('proxy_set_header Connection "upgrade"')
  })

  it('disables proxy buffering for SSE streaming', () => {
    expect(nginxConf).toContain('proxy_buffering off')
    expect(nginxConf).toContain('proxy_cache off')
  })

  it('enables gzip_static for pre-compressed assets', () => {
    expect(nginxConf).toContain('gzip_static on')
  })
})

describe('Logrotate configuration', () => {
  const configContent = readFileSync(join(REPO_ROOT, 'scripts/logrotate.conf'), 'utf-8')

  it('exists and has correct settings', () => {
    expect(configContent).toContain('size 10M')
    expect(configContent).toContain('rotate 3')
    expect(configContent).toContain('compress')
    expect(configContent).toContain('$HOME/.local/state/rocky-talky/rocky-talky.log')
  })

  it('uses copytruncate (no service restart needed)', () => {
    expect(configContent).toContain('copytruncate')
    expect(configContent).not.toContain('postrotate')
  })
})

describe('PWA manifest', () => {
  it('exists with correct standalone config', () => {
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, 'app/frontend/public/manifest.json'), 'utf-8')
    )
    expect(manifest.display).toBe('standalone')
    expect(manifest.name).toBe('Rocky Talky')
    expect(manifest.start_url).toBe('/sessions')
    expect(manifest.icons.length).toBeGreaterThan(0)
  })
})

describe('Mobile viewport config', () => {
  const indexHtml = readFileSync(join(REPO_ROOT, 'app/frontend/index.html'), 'utf-8')

  it('uses interactive-widget=resizes-content for keyboard handling', () => {
    expect(indexHtml).toContain('interactive-widget=resizes-content')
  })

  it('uses viewport-fit=cover for safe area support', () => {
    expect(indexHtml).toContain('viewport-fit=cover')
  })

  it('disables user scaling to prevent double-tap zoom', () => {
    expect(indexHtml).toContain('user-scalable=no')
  })

  it('has apple-mobile-web-app-capable for PWA standalone mode', () => {
    expect(indexHtml).toContain('apple-mobile-web-app-capable')
  })

  it('has theme-color matching dark background', () => {
    expect(indexHtml).toContain('theme-color')
    expect(indexHtml).toContain('#030711')
  })
})
