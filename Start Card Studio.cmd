@echo off
rem Starts Multiverse Card Studio on this PC and opens it in your browser.
rem Leave this window open while you use the app. Close it to stop.
cd /d "%~dp0"
start "" http://localhost:8848/
python -m http.server 8848 --bind 127.0.0.1
