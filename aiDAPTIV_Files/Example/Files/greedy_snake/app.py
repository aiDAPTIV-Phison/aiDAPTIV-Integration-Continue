from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
from datetime import datetime, timedelta
from functools import wraps
import logging
from logging.handlers import RotatingFileHandler
import traceback

# ============================================================================
# Application Configuration
# ============================================================================
class Config:
    """
    Application configuration class for managing all settings
    This centralizes configuration management and makes it easier to modify settings
    """
    # File paths
    SCORES_FILE = 'high_scores.json'
    LOG_FILE = '../app.log'
    
    # Application settings
    DEBUG = True
    HOST = '0.0.0.0'
    PORT = 5001
    
    # Score settings
    MAX_SCORES_STORED = 100  # Maximum number of scores to keep in storage
    TOP_SCORES_DISPLAY = 10   # Number of top scores to display
    MIN_SCORE = 0             # Minimum valid score
    MAX_SCORE = 999999        # Maximum valid score
    
    # Logging settings
    LOG_MAX_BYTES = 10 * 1024 * 1024  # 10MB
    LOG_BACKUP_COUNT = 5
    LOG_LEVEL = logging.INFO

# Initialize Flask application
app = Flask(__name__)
CORS(app)

# ============================================================================
# Logging Configuration
# ============================================================================
def setup_logging():
    """
    Configure application logging with file rotation
    This helps track application behavior and debug issues
    """
    # Create logger
    logger = logging.getLogger('snake_game')
    logger.setLevel(Config.LOG_LEVEL)
    
    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # File handler with rotation
    file_handler = RotatingFileHandler(
        Config.LOG_FILE,
        maxBytes=Config.LOG_MAX_BYTES,
        backupCount=Config.LOG_BACKUP_COUNT
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    return logger

# Initialize logger
logger = setup_logging()

# ============================================================================
# Utility Functions
# ============================================================================
def log_request(f):
    """
    Decorator to log API requests
    This helps track API usage and debug issues
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        logger.info(f"Request: {request.method} {request.path} from {request.remote_addr}")
        try:
            result = f(*args, **kwargs)
            logger.info(f"Response: {request.method} {request.path} - Success")
            return result
        except Exception as e:
            logger.error(f"Error in {request.path}: {str(e)}\n{traceback.format_exc()}")
            raise
    return decorated_function

def validate_score_value(score):
    """
    Validate if a score value is within acceptable range
    
    Args:
        score: The score value to validate
        
    Returns:
        tuple: (is_valid, error_message)
    """
    if not isinstance(score, int):
        return False, 'Score must be an integer'
    
    if score < Config.MIN_SCORE:
        return False, f'Score must be at least {Config.MIN_SCORE}'
    
    if score > Config.MAX_SCORE:
        return False, f'Score cannot exceed {Config.MAX_SCORE}'
    
    return True, None

def load_scores():
    """
    Load score data from JSON file
    
    This function reads the high scores file and returns the data.
    If the file doesn't exist or is corrupted, it returns an empty list.
    
    Returns:
        list: List of score dictionaries
    """
    if os.path.exists(Config.SCORES_FILE):
        try:
            with open(Config.SCORES_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                logger.info(f"Loaded {len(data)} scores from file")
                return data
        except (json.JSONDecodeError, IOError) as e:
            logger.error(f"Error loading scores: {str(e)}")
            return []
    logger.info("Scores file not found, returning empty list")
    return []

def save_scores(scores):
    """
    Save score data to JSON file
    
    This function writes the scores to a JSON file with proper formatting
    and error handling.
    
    Args:
        scores: List of score dictionaries to save
        
    Returns:
        bool: True if save successful, False otherwise
    """
    try:
        with open(Config.SCORES_FILE, 'w', encoding='utf-8') as f:
            json.dump(scores, f, ensure_ascii=False, indent=2)
        logger.info(f"Saved {len(scores)} scores to file")
        return True
    except IOError as e:
        logger.error(f"Error saving scores: {str(e)}")
        return False

def get_score_rank(score_value):
    """
    Calculate the rank of a given score among all scores
    
    Args:
        score_value: The score to rank
        
    Returns:
        int: The rank (1-based) of the score
    """
    scores = load_scores()
    if not scores:
        return 1
    
    score_values = [s['score'] for s in scores]
    score_values.sort(reverse=True)
    
    # Find rank (1-based)
    for rank, s in enumerate(score_values, 1):
        if score_value >= s:
            return rank
    
    return len(score_values) + 1

def filter_scores_by_date(scores, days=None):
    """
    Filter scores by date range
    
    Args:
        scores: List of score dictionaries
        days: Number of days to look back (None for all time)
        
    Returns:
        list: Filtered scores
    """
    if days is None:
        return scores
    
    cutoff_date = datetime.now() - timedelta(days=days)
    filtered = []
    
    for score in scores:
        try:
            score_date = datetime.fromisoformat(score.get('timestamp', score.get('date', '')))
            if score_date >= cutoff_date:
                filtered.append(score)
        except (ValueError, TypeError):
            # If date parsing fails, include the score
            filtered.append(score)
    
    return filtered

# ============================================================================
# API Endpoints
# ============================================================================
@app.route('/api/scores', methods=['GET'])
@log_request
def get_scores():
    """
    Get high score leaderboard
    
    Query parameters:
        limit: Number of scores to return (default: 10)
        days: Filter scores from last N days (optional)
        
    Returns:
        JSON array of top scores sorted by score descending
    """
    try:
        scores = load_scores()
        
        # Filter by date if specified
        days = request.args.get('days', type=int)
        if days:
            scores = filter_scores_by_date(scores, days)
        
        # Sort by score in descending order
        scores.sort(key=lambda x: x['score'], reverse=True)
        
        # Get limit parameter or use default
        limit = request.args.get('limit', Config.TOP_SCORES_DISPLAY, type=int)
        limit = min(limit, 100)  # Cap at 100
        
        # Return top scores
        return jsonify(scores[:limit])
    except Exception as e:
        logger.error(f"Error in get_scores: {str(e)}")
        return jsonify({'error': 'Failed to retrieve scores'}), 500

@app.route('/api/scores', methods=['POST'])
@log_request
def add_score():
    """
    Add a new score record
    
    Request body (JSON):
        score: int - The score value (required)
        timestamp: str - ISO format timestamp (optional)
        
    Returns:
        JSON object with the saved score and rank information
    """
    try:
        data = request.get_json()

        # Validate request data
        if not data or 'score' not in data:
            logger.warning("Score submission missing score data")
            return jsonify({'error': 'Missing score data'}), 400

        score = data['score']
        
        # Use enhanced validation
        is_valid, error_msg = validate_score_value(score)
        if not is_valid:
            logger.warning(f"Invalid score value: {score} - {error_msg}")
            return jsonify({'error': error_msg}), 400

        # Get current rank before adding
        current_rank = get_score_rank(score)
        
        scores = load_scores()

        # Create new score record
        new_score = {
            'score': score,
            'timestamp': data.get('timestamp', datetime.now().isoformat()),
            'date': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }

        scores.append(new_score)

        # Keep maximum records as configured
        scores.sort(key=lambda x: x['score'], reverse=True)
        scores = scores[:Config.MAX_SCORES_STORED]

        if save_scores(scores):
            logger.info(f"Score saved: {score} (rank: {current_rank})")
            return jsonify({
                'message': 'Score saved successfully',
                'score': new_score,
                'rank': current_rank,
                'total_scores': len(scores)
            }), 201
        else:
            logger.error("Failed to save scores to file")
            return jsonify({'error': 'Save failed'}), 500

    except Exception as e:
        logger.error(f"Error in add_score: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/stats', methods=['GET'])
@log_request
def get_stats():
    """
    Get comprehensive game statistics
    
    Query parameters:
        days: Filter statistics from last N days (optional)
        
    Returns:
        JSON object with various statistics about game scores
    """
    try:
        scores = load_scores()
        
        # Filter by date if specified
        days = request.args.get('days', type=int)
        if days:
            scores = filter_scores_by_date(scores, days)

        if not scores:
            return jsonify({
                'total_games': 0,
                'highest_score': 0,
                'lowest_score': 0,
                'average_score': 0,
                'median_score': 0,
                'total_records': 0
            })

        score_values = [s['score'] for s in scores]
        score_values_sorted = sorted(score_values)
        
        # Calculate median
        n = len(score_values_sorted)
        if n % 2 == 0:
            median = (score_values_sorted[n//2 - 1] + score_values_sorted[n//2]) / 2
        else:
            median = score_values_sorted[n//2]

        stats = {
            'total_games': len(scores),
            'highest_score': max(score_values),
            'lowest_score': min(score_values),
            'average_score': round(sum(score_values) / len(score_values), 2),
            'median_score': round(median, 2),
            'total_records': len(load_scores()),  # Total without date filter
            'date_range': {
                'oldest': min(s.get('date', '') for s in scores),
                'newest': max(s.get('date', '') for s in scores)
            }
        }

        return jsonify(stats)
    except Exception as e:
        logger.error(f"Error in get_stats: {str(e)}")
        return jsonify({'error': 'Failed to retrieve statistics'}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint to verify API is running
    
    Returns:
        JSON object with health status and system information
    """
    try:
        # Check if scores file is accessible
        scores = load_scores()
        file_status = 'accessible'
    except Exception:
        file_status = 'error'
    
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'version': '1.0.0',
        'scores_file': file_status,
        'total_records': len(scores) if file_status == 'accessible' else 0
    })

