from __future__ import annotations

from flask_cors import CORS

from backend import create_app

app = create_app()
CORS(app, resources={r"/*": {"origins": "*"}})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
