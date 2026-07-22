# `SFDPFJOB01_CONSOL.rpt` — สูตรที่ D12 ใช้ (คัดจาก dump แบบ verbatim)

> **อ่านไฟล์นี้แทนการเปิด `.rpt` ใหม่** — ตัวเต็มอยู่ที่ `SFDPFJOB01_CONSOL.dump.txt`
> (3,461 บรรทัด · รวม subreport `ALLOC.rpt` / `ALLHBL.rpt`, table links, record selection)
>
> **คำอธิบายว่าสูตรพวกนี้ทำงานร่วมกันยังไง → [`../FPI_D12_MarginActualization_v0.1.md`](../FPI_D12_MarginActualization_v0.1.md) §6**
>
> วิธีสร้างใหม่ (ต้องใช้ PowerShell **32-bit** เพราะ `craxdrt9` เป็น COM 32-bit):
> ```bash
> /c/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe -ExecutionPolicy Bypass \
>   -File "tools/dump-crystal-rpt.ps1" \
>   -RptPath "tools/SFDPFJOB01_CONSOL.rpt" -OutPath "<out>.txt"
> ```

---

## ชั้น 1 — ยอดต่อบรรทัด

### `{@nDetGross}`

```
'formula = Cdbl({ARINVDETAIL.SRCAMT}) * iif({ARINVHEAD.SRCCURR}="THB",(1/{SFJOB.JOBRATE}),1)
If {?prnCurr}<>1 Then
    formula = CDbl( {ARINVDETAIL.THBAMT} )
Else
    If {ARINVDETAIL.CALCURR}="THB" Then
        formula = iif({?แสดงจำนวนเงินUSD_ด้วยยอดก่อนVAT}="YES",CDbl({ARINVDETAIL.SRCAMT}),IIF({ARINVDETAIL.VATINOUT}=1,CDbl({ARINVDETAIL.SRCTOT}),CDbl({ARINVDETAIL.SRCAMT})))
        formula = formula * IIF({ARINVHEAD.SRCCURR}="THB",(1/{SFJOB.JOBRATE}),{ARINVDETAIL.CALRATE})
    ElseIf {ARINVDETAIL.CALCURR}="USD" Then
        formula = iif({?แสดงจำนวนเงินUSD_ด้วยยอดก่อนVAT}="YES",CDbl({ARINVDETAIL.SRCAMT}),IIF({ARINVDETAIL.VATINOUT}=1,CDbl({ARINVDETAIL.SRCTOT}),CDbl({ARINVDETAIL.SRCAMT})))
        formula = formula * (1/{ARINVDETAIL.CALRATE})
    Else
        formula = iif({?แสดงจำนวนเงินUSD_ด้วยยอดก่อนVAT}="YES",CDbl({ARINVDETAIL.SRCAMT}),IIF({ARINVDETAIL.VATINOUT}=1,CDbl({ARINVDETAIL.THBTOT}),CDbl({ARINVDETAIL.THBAMT})))
        formula = formula * (1/{SFJOB.JOBRATE})
    End If
End If
formula = Round(formula,2)
```

### `{@nDetTotal}`

```
If {?prnCurr}<>1 Then
    formula = CDbl( {ARINVDETAIL.THBTOT} )
Else
    formula = Cdbl({ARINVDETAIL.SRCTOT}) * iif({ARINVHEAD.SRCCURR}="THB",(1/{SFJOB.JOBRATE}),1)
End If
```

### `{@nDocBal}`

```
If {OPTRANSDETAIL.TRANSTYPE} = "Bill" Then
    IIF({ARINVHEAD.SRCTYPE}="AR" ,1,-1)
Else
    IIF({ARINVHEAD.SRCTYPE}="AP" ,1,-1)
```

### `{@nDocBalOP}`

```
If {OPTRANSDETAIL.DOCTYPE}="CN" Then
    -1
Else
    1
```

### `{@isVATIO}`

```
//If {OPTRANSDETAIL.VATINOUT}=1 Then
//    True
//Else
//    False
//
False
```

---

## ชั้น 2 — แยกประเภท

### `{@n_billrev_thb}`

```
If isnull({ARINVDETAIL.DETID}) then 
    Formula = 0
ElseIf {ARINVHEAD.POSTENTRY}=3 then 
    Formula = 0
Elseif {OPTRANSDETAIL.TRANSTYPE} = "Bill" And {OPTRANSDETAIL.ITEMTYPE} <> "ADV"  And {OPTRANSDETAIL.EXPCODE}<>"KB" then
    formula = {@nDetGross}*{@nDocBal}
Else
    formula = 0
End if
```

### `{@n_billref_thb}`

```
If isnull({ARINVDETAIL.DETID}) then 
    Formula = 0
ElseIf {ARINVHEAD.POSTENTRY}=3 then 
    Formula = 0
Elseif {OPTRANSDETAIL.TRANSTYPE} = "Bill" and {OPTRANSDETAIL.ITEMTYPE} <> "ADV" And {OPTRANSDETAIL.EXPCODE}="R/F" then
    formula = {@nDetGross}*{@nDocBal}
Else
    formula = 0
End if
```

### `{@n_billadv_thb}`

