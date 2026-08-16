import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3'
import { config } from '../config'

// ---------------------------------------------------------------------------
// ชั้นเก็บไฟล์ (Storage layer)
//
// ออกแบบเป็น interface เดียว แล้วมีผู้ให้บริการหลายแบบข้างใต้
//   - LocalDiskStorage : เก็บลงดิสก์ในเครื่อง (ค่าเริ่มต้น เห็นไฟล์จริงได้ เหมาะกับตอนเรียน)
//   - S3Storage        : เก็บขึ้น object storage เช่น Cloudflare R2 / AWS S3 / MinIO
//
// จุดสอน: โค้ดส่วนอื่นของระบบเรียกผ่าน getStorage() เท่านั้น จึงย้ายจากดิสก์
// ขึ้น cloud ได้โดยแก้ไฟล์นี้ไฟล์เดียว ไม่ต้องแตะ webhook หรือ dashboard เลย
// ---------------------------------------------------------------------------

export interface PutResult {
  key: string
  size: number
  checksum: string
}

export interface Storage {
  readonly driver: 'local' | 's3'
  put(key: string, data: Buffer): Promise<PutResult>
  get(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  /** ขนาดรวมที่ใช้ไปทั้งหมด (ไบต์) ใช้แสดงในหน้า dashboard */
  usage(): Promise<{ files: number; bytes: number }>
}

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

// ---------------------------------------------------------------------------
// เก็บลงดิสก์ในเครื่อง
// ---------------------------------------------------------------------------
class LocalDiskStorage implements Storage {
  readonly driver = 'local' as const
  private root: string

  constructor(dir: string) {
    // path แบบ relative จะอิงจากโฟลเดอร์ที่รันโปรแกรม (cwd) เสมอ เพื่อให้ผลลัพธ์เดาได้
    this.root = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir)
    fs.mkdirSync(this.root, { recursive: true })
  }

  /** กัน path traversal: ห้าม key พาออกไปนอกโฟลเดอร์ที่กำหนด */
  private resolve(key: string): string {
    const full = path.resolve(this.root, key)
    if (!full.startsWith(this.root)) throw new Error(`storage key ไม่ถูกต้อง: ${key}`)
    return full
  }

  async put(key: string, data: Buffer): Promise<PutResult> {
    const full = this.resolve(key)
    await fs.promises.mkdir(path.dirname(full), { recursive: true })
    await fs.promises.writeFile(full, data)
    return { key, size: data.length, checksum: sha256(data) }
  }

  async get(key: string): Promise<Buffer> {
    return fs.promises.readFile(this.resolve(key))
  }

  async delete(key: string): Promise<void> {
    await fs.promises.rm(this.resolve(key), { force: true })
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.promises.access(this.resolve(key))
      return true
    } catch {
      return false
    }
  }

  async usage(): Promise<{ files: number; bytes: number }> {
    let files = 0
    let bytes = 0
    const walk = async (dir: string): Promise<void> => {
      let entries: fs.Dirent[]
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) await walk(full)
        else {
          const st = await fs.promises.stat(full)
          files += 1
          bytes += st.size
        }
      }
    }
    await walk(this.root)
    return { files, bytes }
  }
}

// ---------------------------------------------------------------------------
// เก็บขึ้น object storage ที่รองรับ S3 API (Cloudflare R2 / AWS S3 / MinIO)
//
// R2 พูดภาษา S3 API ได้ครบ จึงใช้ @aws-sdk/client-s3 ตัวเดียวกับ AWS ได้เลย
// ไม่ต้องมี SDK ของ Cloudflare แยก ต่างกันแค่ 2 จุดคือ
//   1) ต้องระบุ endpoint ของบัญชีตัวเอง (https://<account_id>.r2.cloudflarestorage.com)
//   2) region ต้องเป็น 'auto' เพราะ R2 ไม่ได้ใช้ค่านี้ แต่ SDK บังคับให้มี
//
// วิธีเปิดใช้งาน: ตั้งค่าใน .env หัวข้อที่ 7 แล้วเปลี่ยน MEDIA_STORAGE_DRIVER เป็น s3
// ตรวจว่าต่อติดจริงด้วย  npm run storage:check
// ---------------------------------------------------------------------------
class S3Storage implements Storage {
  readonly driver = 's3' as const
  private client: S3Client
  private bucket: string

  constructor() {
    const s3 = config.media.s3
    // ตรวจค่าที่ขาดตั้งแต่ตอนสร้าง จะได้รู้สาเหตุทันทีแทนที่จะไปพังตอนอัปโหลดไฟล์จริง
    if (!s3.bucket) {
      throw new Error('ตั้ง MEDIA_STORAGE_DRIVER=s3 แล้วแต่ยังไม่ได้ใส่ S3_BUCKET ใน .env')
    }
    if (!s3.accessKeyId || !s3.secretAccessKey) {
      throw new Error(
        'ตั้ง MEDIA_STORAGE_DRIVER=s3 แล้วแต่ยังไม่ได้ใส่ S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY ใน .env'
      )
    }

    this.bucket = s3.bucket
    this.client = new S3Client({
      region: s3.region || 'auto',
      // ว่างไว้ = ใช้ AWS S3 จริง / ใส่ = Cloudflare R2 หรือ MinIO
      endpoint: s3.endpoint || undefined,
      credentials: {
        accessKeyId: s3.accessKeyId,
        secretAccessKey: s3.secretAccessKey
      },
      // SDK รุ่นใหม่แนบ checksum header มาให้ทุก request ซึ่งบริการที่เข้ากันได้กับ S3
      // บางเจ้ายังไม่รองรับ ตั้งเป็น WHEN_REQUIRED เพื่อความเข้ากันได้สูงสุด
      // ความถูกต้องของข้อมูลยังตรวจได้อยู่ เพราะเราเก็บ sha256 ของทุกไฟล์ไว้ในฐานข้อมูลเอง
      requestChecksumCalculation: 'WHEN_REQUIRED'
    })
  }

  async put(key: string, data: Buffer): Promise<PutResult> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data }))
    return { key, size: data.length, checksum: sha256(data) }
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    if (!res.Body) throw new Error(`อ่านไฟล์จาก object storage ไม่ได้: ${key}`)
    // Body ฝั่ง Node เป็น stream ที่ SDK v3 ต่อ helper แปลงเป็น byte array ไว้ให้แล้ว
    return Buffer.from(await res.Body.transformToByteArray())
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return true
    } catch {
      return false
    }
  }

  async usage(): Promise<{ files: number; bytes: number }> {
    // ไล่ list ทีละหน้า (สูงสุด 1000 key ต่อครั้ง) จนครบทั้ง bucket
    // นี่คือ operation แบบ Class A ถ้าไฟล์เยอะมากและมีคนเปิดหน้าแกลเลอรีบ่อย
    // ให้เปลี่ยนไปอ่านผลรวมจากคอลัมน์ size_bytes ในตาราง media_files แทน
    let files = 0
    let bytes = 0
    let token: string | undefined

    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, ContinuationToken: token })
      )
      for (const obj of res.Contents ?? []) {
        files += 1
        bytes += obj.Size ?? 0
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (token)

    return { files, bytes }
  }
}

let instance: Storage | null = null

export function getStorage(): Storage {
  if (!instance) {
    instance = config.media.driver === 's3' ? new S3Storage() : new LocalDiskStorage(config.media.localDir)
  }
  return instance
}

/** แปลงไบต์เป็นข้อความอ่านง่าย เช่น 2.4 MB */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
