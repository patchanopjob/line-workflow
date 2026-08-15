# Express Hello World

เซิร์ฟเวอร์ Express ตัวเล็กที่สุด เขียนด้วย TypeScript

## เริ่มใช้งาน

```bash
npm install
npm run dev
```

เปิด http://localhost:3000/ จะเห็นข้อความ `Hello World`

## คำสั่งที่มี

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run dev` | รันแบบ watch (รีสตาร์ทเองเมื่อแก้ไฟล์) |
| `npm run build` | คอมไพล์ TypeScript ไปที่ `dist/` |
| `npm start` | รันไฟล์ที่ build แล้ว |
| `npm run typecheck` | ตรวจ type อย่างเดียว ไม่สร้างไฟล์ |

เปลี่ยนพอร์ตได้ด้วย environment variable `PORT`