```
If isnull({ARINVDETAIL.DETID}) then 
    Formula = 0
ElseIf {ARINVHEAD.POSTENTRY}=3 then 
    Formula = 0
Elseif {OPTRANSDETAIL.TRANSTYPE} = "Bill" and {OPTRANSDETAIL.ITEMTYPE} = "ADV" then
    formula = {@nDetGross}*{@nDocBal}
Else
    formula = 0
End if

=== RUNNING TOTALS ===
  {#rtDiffAdv} : field= op= evalCond= resetCond=
```

### `{@n_vchr_thb}`

```
If isnull({ARINVDETAIL.DETID}) then 
    Formula = 0
ElseIf {ARINVHEAD.POSTENTRY}=3 then 
    Formula = 0
Elseif {OPTRANSDETAIL.TRANSTYPE} = "Cost" And {OPTRANSDETAIL.ITEMTYPE} <> "ADV" And {OPTRANSDETAIL.EXPCODE}<>"KB" then
    formula = {@nDetGross}*{@nDocBal}
Else
    formula = 0
End if
'
'การณี Saleperson : {SFHBL.DOCTYPE}="Allocated"
'   จำนวนใน Allocated HB/L ต้องไม่นำไปเป็น Direct Amount
'   เพราะถ้ามี Allocated แต่ไม่มี HB/L  จะำทำให้จำนวน Double
'   Ex.AE0812/00006 ของ PAC
If {?chgGroup1}="Saleperson" Then
    If {SFJOB.SUB_SYSNAME}="CS" OR {SFJOB.SUB_SYSNAME}="TS" Then
        If {OPTRANSDETAIL.DOCTYPE}="N/A" then
            formula = {@n_cost_com_cs}
        Else
            formula = formula
        End If
    Else
        If {?chgGroup2}="House B/L" Then
            If Trim({OPTRANSDETAIL.SALETEXTRATE})="0" Then
                formula = 0
            ElseIf {SFHBL.SALENO}={SFHBL_M.SALENO} Then
                formula = 0
            ElseIf {SFJOB.TOTBL}<=1 Then
                If {@n_cost_com}<>0 then 
                    formula = {@n_cost_com}
                Else
                    formula = formula
                End If
            Else
                If {@n_cost_com}<>0 then 
                    formula = {@n_cost_com}
                Else
                    formula = formula
                End If
            End If
        Else
            formula = formula
        End If
    End If
Else
    formula = formula
End If
```

### `{@n_vchr_kb}`

```
'Elseif {OPTRANSDETAIL.TRANSTYPE} = "Cost" and {OPTRANSDETAIL.ITEMTYPE} <> "ADV" And {OPTRANSDETAIL.EXPCODE}="KB" then
If isnull({ARINVDETAIL.DETID}) then 
    Formula = 0
ElseIf {ARINVHEAD.POSTENTRY}=3 then 
    Formula = 0
Elseif {OPTRANSDETAIL.TRANSTYPE} = "Cost" And {OPTRANSDETAIL.ITEMTYPE} <> "ADV" And {OPTRANSDETAIL.EXPCODE}="KB" then
    formula = {@nDetGross}*{@nDocBal}*iif({OPTRANSDETAIL.DOCTYPE}="DN",1,-1)
Else
    formula = 0
End if
'
'การณี Saleperson : {SFHBL.DOCTYPE}="Allocated"
'   จำนวนใน Allocated HB/L ต้องไม่นำไปเป็น Direct Amount
'   เพราะถ้ามี Allocated แต่ไม่มี HB/L  จะำทำให้จำนวน Double
'   Ex.AE0812/00006 ของ PAC
If {?chgGroup1}="Saleperson" Then
    If {SFJOB.SUB_SYSNAME}="CS" Or {SFJOB.SUB_SYSNAME}="TS" Then
        If {OPTRANSDETAIL.DOCTYPE}="N/A" then
            formula = {@n_cost_com_na_cs}
        Else
            formula = formula
        End If
    Else
        If {?chgGroup2}="House B/L" Then
            If Trim({OPTRANSDETAIL.SALETEXTRATE})="0" Then
                formula = 0
            ElseIf {SFHBL.SALENO}={SFHBL_M.SALENO} Then
                formula = 0
            ElseIf {SFJOB.TOTBL}<=1 Then
                If {@n_cost_com_na}<>0 then 
                    formula = {@n_cost_com_na}
                Else
                    formula = formula
                End If
            Else
                If {@n_cost_com_na}<>0 then 
                    formula = {@n_cost_com_na}
                Else
                    formula = formula
                End If
            End If
        Else
            formula = formula
        End If
    End If
Else
    formula = formula
End If
```

### `{@n_vchradv_thb}`

```
If isnull({ARINVDETAIL.DETID}) then 
    Formula = 0
ElseIf {ARINVHEAD.POSTENTRY}=3 then 
    Formula = 0
Elseif {OPTRANSDETAIL.TRANSTYPE} = "Cost" and {OPTRANSDETAIL.ITEMTYPE} = "ADV" then
    formula = {@nDetGross}*{@nDocBal}
Else
    formula = 0
End if
```

---

## ชั้น 3a — ฝั่ง Sale (ชั้น Saleperson)

### `{@n_billrev_thb_net}`

