# Dump a Crystal Reports .rpt (tables, formulas, selection, subreports) to text.
# Requires the Crystal Reports 9 RDC (craxdrt9.dll) registered on the machine.
# craxdrt9 is 32-bit COM, so this MUST run under the 32-bit PowerShell host --
# under 64-bit it fails with 0x80040154 REGDB_E_CLASSNOTREG.
#
#   %WINDIR%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe `
#     -ExecutionPolicy Bypass -File tools\dump-crystal-rpt.ps1 `
#     -RptPath "G:\@SMART_REPORT\DEMO\REPORT\SF\REPORT\SFDPFJOB01_CONSOL.rpt" `
#     -OutPath ".\CONSOL_full.txt"

param(
  [Parameter(Mandatory=$true)][string]$RptPath,
  [Parameter(Mandatory=$true)][string]$OutPath
)
$ErrorActionPreference = 'Continue'
$sb = New-Object System.Text.StringBuilder
function W($s) { [void]$sb.AppendLine([string]$s) }

# Values read out of the craxddrt9 typelib (CRLinkJoinType / CRLinkLookUpType).
# Note they start at 4, not 1 -- a 1-based guess mislabels every join.
$JOIN_TYPE = @{
  4 = 'Equal'; 5 = 'Left Outer'; 6 = 'Right Outer'; 7 = 'Full Outer'; 8 = 'Greater Than'
  9 = 'Less Than'; 10 = 'Greater Or Equal'; 11 = 'Less Or Equal'; 12 = 'Not Equal'; 13 = 'Advance'
}
$LOOKUP_TYPE = @{ 1 = 'Parallel'; 2 = 'Product'; 3 = 'Series' }

function Enum-Name($map, $v) {
  if ($map.ContainsKey([int]$v)) { return ($map[[int]$v] + " ($v)") } else { return "unknown ($v)" }
}

function Dump-Report($rpt, $label) {
  W ""
  W "################################################################"
  W "##  REPORT: $label"
  W "################################################################"

  W ""
  W "=== TABLES ==="
  foreach ($t in $rpt.Database.Tables) { W ("  alias=" + $t.Name + "   location=" + $t.Location) }

  try {
    $links = $rpt.Database.Links
    W ""
    W ("=== LINKS: count=" + $links.Count + " ===")
    # Walk with Item($i): foreach over this collection yields the collection
    # itself, and handing a COM collection to a PS function faults the process,
    # so both loops stay inline.
    for ($i = 1; $i -le $links.Count; $i++) {
      $l = $links.Item($i)
      $sf = @(); for ($j = 1; $j -le $l.SourceFields.Count; $j++)      { $sf += $l.SourceFields.Item($j).Name }
      $df = @(); for ($j = 1; $j -le $l.DestinationFields.Count; $j++) { $df += $l.DestinationFields.Item($j).Name }
      W ("  " + $l.SourceTable.Name + " -> " + $l.DestinationTable.Name)
      W ("      on " + ($sf -join ' + ') + "  =  " + ($df -join ' + '))
      W ("      join=" + (Enum-Name $JOIN_TYPE $l.JoinType) + "  lookup=" + (Enum-Name $LOOKUP_TYPE $l.LookupType) + "  partialMatch=" + $l.PartialMatchEnabled)
    }
  } catch { W ("  <links unavailable: " + $_.Exception.Message + ">") }

  W ""
  W ("=== RECORD SELECTION ===")
  W ("  " + $rpt.RecordSelectionFormula)

  W ""
  W ("=== GROUP SELECTION ===")
  W ("  " + $rpt.GroupSelectionFormula)

  try {
    W ""
    W "=== SQL EXPRESSIONS ==="
    foreach ($s in $rpt.SQLExpressionFields) { W ("----- {%" + $s.Name + "} -----"); W $s.Text }
  } catch { W "  <none>" }

  W ""
  W ("=== FORMULA FIELDS: count=" + $rpt.FormulaFields.Count + " ===")
  foreach ($f in $rpt.FormulaFields) {
    W ("----- {@" + ($f.Name -replace '[{}@]','') + "} -----")
    W $f.Text
    W ""
  }

  try {
    W "=== RUNNING TOTALS ==="
    foreach ($rt in $rpt.RunningTotalFields) {
      W ("  " + $rt.Name + " : field=" + $rt.SummarizedField.Name + " op=" + $rt.Operation + " evalCond=" + $rt.EvaluateCondition + " resetCond=" + $rt.ResetCondition)
    }
  } catch { W "  <none>" }
}

try {
  $app = New-Object -ComObject CrystalDesignRunTime.Application
  $rpt = $app.OpenReport($RptPath, 1)
  Dump-Report $rpt "MAIN :: $RptPath"

  # walk every section for subreport objects
  $subNames = @()
  foreach ($sec in $rpt.Sections) {
    foreach ($ro in $sec.ReportObjects) {
      if ($ro.Kind -eq 5) { $subNames += $ro.SubreportName }   # 5 = crSubreportObject
    }
  }
  W ""
  W "=== SUBREPORTS FOUND: $($subNames.Count) ==="
  foreach ($n in $subNames) { W ("  " + $n) }

  foreach ($n in ($subNames | Select-Object -Unique)) {
    try {
      $sub = $rpt.OpenSubreport($n)
      Dump-Report $sub "SUBREPORT :: $n"
    } catch { W "!! cannot open subreport ${n}: $($_.Exception.Message)" }
  }

  # Close is absent on some report objects; the dump is already complete by here.
  try { $rpt.Close() } catch { }
}
catch {
  W "!! ERROR: $($_.Exception.Message)"
}

[System.IO.File]::WriteAllText($OutPath, $sb.ToString(), [System.Text.Encoding]::UTF8)
Write-Output "written: $OutPath"
