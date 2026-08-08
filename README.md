# app - เซิร์ฟเวอร์ของวันที่ 1

> สาขา `day1` · ระบบเต็มอยู่ที่สาขา `day2` / `main` (ดู [BRANCHES.md](../BRANCHES.md))

เซิร์ฟเวอร์ตัวเล็กที่มีแค่ **ขารับ event จาก LINE** กับ **ตัวช่วยส่งข้อความ**
ยังไม่มีฐานข้อมูล ไม่มีหน้าเว็บ และไม่มีตัวตั้งเวลา

---

## เริ่มใช้งาน

```bash
npm install
copy .env.example .env      # macOS/Linux ใช้ cp
npm run dev
```

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run dev` | รันแบบ watch (แก้โค้ดแล้วรีสตาร์ทให้เอง) |
| `npm run typecheck` | ตรวจชนิดข้อมูลด้วย TypeScript โดยไม่สร้างไฟล์ |
| `npm run build` | คอมไพล์ลง `dist/` |
| `npm start` | รันไฟล์ที่คอมไพล์แล้ว |

---

## ค่าใน .env

| ตัวแปร | ใช้ทำอะไร |
| --- | --- |
| `CHANNEL_ACCESS_TOKEN` | กุญแจยิง Messaging API (tab Messaging API) |
| `CHANNEL_SECRET` | ตรวจ signature ของ webhook (tab **Basic settings** - คนละที่กับ token) |
| `MOCK_LINE` | `true` = ไม่ยิง API จริง แค่พิมพ์ลง console |
| `PORT` | พอร์ตเซิร์ฟเวอร์ (ค่าเริ่มต้น 3000) |

> ห้าม commit ไฟล์ `.env` เด็ดขาด - token คือกุญแจของ OA ทั้งบัญชี

---

## โครงไฟล์

```
src/
├── index.ts                 เซิร์ฟเวอร์: /webhook + /health
├── config.ts                อ่านค่าจาก .env ไว้ที่เดียว
├── line/client.ts           push / broadcast / reply / quota
├── middleware/asyncRouter.ts  กัน error จาก async handler ทำเซิร์ฟเวอร์ล่ม
├── routes/webhook.ts        จัดการ event ทุกชนิดจาก LINE
└── services/
    ├── flex.ts              การ์ดประกาศภายในองค์กร (Workshop 1)
    └── autoReply.ts         คำตอบของปุ่ม Rich Menu (Workshop 2)
```

---

## กฎเหล็ก 3 ข้อของ webhook ที่โค้ดนี้ทำตาม

1. **ตอบ 200 เสมอ** - `res.status(200).end()` ถูกเรียกก่อนประมวลผล event ถ้าตอบ error ซ้ำ ๆ LINE จะปิด webhook ให้อัตโนมัติ
2. **ตรวจ signature ด้วย channel secret** - ผ่าน middleware ของ `@line/bot-sdk`
3. **ห้ามใช้ `express.json()` ครอบ `/webhook`** - signature คำนวณจาก raw body ใน `index.ts` จึง mount webhook router ไว้ก่อน `express.json()` เสมอ

---

## แก้คำตอบของ Rich Menu

เปิด `src/services/autoReply.ts` แล้วแก้ที่ `MENU_REPLIES` ที่เดียว
เพิ่มปุ่มใหม่ = เพิ่ม 1 รายการในอาเรย์ แล้วเพิ่มช่องใน Rich Menu ให้ `keywords` ตรงกัน
