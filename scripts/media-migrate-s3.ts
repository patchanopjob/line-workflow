import fs from 'node:fs'
import path from 'node:path'
import { config } from '../src/config'
import { pool } from '../src/db'
import { getStorage } from '../src/services/storage'

// ---------------------------------------------------------------------------
// ย้ายไฟล์ที่เคยเก็บบนดิสก์ในเครื่อง ขึ้น object storage แบบครั้งเดียวจบ
//
//   ตั้ง MEDIA_STORAGE_DRIVER=s3 ใน .env ให้เรียบร้อยก่อน แล้วรัน
//   npm run media:migrate            ดูว่าจะย้ายกี่ไฟล์ (ยังไม่ย้ายจริง)
//   npm run media:migrate -- --yes   ย้ายจริง
//
// อ่านไฟล์ต้นทางจากดิสก์ตรง ๆ (ไม่ผ่าน getStorage เพราะตอนนี้ชี้ไป s3 แล้ว)
// แล้วอัปโหลดขึ้นที่เก็บปัจจุบัน จากนั้นอัปเดต storage_driver ในฐานข้อมูลให้ตรงกัน
// ---------------------------------------------------------------------------

interface Row {
  id: number
  line_message_id: string
  storage_key: string
  preview_key: string | null
}

const confirmed = process.argv.includes('--yes')
const localRoot = path.resolve(
  path.isAbsolute(config.media.localDir)
    ? config.media.localDir
    : path.join(process.cwd(), config.media.localDir)
)

async function main(): Promise<void> {
  const storage = getStorage()

  console.log(`\n[migrate] ต้นทาง: ดิสก์ ${localRoot}`)
  console.log(`[migrate] ปลายทาง: ${storage.driver}`)

  if (storage.driver === 'local') {
    console.error('\n[migrate] MEDIA_STORAGE_DRIVER ยังเป็น local อยู่ ตั้งเป็น s3 ก่อนแล้วรันใหม่\n')
    return
  }

  const { rows } = await pool.query<Row>(
    `SELECT id, line_message_id, storage_key, preview_key
       FROM media_files
      WHERE status = 'stored' AND storage_driver = 'local' AND storage_key <> ''
      ORDER BY id`
  )
  console.log(`[migrate] พบไฟล์ที่ยังชี้ไปที่ดิสก์ ${rows.length} แถว`)

  if (!confirmed) {
    console.log('[migrate] ใส่ -- --yes เพื่อย้ายจริง\n')
    return
  }
  if (!rows.length) {
    console.log('[migrate] ไม่มีอะไรต้องย้าย\n')
    return
  }

  let moved = 0
  let missing = 0

  for (const row of rows) {
    const keys = [row.storage_key, row.preview_key].filter((k): k is string => Boolean(k))
    let ok = true

    for (const key of keys) {
      const full = path.resolve(localRoot, key)
      // กัน path traversal เผื่อข้อมูลในฐานข้อมูลถูกแก้ (หลักเดียวกับ LocalDiskStorage)
      if (!full.startsWith(localRoot)) {
        console.warn(`[ข้าม] id=${row.id} storage_key ไม่ถูกต้อง: ${key}`)
        ok = false
        break
      }
      if (!fs.existsSync(full)) {
        console.warn(`[ข้าม] id=${row.id} ไม่พบไฟล์บนดิสก์: ${key}`)
        ok = false
        break
      }
      await storage.put(key, await fs.promises.readFile(full))
    }

    if (!ok) {
      missing += 1
      continue
    }

    await pool.query('UPDATE media_files SET storage_driver = $1 WHERE id = $2', [storage.driver, row.id])
    moved += 1
    if (moved % 20 === 0) console.log(`[migrate] ย้ายแล้ว ${moved}/${rows.length}`)
  }

  console.log(`\n[migrate] เสร็จ: ย้ายสำเร็จ ${moved} แถว / หาไฟล์ไม่เจอ ${missing} แถว`)
  console.log('[migrate] เปิดหน้า /media สุ่มกดดูไฟล์ให้ครบทุกประเภทก่อน แล้วค่อยลบโฟลเดอร์เดิมทิ้ง\n')
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('[migrate] ผิดพลาด:', err instanceof Error ? err.message : err)
    await pool.end()
    process.exit(1)
  })
