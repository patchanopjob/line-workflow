// ---------------------------------------------------------------------------
// ตัวช่วยสร้าง Flex Message
// ทุกฟังก์ชันคืนค่าเป็น plain object ตามสเปกของ LINE
// ทดลองแก้ดีไซน์ได้ที่ https://developers.line.biz/flex-simulator/
//
// [Day 1] วันแรกมีแค่การ์ดเดียวคือ "ประกาศภายในองค์กร" (Workshop 1)
//         วันที่ 2 จะเพิ่มอีก 3 การ์ด: สรุปประชุม, เตือนงานค้าง และรายงานผู้บริหาร
//
// จุดสอนของไฟล์นี้: อย่าเขียน JSON ก้อนใหญ่ทีเดียว ให้แตกเป็นฟังก์ชันเล็ก ๆ
// ที่ใช้ซ้ำได้ (header, textRow) และเก็บสีแบรนด์เป็นค่าคงที่ไว้ด้านบน
// แก้สีที่เดียวเปลี่ยนทุกการ์ด - หลักการเดียวกับ Design Token ในงานออกแบบ
// ---------------------------------------------------------------------------

const LINE_GREEN = '#06C755'
const NAVY = '#0C1628'
const GRAY = '#8A94A6'

export function textRow(label: string, value: string, valueColor = '#111827') {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      { type: 'text', text: label, size: 'sm', color: GRAY, flex: 4, wrap: true },
      { type: 'text', text: value, size: 'sm', color: valueColor, flex: 5, align: 'end', wrap: true, weight: 'bold' }
    ]
  }
}

export function header(title: string, subtitle: string, color: string) {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: color,
    paddingAll: '16px',
    contents: [
      { type: 'text', text: title, color: '#FFFFFF', weight: 'bold', size: 'lg', wrap: true },
      { type: 'text', text: subtitle, color: '#E5E7EB', size: 'xs', margin: 'xs', wrap: true }
    ]
  }
}

/** ประกาศภายในองค์กร / งาน HR (Workshop 1) */
export function flexAnnouncement(input: {
  title: string
  category: string
  body: string
  bullets?: string[]
  buttonLabel?: string
  buttonUrl?: string
}) {
  const bullets = (input.bullets ?? []).filter((b) => b.trim() !== '')
  return {
    type: 'bubble',
    header: header(input.title, input.category, LINE_GREEN),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '16px',
      contents: [
        { type: 'text', text: input.body, size: 'sm', wrap: true, color: '#111827' },
        ...(bullets.length > 0
          ? [
              { type: 'separator', margin: 'md' },
              ...bullets.map((b) => ({
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                margin: 'sm',
                contents: [
                  { type: 'text', text: '•', size: 'sm', color: LINE_GREEN, flex: 0 },
                  { type: 'text', text: b, size: 'sm', wrap: true, color: '#374151' }
                ]
              }))
            ]
          : [])
      ]
    },
    // ปุ่มแบบ uri ต้องเป็น https เท่านั้น ถ้าใส่ http จะ error ทันที
    ...(input.buttonLabel && input.buttonUrl
      ? {
          footer: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '12px',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: LINE_GREEN,
                action: { type: 'uri', label: input.buttonLabel, uri: input.buttonUrl }
              }
            ]
          }
        }
      : {})
  }
}

// ค่าคงที่ที่การ์ดของวันที่ 2 จะใช้ต่อ (ประกาศไว้ให้เห็นตั้งแต่วันแรก)
export const COLORS = { LINE_GREEN, NAVY, GRAY }
