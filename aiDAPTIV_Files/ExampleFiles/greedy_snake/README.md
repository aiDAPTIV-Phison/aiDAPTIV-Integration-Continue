# 🐍 Snake Game

A classic Snake game built with HTML5 Canvas + JavaScript frontend and Python Flask backend.

## Features

- 🎮 Classic Snake gameplay
- 🏆 Local and online high score tracking
- ⏸️ Pause/Resume functionality
- 📊 Game statistics
- 🌐 Real-time leaderboard

## Game Controls

- **Arrow Keys**: Control snake movement direction
- **Spacebar**: Pause/Resume game

## Installation & Running

### 1. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 2. Start Backend Server

```bash
python app.py
```

The server will start at `http://localhost:5000`.

### 3. Open Game

Open the `index.html` file in your browser to start playing.

## API Endpoints

- `GET /api/scores` - Get high score leaderboard
- `POST /api/scores` - Add score record
- `GET /api/stats` - Get game statistics
- `GET /api/health` - Health check

## File Structure

```
greedy-snake/
├── index.html      # Main game page
├── config.js         # config setting
├── app.py          # Flask backend
├── requirements.txt # Python dependencies
├── high_scores.json # Score data (auto-generated)
└── README.md       # Documentation
```

## Notes

- Game data is stored in the `high_scores.json` file
- If backend connection fails, the game will still run normally but only save local high scores
- Modern browsers are recommended for the best experience
