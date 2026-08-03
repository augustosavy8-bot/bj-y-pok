' Arranca el agente de impresion SIN ventana (para dejarlo al iniciar Windows).
' Poné un acceso directo a este archivo en la carpeta:  shell:startup
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = carpeta
' 0 = ventana oculta ; False = no esperar a que termine
sh.Run "cmd /c node index.js", 0, False
