#!/usr/bin/env node
import { spawn } from 'node:child_process'

const port = process.env.PORT ?? '5173'

function spawnCommand(command, args) {
  return spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

console.log(`ローカルサーバーを起動します (http://localhost:${port})`)
const serveProc = spawnCommand('npx', ['serve', 'dist', '--listen', port, '--single'])

serveProc.on('exit', (code) => {
  if (code !== 0) {
    console.error('ローカルサーバーが異常終了しました', code)
  }
})

console.log('LocalTunnelを接続しています…')
const tunnelProc = spawnCommand('npx', ['localtunnel', '--port', port, '--print-requests'])

function cleanup() {
  if (!serveProc.killed) {
    serveProc.kill()
  }
  if (!tunnelProc.killed) {
    tunnelProc.kill()
  }
}

process.on('SIGINT', () => {
  cleanup()
  process.exit(0)
})

process.on('SIGTERM', () => {
  cleanup()
  process.exit(0)
})
