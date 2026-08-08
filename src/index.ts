import express, { type NextFunction, type Request, type Response } from 'express'
import { config, describeConfig } from './config'
import { createWebhookRouter } from './routes/webhook'

// ---------------------------------------------------------------------------
// [Day 1] เซิร์ฟเวอร์ของวันแรกมีแค่ 2 อย่าง: /webhook กับ /health
//         ยังไม่มีฐานข้อมูล ไม่มี Admin Dashboard และไม่มีตัวตั้งเวลา
//         ทั้งสามอย่างนั้นจะถูกเพิ่มในวันที่ 2 (ดูสาขา day2)
// ---------------------------------------------------------------------------

const app = express()

// ---------------------------------------------------------------------------
// 1) Webhook ต้องมาก่อน express.json()
//    เพราะ middleware ตรวจ signature ของ @line/bot-sdk ต้องอ่าน raw body
// ---------------------------------------------------------------------------
app.use('/', createWebhookRouter())

app.use(express.urlencoded({ extended: true, limit: '1mb' }))
app.use(express.json({ limit: '1mb' }))

// ---------------------------------------------------------------------------
// 2) health check - ใช้ตรวจว่าเซิร์ฟเวอร์ยังดีอยู่ และ tunnel ต่อถึงจริง
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    day: 1,
    lineMode: config.mockLine ? 'mock' : 'live'
  })
})

// ---------------------------------------------------------------------------
// 3) 404 และ error handler
// ---------------------------------------------------------------------------
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `ไม่พบ ${req.path}` })
})

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err.message)

  // error จาก middleware ตรวจ signature ของ LINE
  if (err.message?.toLowerCase().includes('signature')) {
    res.status(401).send('signature validation failed')
    return
  }

  // body ที่ส่งมาที่ /webhook ไม่ใช่ JSON ที่ถูกต้อง (ไม่ใช่คำขอจาก LINE)
  if (req.path === '/webhook') {
    res.status(400).json({ error: 'invalid request body' })
    return
  }

  res.status(500).json({ error: err.message })
})

// ---------------------------------------------------------------------------
// 4) กันเซิร์ฟเวอร์ล่มจาก error ที่หลุดรอดออกมา
// ---------------------------------------------------------------------------
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason.message : reason)
})
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message)
})

app.listen(config.port, () => {
  console.log('')
  console.log('  LINE Workflow Automation Workshop 2026 - Day 1')
  console.log('  ---------------------------------------------------------------')
  console.log(`   ${describeConfig()}`)
  console.log('  ---------------------------------------------------------------')
  console.log(`   Webhook : POST http://localhost:${config.port}/webhook`)
  console.log(`   Health  : GET  http://localhost:${config.port}/health`)
  console.log('  ---------------------------------------------------------------')
  console.log('   เปิดสู่อินเทอร์เน็ตด้วย: cloudflared tunnel --url http://localhost:' + config.port)
  console.log('')
})