@app.route('/api/scores/rank/<int:score>', methods=['GET'])
@log_request
def get_rank(score):
    """
    Get the rank of a specific score
    
    Args:
        score: The score value to check rank for
        
    Returns:
        JSON object with rank information
    """
    try:
        is_valid, error_msg = validate_score_value(score)
        if not is_valid:
            return jsonify({'error': error_msg}), 400
        
        rank = get_score_rank(score)
        all_scores = load_scores()
        
        return jsonify({
            'score': score,
            'rank': rank,
            'total_scores': len(all_scores),
            'percentile': round((1 - (rank - 1) / max(len(all_scores), 1)) * 100, 2) if all_scores else 100
        })
    except Exception as e:
        logger.error(f"Error in get_rank: {str(e)}")
        return jsonify({'error': 'Failed to calculate rank'}), 500

@app.route('/api/scores/recent', methods=['GET'])
@log_request
def get_recent_scores():
    """
    Get most recent scores regardless of value
    
    Query parameters:
        limit: Number of scores to return (default: 10)
        
    Returns:
        JSON array of recent scores sorted by date descending
    """
    try:
        scores = load_scores()
        
        # Sort by timestamp/date descending (most recent first)
        scores.sort(key=lambda x: x.get('timestamp', x.get('date', '')), reverse=True)
        
        # Get limit parameter
        limit = request.args.get('limit', 10, type=int)
        limit = min(limit, 100)  # Cap at 100
        
        return jsonify(scores[:limit])
    except Exception as e:
        logger.error(f"Error in get_recent_scores: {str(e)}")
        return jsonify({'error': 'Failed to retrieve recent scores'}), 500

