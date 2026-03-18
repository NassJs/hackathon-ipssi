import os
from typing import Optional

from document_classifier import create_flask_app


def create_app(pipeline_path: Optional[str] = None):
    return create_flask_app(pipeline_path=pipeline_path)


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
