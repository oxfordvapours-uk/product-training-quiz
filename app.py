from flask import Flask, send_from_directory, request, jsonify
import json
from pathlib import Path

app = Flask(__name__, static_folder=".")
QUESTION_BANK = Path("question-bank.json")

@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/<path:filename>")
def files(filename):
    return send_from_directory(".", filename)

@app.post("/save")
def save():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify(error="Invalid JSON body."), 400

    questions = data.get("questions")

    if not isinstance(questions, list):
        return jsonify(error="The questions field must be an array."), 400

    data["question_count"] = len(questions)

    QUESTION_BANK.write_text(
        json.dumps(data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    return jsonify(
        success=True,
        questions=len(questions),
    )

if __name__ == "__main__":
    app.run(debug=True)