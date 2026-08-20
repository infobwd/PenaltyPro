# ตั้ง pagefile บน F: ผ่าน registry โดยตรง
# Win32_PageFileSetting ผ่าน CIM มักสร้างไม่สำเร็จเงียบ ๆ จึงเขียน PagingFiles ตรง
$key = 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management'
$before = (Get-ItemProperty $key -Name PagingFiles -EA SilentlyContinue).PagingFiles
Write-Output ("ค่าเดิม: " + ($before -join ' | '))
Set-ItemProperty -Path $key -Name PagingFiles -Value @('F:\pagefile.sys 4096 8192') -Type MultiString
$after = (Get-ItemProperty $key -Name PagingFiles).PagingFiles
Write-Output ("ค่าใหม่: " + ($after -join ' | '))
Write-Output "*** ต้องรีสตาร์ตเครื่องถึงจะมีผล ***"
