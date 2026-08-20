# ย้าย pagefile จาก C: ไป F: — คืนพื้นที่ C: ราว 1.8 GB
# RAM 28 GB และ pagefile ใช้จริง 0 MB จึงย้ายได้ปลอดภัย
# ตั้งขนาดคงที่ 4096 MB บน F: (ที่ว่าง 241 GB) เผื่อ crash dump และงานหนัก
$cs = Get-CimInstance Win32_ComputerSystem
if ($cs.AutomaticManagedPagefile) {
    $cs | Set-CimInstance -Property @{ AutomaticManagedPagefile = $false }
    Write-Output "ปิด AutomaticManagedPagefile แล้ว"
}
Get-CimInstance Win32_PageFileSetting | Where-Object { $_.Name -like 'C:*' } | ForEach-Object {
    Remove-CimInstance -InputObject $_
    Write-Output "ถอด pagefile ออกจาก C: แล้ว"
}
New-CimInstance -ClassName Win32_PageFileSetting `
  -Property @{ Name = 'F:\pagefile.sys'; InitialSize = 4096; MaximumSize = 4096 } | Out-Null
Write-Output "ตั้ง pagefile ที่ F:\pagefile.sys ขนาด 4096 MB แล้ว"
Get-CimInstance Win32_PageFileSetting | ForEach-Object { "  ผลลัพธ์: {0} ({1}-{2} MB)" -f $_.Name, $_.InitialSize, $_.MaximumSize }
Write-Output "*** ต้องรีสตาร์ตเครื่องถึงจะมีผลจริง ***"
