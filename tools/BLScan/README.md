# BLScan

Scan House B/L (PDF / JPG / PNG / TIF) → text (Windows OCR) → preview เป็น HTML ทรง House B/L → **UPDATE** record ที่สร้างรอไว้ใน SMF DB (`SFHBL` + `SFMARK`)

## Build / Run
```
build.bat            → bin\BLScan.exe + bin\BLScan.ini   (ใช้ csc ของ .NET Framework 4 ที่มากับ Windows)
```
ตั้งค่า DB ใน `bin\BLScan.ini` (`[Database]` Server / Database / User / Password — เว้น User ว่าง = Windows auth) · `bin/` ไม่เข้า git

| การใช้งาน | คำสั่ง |
|---|---|
| หน้าจอ | `BLScan.exe` หรือ `BLScan.exe <ไฟล์> /docno BLE26100001` (scan ทันที) |
| ไม่มีหน้าจอ | `BLScan.exe /scan <ไฟล์> /out <โฟลเดอร์> /docno X [/dryrun \| /update]` → `preview.html`, `fields.txt`, `changes.txt`, `ocr.txt`, `log.txt` |

## ตั้งค่า DB (เข้ารหัสรหัสผ่านใน ini)
- ในโปรแกรมกดปุ่ม **ตั้งค่า DB…** → กรอก Server / Database / User / Password (หรือเลือก Windows Authentication) → **ทดสอบเชื่อมต่อ** → **บันทึก**
- รหัสผ่านถูกเข้ารหัสด้วย **Windows DPAPI แบบผูกกับ "เครื่อง" (LocalMachine)** แล้วเก็บเป็น `Password=encm:<base64>` — ถ้ามี `ConnectionString` เต็มใน ini ก็เข้ารหัสแบบเดียวกัน
- **ไม่มีหน้า login** — ผู้ใช้ Windows คนไหนบนเครื่องที่ตั้งค่าไว้ก็เปิด exe ใช้ได้เลย
- **ก๊อป ini ไปเครื่องอื่นแล้วใช้ไม่ได้** จนกว่าจะกด "ตั้งค่า DB…" ผ่านโปรแกรมนี้ที่เครื่องนั้น (แถบสถานะจะแจ้งว่าถอดรหัสไม่ได้)
- ini เดิมที่เก็บรหัสผ่านเป็นข้อความธรรมดา (หรือ `enc:` รุ่นผูกผู้ใช้) ยังอ่านได้ — แปลงเป็น `encm:` ด้วย `BLScan.exe /encryptini` (หรือกดบันทึกในหน้าตั้งค่า) · เขียน ini แล้วคง comment/ลำดับเดิมไว้
- ข้อจำกัด: เพราะผูกกับเครื่อง ใครก็ตามที่ login เข้าเครื่องนั้นได้ (หรือรันโปรแกรมบนเครื่องนั้น) ถอดรหัสผ่านได้ — กันเฉพาะการก๊อปไฟล์ ini ออกไปนอกเครื่อง

## กติกา Update
1. สร้าง `SFHBL` record รอไว้ก่อน (DOCNO = key) — โปรแกรม**ไม่ INSERT SFHBL** ถ้าไม่พบ DOCNO จะปฏิเสธ · DOCNO ว่าง = ปฏิเสธ
2. `UPDATE SFHBL ... WHERE DOCNO=@d` (ไม่ตรวจ LOCK แต่ตั้ง `LOCK=CDbl(Now)`, `EDITBY`, `EDITDATE` ใหม่เหมือน frmSFBL)
   - เขียนเฉพาะช่องที่ scan ได้ค่า — ช่องว่างไม่ไปทับค่าเดิม · ไม่แตะ DOCNO/JOBNO/DOCDATE/MASTERNO/JOBCLASS/JOBTYPE/LOADTYPE/DOCSTAT/USERID
   - งาน EX: `ETDETA = ETD`
   - คู่ค้า (Shipper/Consignee/Notify/Agent): ชื่อ = **บรรทัดแรกของข้อความที่ scan ได้** → หารหัสใน `SMBUSINESS.COMNAME` (เจอหลายรหัส = ตัวแรก active ก่อน แล้วเรียง COMNO)
     - พบ → รหัสที่พบ + ชื่อ + ที่อยู่ (`S_ADD`/`C_ADD`/`N_ADD`/`A_ADD`) ที่ scan ได้
     - ไม่พบ + record เดิม**ว่าง** (รหัสและชื่อว่างทั้งคู่) → รหัส `N/A`, ชื่อ = บรรทัดแรก, ที่อยู่ = ที่ scan ได้
     - ไม่พบ + record เดิม**ไม่ว่าง** → คงรหัส/ชื่อเดิม เปลี่ยนเฉพาะที่อยู่ = ที่ scan ได้
   - รหัสท่า: จาก HBL อื่นของงานเดียวกัน → `OPPORT` (`PORTTYPE='SF'`, ชื่อตรง หรือขึ้นต้นด้วยชื่อ + `,` เลือกรหัส 5 ตัวที่ไม่กำกวม) · หน่วย → `SMUOM`
   - `PKGWORD` เก็บตามที่ scan ได้
3. `SFMARK` (HBLREF = DOCNO): ไม่มี → INSERT 1 แถว · มี → UPDATE **แถวแรก** (SEQNO, DETID) ไม่ว่ามีกี่แถว
4. 2 ตารางอยู่ใน transaction เดียว — พลาดแล้ว rollback ทั้งหมด · ไม่มี DELETE
5. **Dry run** = UPDATE จริงทุกขั้นแล้ว ROLLBACK
6. `ReferenceDocNo` ใน ini (ตอนนี้ `SI17110002/005`) = record อ้างอิง ใช้เทียบอย่างเดียว โปรแกรมไม่ยอมเขียน (dry run ได้)
7. บันทึกสำเร็จจะต่อท้าย `BLScan.log` ข้าง exe พร้อมรายการ ก่อน → หลัง

## ข้อจำกัด
- Windows OCR ภาษา en-US — ลายน้ำจาง (ORIGINAL) และตัวอักษรเล็กอย่าง `=` อาจหลุด → ตรวจในแท็บ "สิ่งที่จะเปลี่ยนใน DB" ก่อนกด Update
- ค่าที่ OCR ไม่ได้ (เช่น `B/L Type`) จะไม่ถูกเขียน
- ไฟล์ตัวอย่าง: `../../mockup/BL_OCR/` · preview ตัวอย่าง: `sample/`