@app.route('/api/scores/distribution', methods=['GET'])
@log_request
def get_score_distribution():
    """
    Get score distribution statistics
    
    Returns:
        JSON object with score ranges and counts
    """
    try:
        scores = load_scores()
        
        if not scores:
            return jsonify({'ranges': [], 'total': 0})
        
        score_values = [s['score'] for s in scores]
        max_score = max(score_values)
        
        # Create distribution buckets
        bucket_size = max(10, max_score // 10)
        distribution = {}
        
        for score in score_values:
            bucket = (score // bucket_size) * bucket_size
            bucket_label = f"{bucket}-{bucket + bucket_size - 1}"
            distribution[bucket_label] = distribution.get(bucket_label, 0) + 1
        
        # Convert to sorted list
        ranges = [{'range': k, 'count': v} for k, v in sorted(distribution.items())]
        
        return jsonify({
            'ranges': ranges,
            'total': len(scores),
            'bucket_size': bucket_size
        })
    except Exception as e:
        logger.error(f"Error in get_score_distribution: {str(e)}")
        return jsonify({'error': 'Failed to calculate distribution'}), 500

@app.route('/api/scores/export', methods=['GET'])
@log_request
def export_scores():
    """
    Export all scores (for backup purposes)
    
    Returns:
        JSON object with all score data
    """
    try:
        scores = load_scores()
        
        return jsonify({
            'export_date': datetime.now().isoformat(),
            'total_records': len(scores),
            'scores': scores
        })
    except Exception as e:
        logger.error(f"Error in export_scores: {str(e)}")
        return jsonify({'error': 'Failed to export scores'}), 500

# ============================================================================
# Error Handlers
# ============================================================================
@app.errorhandler(404)
def not_found(error):
    """Handle 404 Not Found errors"""
    logger.warning(f"404 error: {request.path}")
    return jsonify({'error': 'Resource not found', 'path': request.path}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 Internal Server errors"""
    logger.error(f"500 error: {str(error)}")
    return jsonify({'error': 'Internal server error'}), 500

@app.errorhandler(405)
def method_not_allowed(error):
    """Handle 405 Method Not Allowed errors"""
    logger.warning(f"405 error: {request.method} {request.path}")
    return jsonify({'error': 'Method not allowed', 'method': request.method}), 405

# ============================================================================
# Application Entry Point
# ============================================================================
def print_startup_banner():
    """
    Print application startup information banner
    Displays all available endpoints and configuration
    """
    banner = """
    ╔════════════════════════════════════════════════════════════════╗
    ║                  🐍 SNAKE GAME BACKEND API 🐍                  ║
    ╚════════════════════════════════════════════════════════════════╝
    
    Server Configuration:
      • Host: {host}
      • Port: {port}
      • Debug Mode: {debug}
      • Scores File: {scores_file}
    
    Available API Endpoints:
    ┌────────────────────────────────────────────────────────────────┐
    │ Core Endpoints:                                                │
    │   GET    /api/scores              - Get high score leaderboard │
    │   POST   /api/scores              - Submit new score           │
    │   GET    /api/stats               - Get game statistics        │
    │   GET    /api/health              - Health check               │
    │                                                                │
    │ Extended Endpoints:                                            │
    │   GET    /api/scores/recent       - Get recent scores          │
    │   GET    /api/scores/rank/<score> - Get rank for a score      │
    │   GET    /api/scores/distribution - Get score distribution    │
    │   GET    /api/scores/export       - Export all scores          │
    └────────────────────────────────────────────────────────────────┘
    
    Query Parameters:
      • ?limit=N    - Limit number of results (max 100)
      • ?days=N     - Filter by last N days
    
    🎮 Please open index.html in your browser to start the game!
    📊 Check logs in: {log_file}
    
    """.format(
        host=Config.HOST,
        port=Config.PORT,
        debug=Config.DEBUG,
        scores_file=Config.SCORES_FILE,
        log_file=Config.LOG_FILE
    )
    print(banner)
    logger.info("Application started successfully")

def initialize_app():
    """
    Initialize application resources and perform startup checks
    Creates necessary files and validates configuration
    """
    # Ensure scores file exists
    if not os.path.exists(Config.SCORES_FILE):
        logger.info(f"Creating new scores file: {Config.SCORES_FILE}")
        save_scores([])
    
    # Validate scores file
    try:
        scores = load_scores()
        logger.info(f"Scores file validated. Current records: {len(scores)}")
    except Exception as e:
        logger.error(f"Error validating scores file: {str(e)}")
    
    # Log configuration
    logger.info(f"Configuration loaded:")
    logger.info(f"  - Max scores stored: {Config.MAX_SCORES_STORED}")
    logger.info(f"  - Top scores display: {Config.TOP_SCORES_DISPLAY}")
    logger.info(f"  - Valid score range: {Config.MIN_SCORE} - {Config.MAX_SCORE}")

if __name__ == '__main__':
    try:
        # Initialize application
        initialize_app()
        
        # Print startup banner
        print_startup_banner()
        
        # Start Flask application
        app.run(
            debug=Config.DEBUG,
            host=Config.HOST,
            port=Config.PORT,
            use_reloader=True
        )
    except KeyboardInterrupt:
        logger.info("Application stopped by user")
        print("\n\n👋 Snake Game Backend stopped. Goodbye!")
    except Exception as e:
        logger.error(f"Fatal error: {str(e)}\n{traceback.format_exc()}")
        print(f"\n❌ Error starting application: {str(e)}")
        raise