```
'From Direct HB/L
formula = {@n_billref_thb}+{@n_billrev_thb}+{@n_billadv_thb}
'
'การณี Saleperson : {SFHBL.DOCTYPE}="Allocated"
'   จำนวนใน Allocated HB/L ต้องไม่นำไปเป็น Direct Amount
'   เพราะถ้ามี Allocated แต่ไม่มี HB/L  จะำทำให้จำนวน Double
'   Ex.AE0812/00006 ของ PAC
If {?chgGroup1}="Saleperson" Then
    If {SFJOB.SUB_SYSNAME}="CS" Or {SFJOB.SUB_SYSNAME}="TS" Then
        If {OPTRANSDETAIL.DOCTYPE}="N/A" then
            formula = {@n_bill_com_cs}
        Else
            formula = formula
        End If
    Else
        If {?chgGroup2}="House B/L" Then
            If Trim({OPTRANSDETAIL.SALETEXTRATE})="0" Then
                formula = 0
            ElseIf {SFHBL.SALENO}={SFHBL_M.SALENO} Then
                formula = 0
            ElseIf {SFJOB.TOTBL}<=1 Then
                If {@n_bill_com}<>0 then 
                    formula = {@n_bill_com}
                Else
                    formula = formula
                End If
            Else
                If {@n_bill_com}<>0 then 
                    formula = {@n_bill_com}
                Else
                    formula = formula
                End If
            End If
        Else
            formula = formula
        End If
    End If
Else
    formula = formula
End If
```

### `{@n_vchr_thb_tot}`

```
{@n_vchr_kb}+{@n_vchr_thb}

=== RUNNING TOTALS ===
  {#r_cbm_rep} : field= op= evalCond= resetCond=
  {#r_tues_rep} : field= op= evalCond= resetCond=
  {#r_sum_cbm_job} : field= op= evalCond= resetCond=
  {#r_sum_tues_job1} : field= op= evalCond= resetCond=
  {#r_sum_gw_job} : field= op= evalCond= resetCond=
  {#r_gw_rep} : field= op= evalCond= resetCond=
  {#r_sum_cbm_hbl} : field= op= evalCond= resetCond=
  {#r_sum_gw_hbl} : field= op= evalCond= resetCond=
  {#r_sum_cbm_job1} : field= op= evalCond= resetCond=
  {#r_sum_gw_job1} : field= op= evalCond= resetCond=
  {#rtBillRevThb} : field= op= evalCond= resetCond=
  {#rtBillRevThb2} : field= op= evalCond= resetCond=
  {#rtBillRevThb3} : field= op= evalCond= resetCond=
  {#rtBillRefThb} : field= op= evalCond= resetCond=
  {#rtBillRefThb2} : field= op= evalCond= resetCond=
  {#rtBillRefThb3} : field= op= evalCond= resetCond=
  {#rtVchrThb} : field= op= evalCond= resetCond=
  {#rtVchrThb2} : field= op= evalCond= resetCond=
  {#rtVchrThb3} : field= op= evalCond= resetCond=
  {#rtVchrKb2} : field= op= evalCond= resetCond=
  {#rtVchrKb3} : field= op= evalCond= resetCond=
  {#rtDiffAdv} : field= op= evalCond= resetCond=
  {#rtDiffAdv2} : field= op= evalCond= resetCond=
  {#rtDiffAdv3} : field= op= evalCond= resetCond=
  {#rtDiffRev} : field= op= evalCond= resetCond=
  {#rtDiffRev2} : field= op= evalCond= resetCond=
  {#rtDiffRev3} : field= op= evalCond= resetCond=
  {#r_sum_cbm_job2} : field= op= evalCond= resetCond=
  {#r_sum_gw_job2} : field= op= evalCond= resetCond=
  {#r_sum_tues_job2} : field= op= evalCond= resetCond=
  {#r_20_job1} : field= op= evalCond= resetCond=
  {#r_40_job1} : field= op= evalCond= resetCond=
  {#r_40HQ_job1} : field= op= evalCond= resetCond=
  {#r_45_job1} : field= op= evalCond= resetCond=
  {#r_20_job2} : field= op= evalCond= resetCond=
  {#r_40_job2} : field= op= evalCond= resetCond=
  {#r_40HQ_job2} : field= op= evalCond= resetCond=
  {#r_45_ob2} : field= op= evalCond= resetCond=
  {#r_20_rep} : field= op= evalCond= resetCond=
  {#r_40_rep} : field= op= evalCond= resetCond=
  {#r_40HQ_rep} : field= op= evalCond= resetCond=
  {#r_45_rep} : field= op= evalCond= resetCond=
  {#r_sum_cbm_job3} : field= op= evalCond= resetCond=
  {#r_sum_gw_job3} : field= op= evalCond= resetCond=
  {#rtVchrKB} : field= op= evalCond= resetCond=
  {#rtVchrKB3} : field= op= evalCond= resetCond=
  {#r_sum_do_GMain} : field= op= evalCond= resetCond=
  {#r_sum_do_rep} : field= op= evalCond= resetCond=
  {#rtVchrAgent} : field= op= evalCond= resetCond=
  {#rtVchrAgentThb} : field= op= evalCond= resetCond=
  {#rtVchrAgent3} : field= op= evalCond= resetCond=
  {#nVchrAgentThb3} : field= op= evalCond= resetCond=
  {#rtVchrAgent2} : field= op= evalCond= resetCond=
  {#rtVchrAgentThb2} : field= op= evalCond= resetCond=
  {#rtBillRevThb_Consol} : field= op= evalCond= resetCond=
  {#rtVchrThb_consol} : field= op= evalCond= resetCond=

=== SUBREPORTS FOUND: 2 ===
  ALLOC.rpt
  ALLHBL.rpt - 01

################################################################
##  REPORT: SUBREPORT :: ALLOC.rpt
################################################################

=== TABLES ===
  alias=SFJOB   location=SFJOB
  alias=OPTRANSDETAIL   location=OPTRANSDETAIL
  alias=CSJOB   location=CSJOB
  alias=SFHBL_M   location=SFHBL
  alias=ARINVDETAIL   location=ARINVDETAIL
  alias=ARINVHEAD   location=ARINVHEAD

=== LINKS: count=5 ===
  SFJOB -> CSJOB
      on {SFJOB.JOBNO}  =  {CSJOB.JOBNO}
      join=Left Outer (5)  lookup=Product (2)  partialMatch=False
  SFJOB -> SFHBL_M
      on {SFJOB.JOBNO}  =  {SFHBL_M.DOCNO}
      join=Left Outer (5)  lookup=Product (2)  partialMatch=False
  SFHBL_M -> OPTRANSDETAIL
      on {SFHBL_M.DOCNO}  =  {OPTRANSDETAIL.HBLREF}
      join=Left Outer (5)  lookup=Product (2)  partialMatch=False
  OPTRANSDETAIL -> ARINVDETAIL
      on {OPTRANSDETAIL.REFINVDETID}  =  {ARINVDETAIL.DETID}
      join=Left Outer (5)  lookup=Product (2)  partialMatch=False
  ARINVDETAIL -> ARINVHEAD
      on {ARINVDETAIL.INVNO}  =  {ARINVHEAD.INVNO}
      join=Left Outer (5)  lookup=Product (2)  partialMatch=False

=== RECORD SELECTION ===
  {SFJOB.JOBNO} = {?Pm-SFJOB.JOBNO}

=== GROUP SELECTION ===
  

=== SQL EXPRESSIONS ===

=== FORMULA FIELDS: count=30 ===
```

