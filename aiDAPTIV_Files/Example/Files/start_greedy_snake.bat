@echo off
REM Start Greedy Snake Game

echo Starting Flask server...
cd greedy-snake
start "Flask Server" python app.py

echo Waiting for server to start...
timeout /t 3 /nobreak >nul

echo Opening game in browser...
start "" index.html

echo Greedy Snake game is now running!
echo Close the Flask Server window to stop the game.

