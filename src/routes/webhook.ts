import express, { type Request, type Response, type Router } from 'express'
import { asyncRouter } from '../middleware/asyncRouter'
import { middleware, type WebhookEvent } from '@line/bot-sdk'
import { config } from '../config'
import { replyText } from '../line/client'
import { FALLBACK_TEXT, WELCOME_TEXT, replyForPostback, replyForText } from '../services/autoReply'

// ---------------------------------------------------------------------------
// ขาเข้า: รับ event จาก LINE Platform
//
// กฎเหล็ก 3 ข้อของ webhook LINE
//   1) ต้องตอบ 200 เสมอ ถ้าตอบ error ซ้ำ ๆ LINE จะหยุดส่ง event มาให้
//   2) ต้องตรวจ signature ด้วย channel secret (กันคนอื่นยิงปลอม)
//   3) ต้องไม่ใช้ express.json() ครอบ route นี้ เพราะ middleware ต้องอ่าน raw body
//
// [Day 1] วันแรก webhook ทำหน้าที่ "ตอบกลับ" อย่างเดียว ยังไม่เก็บอะไรไว้เลย
//         ข้อความในกลุ่มจึงแค่พิมพ์ลง console แล้วหายไป
//         วันที่ 2 เราจะต่อ PostgreSQL เข้ามาตรงนี้ เพื่อให้ระบบมี "หน่วยความจำ"
// ---------------------------------------------------------------------------

export function createWebhookRouter(): Router {
  const router = asyncRouter()

  // ถ้ายังไม่ได้ตั้ง CHANNEL_SECRET (เช่นตอนเรียนช่วงแรก) ให้รับ JSON ตรง ๆ
  // และเตือนใน log ว่าข้ามการตรวจ signature อยู่ - ห้ามใช้แบบนี้ใน production
  const verifier = config.channelSecret
    ? middleware({ channelSecret: config.channelSecret })
    : express.json()

  if (!config.channelSecret) {
    console.warn('[Webhook] ยังไม่ได้ตั้ง CHANNEL_SECRET จึงข้ามการตรวจ signature (ใช้เฉพาะตอนทดสอบ)')
  }

  router.post('/webhook', verifier, async (req: Request, res: Response) => {
    // ตอบ 200 ทันที ไม่ให้ LINE รอ
    res.status(200).end()

    const events: WebhookEvent[] = req.body?.events ?? []
    for (const event of events) {
      try {
        await handleEvent(event)
      } catch (err) {
        console.error('[Webhook] ประมวลผล event ไม่สำเร็จ:', err instanceof Error ? err.message : err)
      }
    }
  })

  return router
}

export async function handleEvent(event: WebhookEvent): Promise<void> {
  // 1) บอทถูกเชิญเข้ากลุ่ม -> แนะนำตัว + ขอความยินยอม (สำคัญเรื่อง PDPA)
  if (event.type === 'join' && event.source.type === 'group') {
    await replyText(
      event.replyToken,
      [
        'สวัสดีครับ ผมคือบอทบันทึกบทสนทนาของทีม',
        'ผมจะเริ่มบันทึกข้อความในกลุ่มนี้ตั้งแต่ตอนนี้เป็นต้นไป เพื่อใช้สรุปประชุมและติดตามงาน',
        'ข้อความก่อนหน้านี้ผมมองไม่เห็นนะครับ',
        'ถ้าไม่สะดวกให้บันทึก แจ้งผู้ดูแลเพื่อเชิญผมออกจากกลุ่มได้เลยครับ'
      ].join('\n')
    )
    console.log(`[Join] บอทเข้าร่วมกลุ่ม ${event.source.groupId}`)
    return
  }

  // 2) บอทถูกเชิญออกจากกลุ่ม
  if (event.type === 'leave' && event.source.type === 'group') {
    console.log(`[Leave] บอทออกจากกลุ่ม ${event.source.groupId}`)
    return
  }

  // 3) มีคนกดเพิ่มเพื่อนกับ Official Account -> ทักทายและชี้ไปที่ Rich Menu
  if (event.type === 'follow') {
    await replyText(event.replyToken, WELCOME_TEXT)
    console.log('[Follow] มีผู้ใช้เพิ่มเพื่อนกับ OA')
    return
  }

  // 4) ผู้ใช้กดปุ่ม Rich Menu ที่เป็น action ชนิด postback
  if (event.type === 'postback') {
    const reply = replyForPostback(event.postback.data)
    await replyText(event.replyToken, reply ?? FALLBACK_TEXT)
    console.log(`[Postback] data=${event.postback.data}${reply ? '' : ' (ไม่ตรงเมนูใด)'}`)
    return
  }

  if (event.type !== 'message') return

  // ---------------------------------------------------------------------
  // 5) แชท 1:1 กับ OA: ตอบกลับตามเมนู
  //    Rich Menu ที่ใช้ action ชนิด message จะส่งข้อความเข้ามาทางนี้
  //    เหมือนผู้ใช้พิมพ์เอง ถ้าไม่มีใครรับ ปุ่มก็จะกดแล้วเงียบ
  // ---------------------------------------------------------------------
  if (event.source.type === 'user') {
    if (event.message.type !== 'text') return
    const reply = replyForText(event.message.text)
    await replyText(event.replyToken, reply ?? FALLBACK_TEXT)
    console.log(`[แชท 1:1] "${event.message.text}"${reply ? ' -> ตอบตามเมนู' : ' -> ตอบ fallback'}`)
    return
  }

  // ---------------------------------------------------------------------
  // 6) ข้อความในกลุ่ม
  //
  //    วันนี้เราแค่พิมพ์ให้ดูว่า event เข้ามาแล้วจริง ๆ แล้วปล่อยทิ้งไป
  //    ลองสังเกตให้ดี: พรุ่งนี้ถ้าอยากให้ AI สรุปว่ากลุ่มคุยอะไรกันเมื่อวาน
  //    เราจะเอาข้อมูลจากไหน ในเมื่อ Messaging API ไม่มี API อ่านแชทย้อนหลัง
  //    -> คำตอบคือต้องเก็บเองตั้งแต่ตอนที่ event วิ่งผ่านบรรทัดนี้ (Workshop 3)
  // ---------------------------------------------------------------------
  if (event.source.type === 'group') {
    const text = event.message.type === 'text' ? event.message.text : `[${event.message.type}]`
    console.log(`[กลุ่ม ${event.source.groupId}] ${text}`)
    console.log('        (Day 1 ยังไม่เก็บลงฐานข้อมูล - Workshop 3 ของวันที่ 2 จะเพิ่มส่วนนี้)')
  }
}
