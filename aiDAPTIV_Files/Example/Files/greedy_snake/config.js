(function () {
  window.GAME_CONFIG = {
    snakeEmoji: "🐍",
    foodEmoji: "🐰",
    // Can independently set the snake emoji for the page header title; falls back to snakeEmoji if not set
    titleSnakeEmoji: "🐍",
    // Website and canvas background color setting (defaults to dark color if not set)
    backgroundColor: "#2c3e50",
    // Game speed (milliseconds, smaller is faster). Recommended range: 60~300.
    gameSpeedMs: 70,
  };
})();
