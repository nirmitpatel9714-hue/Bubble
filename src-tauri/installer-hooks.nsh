; "Open in Bubble" shell verbs for folders, folder backgrounds, and drives.
; HKCU matches installer currentUser scope. %V = clicked path.
; NoWorkingDirectory keeps Explorer from overriding %V (System32 on Drive).

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInBubble" "" "Open in Bubble"
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInBubble" "Icon" '"$INSTDIR\bubble.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInBubble" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInBubble\command" "" '"$INSTDIR\bubble.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInBubble" "" "Open in Bubble"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInBubble" "Icon" '"$INSTDIR\bubble.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInBubble" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInBubble\command" "" '"$INSTDIR\bubble.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInBubble" "" "Open in Bubble"
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInBubble" "Icon" '"$INSTDIR\bubble.exe",0'
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInBubble" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInBubble\command" "" '"$INSTDIR\bubble.exe" "%V"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\shell\OpenInBubble"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\OpenInBubble"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\OpenInBubble"
!macroend