---

## ชั้น 3b — ราคาโอน (Com Price)

### `{@n_bill_com}`

```
'Com ตาม Direct House B/L
If IsNull({OPTRANSDETAIL.SALETEXTRATE}) Then
    Formula = 0
ElseIf Trim({OPTRANSDETAIL.SALETEXTRATE})="" Then
    Formula = 0
ElseIf Trim({OPTRANSDETAIL.SALETEXTRATE})="0" Then
    Formula = 0
Elseif {OPTRANSDETAIL.TRANSTYPE} = "Bill" then
    If {?prnCurr}<>1 Then
        Formula = {@nDocBalOP}*{OPTRANSDETAIL.QTY}*{OPTRANSDETAIL.SALEPRICE}*IIF({OPTRANSDETAIL.ITEMCURR}="THB",1,{OPTRANSDETAIL.SALERATE})
        If {OPTRANSDETAIL.VATINOUT}=1 Then
            If {OPTRANSDETAIL.ITEMTYPE}="ADV" then
                formula = {@nDetTotal}*{@nDocBal}
            Else
                formula = {@nDetGross}*{@nDocBal}
            End If
        Else
            formula = formula
        End If
    Else
        formula = {@nDocBalOP}*{OPTRANSDETAIL.QTY}*{OPTRANSDETAIL.SALEPRICE}*IIF({OPTRANSDETAIL.ITEMCURR}="THB",1/{OPTRANSDETAIL.SALERATE},1)
    End If
Else
    formula = 0
End if
```

### `{@n_cost_com}`

```
'กรณี ไม่ใช่ N/A =>  {OPTRANSDETAIL.SALETEXTRATE}=0 คือไม่ให้ , ว่าง  คือให้ตาม Price , มี ComPrice  คือให้ตาม Com Price
If IsNull({OPTRANSDETAIL.SALETEXTRATE}) Then
    Formula = 0
ElseIf Trim({OPTRANSDETAIL.SALETEXTRATE})="" Then
    Formula = 0
ElseIf Trim({OPTRANSDETAIL.SALETEXTRATE})="0" Then
    Formula = 0
Elseif {OPTRANSDETAIL.TRANSTYPE} = "Cost" And {OPTRANSDETAIL.EXPCODE}<>"KB" then
    If {?prnCurr}<>1 Then
        Formula = {@nDocBalOP}*{OPTRANSDETAIL.QTY}*{OPTRANSDETAIL.SALEPRICE}*IIF({OPTRANSDETAIL.ITEMCURR}="THB",1,{OPTRANSDETAIL.SALERATE})
        If {OPTRANSDETAIL.VATINOUT}=1 Then
            If {OPTRANSDETAIL.ITEMTYPE}="ADV" then
                formula = {@nDetTotal}*{@nDocBal}
            Else
                formula = {@nDetGross}*{@nDocBal}
            End If
        Else
            Formula = Formula
        End If
    Else
        formula = {@nDocBalOP}*{OPTRANSDETAIL.QTY}*{OPTRANSDETAIL.SALEPRICE}*IIF({OPTRANSDETAIL.ITEMCURR}="THB",1/{OPTRANSDETAIL.SALERATE},1)
    End If
Else
    formula = 0
End if
```

