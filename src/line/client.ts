import { messagingApi } from '@line/bot-sdk'
import { config } from '../config'

// ---------------------------------------------------------------------------
// ห่อ LINE Messaging API ไว้ชั้นเดียว เพื่อ
//   1) รองรับโหมด MOCK (ไม่ยิง API จริง) ให้ทดสอบได้โดยไม่ต้องมี OA
//   2) รวมการจัดการ error ไว้ที่เดียว ไม่ต้อง try/catch กระจายทั้งโปรเจกต์
//
// [Day 1] วันแรกเราสั่งส่งข้อความผ่าน MCP เป็นหลัก ไฟล์นี้คือ "โค้ดฝั่งเรา"
//         ที่ทำงานเดียวกัน เอาไว้เทียบว่า MCP ทำอะไรให้เบื้องหลัง
//         และใช้จริงตอนบอทต้องตอบกลับเอง (reply) ซึ่ง MCP ทำแทนไม่ได้
// ---------------------------------------------------------------------------

const { MessagingApiClient } = messagingApi

export const lineClient = config.channelAccessToken
  ? new MessagingApiClient({ channelAccessToken: config.channelAccessToken })
  : null

export type SendStatus = 'sent' | 'mock' | 'failed'

export interface SendOutcome {
  status: SendStatus
  error?: string
}

function mockLog(action: string, detail: unknown): SendOutcome {
  console.log(`[MOCK LINE] ${action}`, typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 300))
  return { status: 'mock' }
}

/** ส่งข้อความ text ถึงผู้ใช้หรือกลุ่ม (to = userId หรือ groupId) */
export async function pushText(to: string, text: string): Promise<SendOutcome> {
  if (config.mockLine || !lineClient) return mockLog(`pushText -> ${to}`, text)
  try {
    await lineClient.pushMessage({ to, messages: [{ type: 'text', text }] })
    return { status: 'sent' }
  } catch (err) {
    return { status: 'failed', error: extractLineError(err) }
  }
}

/** ส่ง Flex Message (contents = JSON ของ bubble หรือ carousel) */
export async function pushFlex(to: string, altText: string, contents: unknown): Promise<SendOutcome> {
  if (config.mockLine || !lineClient) return mockLog(`pushFlex -> ${to} (${altText})`, contents)
  try {
    await lineClient.pushMessage({
      to,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ type: 'flex', altText, contents: contents as any }]
    })
    return { status: 'sent' }
  } catch (err) {
    return { status: 'failed', error: extractLineError(err) }
  }
}

/** broadcast ถึงผู้ติดตาม OA ทุกคน (ใช้โควต้าเยอะ ระวังตอนทดสอบ) */
export async function broadcastText(text: string): Promise<SendOutcome> {
  if (config.mockLine || !lineClient) return mockLog('broadcastText', text)
  try {
    await lineClient.broadcast({ messages: [{ type: 'text', text }] })
    return { status: 'sent' }
  } catch (err) {
    return { status: 'failed', error: extractLineError(err) }
  }
}

/**
 * ตอบกลับข้อความด้วย replyToken
 *
 * สำคัญมากสำหรับ Day 1: reply **ไม่นับโควต้า** ส่วน push นับ
 * ระบบที่ออกแบบดีจึงใช้ reply ให้มากที่สุด และ replyToken ใช้ได้ครั้งเดียว
 * ภายในเวลาสั้น ๆ หลังได้รับ event เท่านั้น
 */
export async function replyText(replyToken: string, text: string): Promise<SendOutcome> {
  if (config.mockLine || !lineClient) return mockLog('replyText', text)
  try {
    await lineClient.replyMessage({ replyToken, messages: [{ type: 'text', text }] })
    return { status: 'sent' }
  } catch (err) {
    return { status: 'failed', error: extractLineError(err) }
  }
}

/** โควต้าข้อความคงเหลือของเดือนนี้ (ตัวเดียวกับที่ MCP เรียกด้วย get_message_quota) */
export async function getQuota(): Promise<{ limit: number | null; used: number | null; mock: boolean }> {
  if (config.mockLine || !lineClient) return { limit: 200, used: 12, mock: true }
  try {
    const quota = await lineClient.getMessageQuota()
    const consumption = await lineClient.getMessageQuotaConsumption()
    return { limit: quota.value ?? null, used: consumption.totalUsage ?? null, mock: false }
  } catch {
    return { limit: null, used: null, mock: false }
  }
}

/** ดึงข้อความ error จาก LINE ให้อ่านรู้เรื่อง (ปกติซ้อนอยู่หลายชั้น) */
function extractLineError(err: unknown): string {
  if (err && typeof err === 'object') {
    const anyErr = err as Record<string, any>
    const body = anyErr.body ?? anyErr.originalError?.response?.data
    if (body?.message) {
      const details = Array.isArray(body.details) && body.details.length > 0
        ? ` (${body.details.map((d: any) => `${d.property}: ${d.message}`).join(', ')})`
        : ''
      return `${body.message}${details}`
    }
    if (anyErr.message) return String(anyErr.message)
  }
  return String(err)
}
