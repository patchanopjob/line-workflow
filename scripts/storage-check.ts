import { config } from '../src/config'
import { formatBytes, getStorage } from '../src/services/storage'

// ---------------------------------------------------------------------------
// ตรวจว่าต่อกับที่เก็บไฟล์ได้จริง ก่อนจะไปเจอปัญหาตอนมีคนส่งรูปเข้ากลุ่ม
//
//   npm run storage:check
//
// ทดสอบครบวงจร เขียน -> อ่าน -> เทียบเนื้อหา -> ลบทิ้ง
// ใช้ได้กับทั้ง driver local และ s3 (Cloudflare R2 / AWS S3 / MinIO)
//
// จุดสอน: การมีคำสั่งตรวจสุขภาพของ dependency ภายนอกแยกไว้ ทำให้แยกได้ทันทีว่า
// ปัญหาอยู่ที่ credential/เครือข่าย หรืออยู่ที่ตรรกะของโปรแกรมเรา
// ---------------------------------------------------------------------------

const TEST_KEY = '_healthcheck/storage-check.txt'

function mask(value: string): string {
  if (!value) return '(ยังไม่ได้ตั้ง)'
  if (value.length <= 8) return '****'
  return `${value.slice(0, 4)}****${value.slice(-4)}`
}

async function main(): Promise<void> {
  console.log('\n=== ตรวจการเชื่อมต่อที่เก็บไฟล์ ===\n')
  console.log(`driver          : ${config.media.driver}`)

  if (config.media.driver === 's3') {
    const s3 = config.media.s3
    console.log(`S3_BUCKET       : ${s3.bucket || '(ยังไม่ได้ตั้ง)'}`)
    console.log(`S3_REGION       : ${s3.region}`)
    console.log(`S3_ENDPOINT     : ${s3.endpoint || '(ว่าง = ใช้ AWS S3 จริง)'}`)
    console.log(`S3_ACCESS_KEY_ID: ${mask(s3.accessKeyId)}`)
    console.log(`S3_SECRET...KEY : ${mask(s3.secretAccessKey)}`)

    // ความผิดพลาดที่พบบ่อยที่สุดตอนตั้งค่า R2 คือใส่ชื่อ bucket ต่อท้าย endpoint
    if (s3.bucket && s3.endpoint.replace(/\/+$/, '').endsWith(`/${s3.bucket}`)) {
      console.warn(
        `\n⚠️  S3_ENDPOINT มีชื่อ bucket ต่อท้ายอยู่ ให้ใส่แค่ส่วนโดเมน` +
          `\n    เช่น https://<account_id>.r2.cloudflarestorage.com (ไม่ต้องมี /${s3.bucket})`
      )
    }
  } else {
    console.log(`MEDIA_LOCAL_DIR : ${config.media.localDir}`)
  }

  console.log('')

  const storage = getStorage()
  const payload = Buffer.from(`storage check ${new Date().toISOString()}\n`, 'utf8')

  console.log(`[1/4] เขียนไฟล์ทดสอบ  : ${TEST_KEY}`)
  const put = await storage.put(TEST_KEY, payload)
  console.log(`      ขนาด ${put.size} ไบต์ / sha256 ${put.checksum.slice(0, 16)}...`)

  console.log('[2/4] อ่านกลับมาเทียบ')
  const readBack = await storage.get(TEST_KEY)
  if (!readBack.equals(payload)) {
    throw new Error('อ่านไฟล์กลับมาแล้วเนื้อหาไม่ตรงกับตอนเขียน')
  }
  console.log('      เนื้อหาตรงกันทุกไบต์')

  console.log('[3/4] ดูขนาดที่ใช้ไปทั้งหมด')
  try {
    const usage = await storage.usage()
    console.log(`      ${usage.files} ไฟล์ / ${formatBytes(usage.bytes)}`)
  } catch (err) {
    // ไม่ถือเป็นความล้มเหลว บาง token ให้สิทธิ์เขียน/อ่านแต่ไม่ให้ list
    console.warn(`      ข้าม (list ไม่ได้): ${err instanceof Error ? err.message : err}`)
  }

  console.log('[4/4] ลบไฟล์ทดสอบทิ้ง')
  await storage.delete(TEST_KEY)
  if (await storage.exists(TEST_KEY)) {
    throw new Error('ลบไฟล์ทดสอบแล้วแต่ยังหาเจออยู่')
  }

  console.log('\n✅ ที่เก็บไฟล์พร้อมใช้งาน\n')
}

main().catch((err) => {
  console.error(`\n❌ เชื่อมต่อที่เก็บไฟล์ไม่สำเร็จ: ${err instanceof Error ? err.message : err}\n`)
  console.error('   ตรวจตามลำดับนี้')
  console.error('   - S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY คัดลอกมาครบหรือไม่')
  console.error('   - S3_ENDPOINT เป็นแค่โดเมน ไม่มีชื่อ bucket ต่อท้าย')
  console.error('   - API token ของ R2 เป็นแบบ Object Read & Write และผูกกับ bucket นี้')
  console.error('   - ชื่อ bucket ใน S3_BUCKET สะกดตรงกับที่สร้างไว้\n')
  process.exit(1)
})