---

## ชั้น 3c — ฝั่ง Consol + บรรทัดโอน N/A

### `{@n_billrev_thb_consol}`

```
If isnull({ARINVDETAIL.DETID}) then
    Formula = 0
ElseIf {ARINVHEAD.POSTENTRY}=3 then
    Formula = 0
ElseIf {SFHBL.SALENO}={SFHBL_M.SALENO} Then
    if {OPTRANSDETAIL.TRANSTYPE} = "Bill" then
        If {OPTRANSDETAIL.ITEMTYPE}="ADV" then
            formula = {@nDetTotal}*{@nDocBal}
        Else
            formula = {@nDetGross}*{@nDocBal}
        End If
    Else
         formula = 0
    End if
ElseIf Trim({OPTRANSDETAIL.SALETEXTRATE})="0" Then
    if {OPTRANSDETAIL.TRANSTYPE} = "Bill" then
        If {OPTRANSDETAIL.ITEMTYPE}="ADV" then
            formula = {@nDetTotal}*{@nDocBal}
        Else
            formula = {@nDetGross}*{@nDocBal}
        End If
    Else
         formula = 0
    End if
Else
    Formula = 0
End if
'
If {@n_vchr_n_a_consol}>0 Then
    Formula = Formula+0
Else
    Formula = Formula+Abs({@n_vchr_n_a_consol})
End If
```

### `{@n_vchr_thb_consol}`

```
If isnull({ARINVDETAIL.DETID}) then
    Formula = 0
ElseIf {ARINVHEAD.POSTENTRY}=3 then
    Formula = 0
ElseIf {SFHBL.SALENO}={SFHBL_M.SALENO} Then
    if {OPTRANSDETAIL.TRANSTYPE} = "Cost" then
        If {OPTRANSDETAIL.ITEMTYPE} = "ADV" then
            formula = {@nDetTotal}*{@nDocBal}
        Else
            formula = {@nDetGross}*{@nDocBal}
        End If
    Else
         formula = 0
    End if
ElseIf Trim({OPTRANSDETAIL.SALETEXTRATE})="0" Then
    if {OPTRANSDETAIL.TRANSTYPE} = "Cost" then
        If {OPTRANSDETAIL.ITEMTYPE} = "ADV" Then
            formula = {@nDetTotal}*{@nDocBal}
        Else
            formula = {@nDetGross}*{@nDocBal}
        End If
    Else
         formula = 0
    End if
Else
    Formula = 0
End if
'
If {@n_vchr_n_a_consol}>0 Then
    Formula = Formula+{@n_vchr_n_a_consol}
Else
    Formula = Formula+0
End If
```

### `{@n_vchr_n_a_consol}`

```
If {OPTRANSDETAIL.DOCTYPE}="N/A" Then
    (If {OPTRANSDETAIL.TRANSTYPE}="Bill" Then
        {@n_billrev_thb_net}
    Else
        -1*({@n_vchr_kb}+{@n_vchr_thb}+{@n_vchradv_thb})
    )
Else
    0
```

---

## ชั้น 4a — basis และตัวคูณ

### `{@cAllocBy}`

```
If IsNull({OPTRANSDETAIL.ALLOCBY}) Then
    If Left({OPTRANSDETAIL.UOM},2)="KG" Then
        Formula="KGS"
    ElseIf Left({OPTRANSDETAIL.UOM},3)="CBM" Then
        Formula="CBM"
    ElseIf Left({OPTRANSDETAIL.UOM},2)="M3" Then
        Formula="CBM"
    Else
        Formula="SHP"
    End If
ElseIf Trim({OPTRANSDETAIL.ALLOCBY})="" Then
    If Left({OPTRANSDETAIL.UOM},2)="KG" Then
        Formula="KGS"
    ElseIf Left({OPTRANSDETAIL.UOM},3)="CBM" Then
        Formula="CBM"
    ElseIf Left({OPTRANSDETAIL.UOM},2)="M3" Then
        Formula="CBM"
    Else
        Formula="SHP"
    End If
Else
    Formula={OPTRANSDETAIL.ALLOCBY}
End if
```

### `{@n_cbm}`

```
If {?chgGroup2}="House B/L" Then
    If IsNull({SFHBL.REVTON}) Then
        If {@isHideHBL} Then
            Formula = 0
        Else
            Formula = {SFHBL.CBM}
        End if
    Else
        If {@isHideHBL} Then
            Formula = 0
        Else    
            If {?AvgType}="REV/TONs" Then
                Formula = {SFHBL.REVTON}
            Else
                Formula = {SFHBL.CBM}
            End If
        End if
    End If
Else
    If IsNull({SFJOB.REVTON}) Then
        Formula = {SFJOB.CBM}
    Else
        If {?AvgType}="REV/TONs" Then
            Formula = {SFJOB.REVTON}
        Else
            Formula = {SFJOB.CBM}
        End If
    End If
End If
```

