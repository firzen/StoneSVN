; Register the install directory in the per-user PATH so `stonesvn` works from a new terminal.
!macro NSIS_HOOK_POSTINSTALL
  nsExec::Exec `powershell -NoProfile -ExecutionPolicy Bypass -Command "$$d='$INSTDIR'; $$p=[Environment]::GetEnvironmentVariable('Path','User'); $$parts=@(); if ($$p) { $$parts=$$p.Split(';') | Where-Object { $$_ -and $$_.TrimEnd('\') -ne $$d.TrimEnd('\') } }; [Environment]::SetEnvironmentVariable('Path', (@($$parts) + $$d) -join ';', 'User')"`
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  nsExec::Exec `powershell -NoProfile -ExecutionPolicy Bypass -Command "$$d='$INSTDIR'; $$p=[Environment]::GetEnvironmentVariable('Path','User'); if ($$p) { $$parts=$$p.Split(';') | Where-Object { $$_ -and $$_.TrimEnd('\') -ne $$d.TrimEnd('\') }; [Environment]::SetEnvironmentVariable('Path', ($$parts -join ';'), 'User') }"`
!macroend
