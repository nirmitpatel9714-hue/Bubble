; "Open in LosOS" shell verbs for folders, folder backgrounds, and drives.
; HKCU matches installer currentUser scope. %V = clicked path.
; NoWorkingDirectory keeps Explorer from overriding %V (System32 on Drive).

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInLosOS" "" "Open in LosOS"
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInLosOS" "Icon" '"$INSTDIR\losos.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInLosOS" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInLosOS\command" "" '"$INSTDIR\losos.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInLosOS" "" "Open in LosOS"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInLosOS" "Icon" '"$INSTDIR\losos.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInLosOS" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInLosOS\command" "" '"$INSTDIR\losos.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInLosOS" "" "Open in LosOS"
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInLosOS" "Icon" '"$INSTDIR\losos.exe",0'
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInLosOS" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInLosOS\command" "" '"$INSTDIR\losos.exe" "%V"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\shell\OpenInLosOS"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\OpenInLosOS"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\OpenInLosOS"
!macroend
