# Local Apigee Custom Dashboard

An autonomous engineering platform designed to accelerate Apigee development cycles. This ecosystem eliminates cloud-latency bottlenecks by containerizing the development environment and augmenting it with a Python/Django sidecar and AI-driven automation.

## 🏛 Architecture Overview

- Backend (Sidecar): Python 3.12 + Django REST Framework (DRF).
- Containerization: Docker

## 🛠 Development Environment Setup

This repository uses **Ruff** for linting and **pre-commit hooks** for automated code quality.

### 1. Requirements
Ensure you have Python 3.10+ and Docker installed.

### 2. Install Dependencies
$ pip install -r requirements.txt
$ pip install ruff pre-commit

### 3. Activate the "Gatekeeper" (Git Hooks)
Run this once to link the quality rules to your local Git commits:
$ pre-commit install

## Workflow & Standards

### Formatting and Linting
We use **Ruff** (the Rust-based Python linter). It is configured to run automatically on every commit. To run it manually:
$ ruff check . --fix

## License

This project is licensed under the MIT License. This means you are free to use, modify, and distribute the software, as long as the original copyright and license notice are included.

See the [LICENSE](LICENSE) file for the full text.