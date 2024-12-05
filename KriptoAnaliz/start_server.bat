@echo off
REM Node.js server'ı başlat
start cmd /k "node server.js"

REM Tarayıcıda localhost:3000'i aç
start http://localhost:3000

REM Komut dosyasını kapat
exit