### `{@n_cbm_ratio}`

```
If {?chgGroup2}="House B/L" Then
    If IsNull({SFJOB.REVTON}) Then
        If {@isHideHBL} Then
            Formula = 0
        ElseIf {SFJOB.CBM}=0 Then
            Formula = 0
        Else
            Formula = {@n_cbm}/{SFJOB.CBM}
        End If
    Else
        If {@isHideHBL} Then
            Formula = 0
        Else    
            If {?AvgType}="REV/TONs" Then
                If {SFJOB.REVTON}=0 Then
                    Formula = 0
                Else
                    Formula = {@n_cbm}/{SFJOB.REVTON}
                End If
            Else
                If {SFJOB.CBM}=0 Then
                    Formula = 0
                Else
                    Formula = {@n_cbm}/{SFJOB.CBM}
                End If
            End If
        End If
    End If
Else
    Formula = 1
End If

Formula=Round(Formula,10)
```

### `{@isHideHBL}`

```
if Left({SFJOB.LOADTYPE},6) = "DIRECT" then
    False
else
    {SFHBL.JOBNO}={SFHBL.DOCNO}
```

---

## ชั้น 4b — ผลรวมการเฉลี่ย

### `{@xBillRevThb_Alloc}`

```
'จาก Alloctae HB/L
If {SFJOB.SUB_SYSNAME}="CS" OR {SFJOB.SUB_SYSNAME}="TS" Then
    Formula=0
ElseIf {SFJOB.TOTBL}<=1 Then
    Formula=0
ElseIf {?AvgBy}="REVENUE" Or {?AvgBy}="ALL" Then
    'จาก Alloctae HB/L
    If {?chgGroup1}="Saleperson" Then
        Formula=ToNumber({@n_BillAvgCom_cbm})+ToNumber({@n_BillAvgCom_shp})+ToNumber({@n_BillAvgCom_kgs})+ToNumber({@n_BillAvgCom_do})
     Else
        'เอา Direct+Allocate
        Formula=ToNumber({@n_BillAvg_cbm})+ToNumber({@n_BillAvg_kgs})+ToNumber({@n_BillAvg_shp})+ToNumber({@n_BillAvg_do})
    End If
Else
    'จาก Direct HB/L
    Formula=0
End if
```

### `{@xVchrThb_Alloc}`

```
'จาก Alloctae HB/L
If {SFJOB.SUB_SYSNAME}="CS" OR {SFJOB.SUB_SYSNAME}="TS" Then
    Formula=0
ElseIf {SFJOB.TOTBL}<=1 Then
    Formula=0
ElseIf {?AvgBy}="COST" Or {?AvgBy}="ALL" Then
    'จาก Alloctae HB/L
    If {?chgGroup1}="Saleperson" Then
        'จาก Allocate
        Formula=ToNumber({@n_vchrAvgComKB_cbm})+ToNumber({@n_vchrAvgComKB_kgs})+ToNumber({@n_vchrAvgComKB_shp})+ToNumber({@n_vchrAvgComKB_do})
    Else
        'เอา Direct+Allocate
        Formula=ToNumber({@n_vchrAvgkb_cbm})+ToNumber({@n_vchrAvgkb_kgs})+ToNumber({@n_vchrAvgkb_shp})+ToNumber({@n_vchrAvgkb_do})
    End If
Else
    'จาก Direct HB/L
    Formula=0
End if

If {SFJOB.SUB_SYSNAME}="CS" OR {SFJOB.SUB_SYSNAME}="TS" Then
    Formula=Formula + 0
ElseIf {SFJOB.TOTBL}<=1 Then
    Formula=Formula + 0
ElseIf {?AvgBy}="COST" Or {?AvgBy}="ALL" Then
    'จาก Alloctae HB/L
    If {?chgGroup1}="Saleperson" Then
        'จาก Allocate
        Formula=Formula + ToNumber({@n_vchrAvgCom_cbm})+ToNumber({@n_vchrAvgCom_kgs})+ToNumber({@n_vchrAvgCom_shp})+ToNumber({@n_vchrAvgCom_do})
    Else
        'เอา Direct+Allocate
        Formula=Formula + ToNumber({@n_vchrAvg_cbm})+ToNumber({@n_vchrAvg_kgs})+ToNumber({@n_vchrAvg_shp})+ToNumber({@n_vchrAvg_do})
    End If
Else
    'จาก Direct HB/L
    Formula=Formula + 0
End if
```

---

## ชั้น 4c — Real Allocate (ใช้ยอด invoice)

### `{@n_BillAvg_cbm}`

```
'Real Allocate
If isnull({ARINVDETAIL.DETID}) then 
    Formula = 0
ElseIf {ARINVHEAD.POSTENTRY}=3 then 
    Formula = 0
ElseIf {@cAllocBy}<>"CBM" Then
    Formula = 0
ElseIf {OPTRANSDETAIL.HBLREF}<>{OPTRANSDETAIL.JOBNO} Then
    Formula = 0
ElseIf {?chgGroup1}="Saleperson" And Trim({OPTRANSDETAIL.SALETEXTRATE})="0" Then
    Formula = 0 'ไม่ให้มี Real Allocate
Elseif {OPTRANSDETAIL.TRANSTYPE} = "Bill" then
    formula = {@nDetGross}*{@nDocBal}
Else
    formula = 0
End if
```

