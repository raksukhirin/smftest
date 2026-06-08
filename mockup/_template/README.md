# `<frmYourForm>` Mockup

> **เปลี่ยนชื่อ folder จาก `_template` เป็น `frmYourForm` แล้วแก้ไฟล์ตามจุด TODO ทุกที่.**

## ที่มา

- **VB6 form ต้นฉบับ:** `frmYourForm.frm` (TODO: path / line range)
- **Business purpose:** TODO — อธิบายว่า form นี้ทำหน้าที่อะไรในระบบ
- **DB tables:** TODO — list tables ที่ involve (header + detail tables)

## Screenshots

> เพิ่ม screenshot ใน `screenshots/` แล้ว link มาที่นี่ (optional แต่แนะนำ)

| Original (VB6) | New mockup |
| --- | --- |
| ![original](screenshots/original.png) | ![mockup](screenshots/mockup.png) |

## Field index

ดู [`mapping.md`](./mapping.md) สำหรับ UI ↔ DB column mapping เต็มทุกฟิลด์.

## Validation

ดู [`validation-spec.md`](./validation-spec.md) สำหรับกฎที่ port มาจาก `Sub ChkValidate` ของ frm.

## รัน

เปิด [`index.html`](./index.html) ใน browser ตรง ๆ — ไม่ต้อง build / install.

## Smoke test

- [ ] + New, Save, Delete ใช้งานได้
- [ ] Persistence ทำงาน (refresh แล้ว data ยังอยู่)
- [ ] Validation block invalid save
- [ ] Lookup buttons resolve master data
- [ ] (ถ้ามี) Print preview render ถูก
