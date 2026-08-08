import 'dotenv/config'

// ---------------------------------------------------------------------------
// รวมค่า config ทั้งหมดไว้ที่เดียว อ่านจากไฟล์ .env
// ตั้งใจไม่ throw error ตอนเริ่มระบบ เพื่อให้ผู้เรียนรันเซิร์ฟเวอร์ดูได้
// แม้ยังไม่ได้ตั้งค่า LINE (ระบบจะทำงานในโหมด MOCK ให้อัตโนมัติ)
//
// [Day 1] ไฟล์นี้มีแค่ค่าของ LINE กับเซิร์ฟเวอร์
//         วันที่ 2 จะเพิ่ม DATABASE_URL, ค่าของ Admin Dashboard และตัวตั้งเวลาเข้ามา
// ---------------------------------------------------------------------------

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback
  return value.toLowerCase() === 'true' || value === '1'
}

const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN ?? ''
const channelSecret = process.env.CHANNEL_SECRET ?? ''

// ถ้าไม่ได้ตั้ง token ไว้ ให้บังคับเป็นโหมด mock เสมอ (ยิง API จริงไม่ได้อยู่ดี)
const mockLine = bool(process.env.MOCK_LINE, true) || channelAccessToken === ''

const nodeEnv = process.env.NODE_ENV ?? 'development'

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 3000),
  timezone: process.env.TZ ?? 'Asia/Bangkok',

  channelAccessToken,
  channelSecret,
  mockLine
}

export function describeConfig(): string {
  const lines = [
    `สภาพแวดล้อม   : ${config.nodeEnv}`,
    `โหมด LINE      : ${config.mockLine ? 'MOCK (ไม่ยิง API จริง)' : 'LIVE (ส่งเข้า LINE จริง)'}`,
    `Channel secret : ${config.channelSecret ? 'ตั้งค่าแล้ว (ตรวจ signature)' : 'ยังไม่ตั้ง (webhook จะข้ามการตรวจ signature)'}`
  ]
  return lines.join('\n   ')
}