### `{@n_BillAvg_kgs}`

```
'Real Allocate
If isnull({ARINVDETAIL.DETID}) then 
    Formula = 0
ElseIf {ARINVHEAD.POSTENTRY}=3 then 
    Formula = 0
ElseIf {@cAllocBy}<>"KGS" Then
    Formula = 0
ElseIf {OPTRANSDETAIL.HBLREF}<>{OPTRANSDETAIL.JOBNO} Then
    Formula = 0
ElseIf {?chgGroup1}="Saleperson" And Trim({OPTRANSDETAIL.SALETEXTRATE})="0" Then
    Formula = 0 'ไม่ให้มี Real Allocate
Elseif {OPTRANSDETAIL.TRANSTYPE} = "Bill" then
    formula = {@nDetGross}*{@nDocBal}
Else
    formula = 0
End if
```

### `{@n_BillAvg_shp}`

```
'Real Allocate
If isnull({ARINVDETAIL.DETID}) then 
    Formula = 0
ElseIf {ARINVHEAD.POSTENTRY}=3 then 
    Formula = 0
ElseIf {@cAllocBy}<>"SHP" Then
    Formula = 0
ElseIf {OPTRANSDETAIL.HBLREF}<>{OPTRANSDETAIL.JOBNO} Then
    Formula = 0
ElseIf {?chgGroup1}="Saleperson" And Trim({OPTRANSDETAIL.SALETEXTRATE})="0" Then
    Formula = 0 'ไม่ให้มี Real Allocate
Elseif {OPTRANSDETAIL.TRANSTYPE} = "Bill" then
    formula = {@nDetGross}*{@nDocBal}
Else
    formula = 0
End if
```

### `{@n_BillAvg_do}`

```
'Real Allocate
If isnull({ARINVDETAIL.DETID}) then 
    Formula = 0
ElseIf {ARINVHEAD.POSTENTRY}=3 then 
    Formula = 0
ElseIf {@cAllocBy}<>"D/O" Then
    Formula = 0
ElseIf {OPTRANSDETAIL.HBLREF}<>{OPTRANSDETAIL.JOBNO} Then
    Formula = 0
ElseIf {?chgGroup1}="Saleperson" And Trim({OPTRANSDETAIL.SALETEXTRATE})="0" Then
    Formula = 0 'ไม่ให้มี Real Allocate
Elseif {OPTRANSDETAIL.TRANSTYPE} = "Bill" then
    formula = {@nDetGross}*{@nDocBal}
Else
    formula = 0
End if
```

### `{@n_vchrAvgkb_cbm}`

```
Shared CurrencyVar nCostAvgCbmKB;
Round( nCostAvgCbmKB * {@n_cbm_ratio} , 2)
```

### `{@n_vchrAvgkb_kgs}`

```
Shared CurrencyVar nCostAvgKgsKB;
//nCostAvgKgs;
If {SFJOB.GW}=0 Then
    nCostAvgKgsKB
Else
    Round( nCostAvgKgsKB * {SFHBL.GW}/{SFJOB.GW} , 2)
```

### `{@n_vchrAvgkb_shp}`

```
Shared CurrencyVar nCostAvgShpKB;
if isnull({SFJOB.TOTBL}) Then
    Round( nCostAvgShpKB ,2)
else if {SFJOB.TOTBL}=0 Then
    Round( nCostAvgShpKB ,2)
Else
    Round( nCostAvgShpKB * 1/{SFJOB.TOTBL},2)
```

### `{@n_vchrAvgkb_do}`

```
Shared CurrencyVar nCostAvgDoKB;
if isnull({SFJOB.TOTDO}) Then
    0
Else if {SFJOB.TOTDO}>0 Then
    Round( nCostAvgDoKB * 1/{SFJOB.TOTDO},2)    
Else
    Round( nCostAvgDoKB ,2)
```

---

## ชั้น 4d — Com Allocate (ใช้ QTY × SALEPRICE)

### `{@n_BillAvgCom_cbm}`

```
Shared CurrencyVar nBillAvgComCbm;
Round( nBillAvgComCbm * {@n_cbm_ratio} , 2)
```

### `{@n_BillAvgCom_kgs}`

```
Shared CurrencyVar nBillAvgComKgs;
If {SFJOB.GW}=0 Then
    nBillAvgComKgs
Else
    Round( nBillAvgComKgs*{SFHBL.GW}/{SFJOB.GW}, 2)
```

### `{@n_BillAvgCom_shp}`

```
Shared CurrencyVar nBillAvgComShp;
if isnull({SFJOB.TOTBL}) Then
    Round( nBillAvgComShp ,2)
else if {SFJOB.TOTBL}=0 Then
    Round( nBillAvgComShp ,2)
Else
    Round( nBillAvgComShp * 1/{SFJOB.TOTBL},2)
```

### `{@n_BillAvgCom_do}`

```
Shared CurrencyVar nBillAvgComDO;
if isNull({SFJOB.TOTDO}) Then
    0
Else if {SFJOB.TOTDO}>0 Then
    Round( nBillAvgComDO * {SFHBL.TOTDO}/{SFJOB.TOTDO},2)    
Else
    Round( nBillAvgComDO ,2)
```

