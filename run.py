import os
import subprocess
import sys
from app import create_app


def build_frontend():
    frontend_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "frontend"
    )
    frontend_dir = os.path.abspath(frontend_dir)
    dist_dir = os.path.join(frontend_dir, "dist")

    if not os.path.isdir(os.path.join(frontend_dir, "node_modules")):
        print("Installing frontend dependencies...")
        subprocess.check_call(["npm", "install"], cwd=frontend_dir)

    print("Building frontend...")
    subprocess.check_call(["npm", "run", "build"], cwd=frontend_dir)
    print("Frontend built successfully.")


app = create_app()

if __name__ == "__main__":
    build_frontend()
    app.run(debug=True, port=8080)
