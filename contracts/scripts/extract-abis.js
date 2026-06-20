import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARTIFACTS = path.join(__dirname, '../artifacts/src')
const ABI_OUT   = path.join(__dirname, '../../frontend/src/abi')

const contracts = ['IdentityRegistry', 'LoanFactory', 'LoanContract']

fs.mkdirSync(ABI_OUT, { recursive: true })

for (const name of contracts) {
  const src = path.join(ARTIFACTS, `${name}.sol`, `${name}.json`)
  if (!fs.existsSync(src)) {
    console.error(`✗ Not found: ${src} — run: npx hardhat compile first`)
    process.exit(1)
  }
  const artifact = JSON.parse(fs.readFileSync(src, 'utf8'))
  const dst = path.join(ABI_OUT, `${name}.json`)
  fs.writeFileSync(dst, JSON.stringify(artifact.abi, null, 2))
  console.log(`✓ ${name} ABI → frontend/src/abi/${name}.json`)
}