### `{@n_CostCom_cbm}`

```
'ใน ALLOCATED + กรณี Saleperson : ให้เอาจำนวนไปกระจายตามหลักการทำ Commision
If {@cAllocBy}="CBM" then
    If {?chgGroup1}="Saleperson" Then
        If IsNull({OPTRANSDETAIL.SALETEXTRATE}) Then
            Formula = {@n_vchr_cbm}
        ElseIf Trim({OPTRANSDETAIL.SALETEXTRATE})="" Then
            Formula = {@n_vchr_cbm}
        ElseIf Trim({OPTRANSDETAIL.SALETEXTRATE})="0" Then
            Formula = 0
        Elseif {OPTRANSDETAIL.HBLREF}<>{OPTRANSDETAIL.JOBNO} then
            Formula = 0
        Elseif {OPTRANSDETAIL.TRANSTYPE} = "Cost" And {OPTRANSDETAIL.EXPCODE}<>"KB" then
            If {?prnCurr}<>1 Then
                Formula = {OPTRANSDETAIL.QTY}*{OPTRANSDETAIL.SALEPRICE}*IIF({OPTRANSDETAIL.ITEMCURR}="THB",1,{OPTRANSDETAIL.SALERATE})*iif({OPTRANSDETAIL.DOCTYPE}="CN",-1,1)
            Else
                formula = {OPTRANSDETAIL.QTY}*{OPTRANSDETAIL.SALEPRICE}*IIF({OPTRANSDETAIL.ITEMCURR}="THB",1/{OPTRANSDETAIL.SALERATE},1)*iif({OPTRANSDETAIL.DOCTYPE}="CN",-1,1)
            End If
        Else
            formula = 0
        End if
    Else
        formula = 0
    End if
Else
    formula = 0
End if
```

### `{@n_CostCom_kgs}`

```
'ใน ALLOCATED + กรณี Saleperson : ให้เอาจำนวนไปกระจายตามหลักการทำ Commision
If {@cAllocBy}="KGS" then
    If {?chgGroup1}="Saleperson" Then
        If IsNull({OPTRANSDETAIL.SALETEXTRATE}) Then
            Formula = {@n_vchr_kgs}
        ElseIf Trim({OPTRANSDETAIL.SALETEXTRATE})="" Then
            Formula = {@n_vchr_kgs}
        ElseIf Trim({OPTRANSDETAIL.SALETEXTRATE})="0" Then
            Formula = 0
        Elseif {OPTRANSDETAIL.HBLREF}<>{OPTRANSDETAIL.JOBNO} then
            Formula = 0
        Elseif {OPTRANSDETAIL.TRANSTYPE} = "Cost" And {OPTRANSDETAIL.EXPCODE}<>"KB" then
            If {?prnCurr}<>1 Then
                Formula = {OPTRANSDETAIL.QTY}*{OPTRANSDETAIL.SALEPRICE}*IIF({OPTRANSDETAIL.ITEMCURR}="THB",1,{OPTRANSDETAIL.SALERATE})*iif({OPTRANSDETAIL.DOCTYPE}="CN",-1,1)
            Else
                formula = {OPTRANSDETAIL.QTY}*{OPTRANSDETAIL.SALEPRICE}*IIF({OPTRANSDETAIL.ITEMCURR}="THB",1/{OPTRANSDETAIL.SALERATE},1)*iif({OPTRANSDETAIL.DOCTYPE}="CN",-1,1)
            End If
        Else
            formula = 0
        End if
    Else
        formula = 0
    End if
Else
    formula = 0
End if
```

### `{@n_vchrAvgComKB_cbm}`

```
Shared CurrencyVar nCostAvgComCbm_na;
Round( nCostAvgComCbm_na * {@n_cbm_ratio} , 2)
```

### `{@n_vchrAvgComKB_kgs}`

```
Shared CurrencyVar nCostAvgComKgs_na;
If {SFJOB.GW}=0 Then
    nCostAvgComKgs_na
Else
    Round( nCostAvgComKgs_na * {SFHBL.GW}/{SFJOB.GW}, 2)
```

### `{@n_vchrAvgComKB_shp}`

```
Shared CurrencyVar nCostAvgComShp_na;
if isnull({SFJOB.TOTBL}) Then
    Round( nCostAvgComShp_na ,2)
else if {SFJOB.TOTBL}=0 Then
    Round( nCostAvgComShp_na ,2)
Else
    Round( nCostAvgComShp_na * 1/{SFJOB.TOTBL},2)
```

### `{@n_vchrAvgComKB_do}`

```
Shared CurrencyVar nCostAvgComDO_KB;
if isnull({SFJOB.TOTDO}) Then
    0
Else if {SFJOB.TOTDO}>0 Then
    Round( nCostAvgComDO_KB * {SFHBL.TOTDO}/{SFJOB.TOTDO},2)    
Else
    Round( nCostAvgComDO_KB ,2)
```

---

## ชื่อที่หาไม่เจอใน dump

ไม่มีในไฟล์ — อาจอยู่คนละชื่อ หรืออยู่ใน subreport:

`n_CostCom_shp`
