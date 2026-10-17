# CodeAlpha Task 1 — Data Redundancy Removal System

A beginner-friendly full-stack web application that stores records in MongoDB, imports CSV files, finds duplicate records, and removes extra copies after user confirmation.

## Features
- Responsive dashboard with record and duplicate counts
- Add and delete records
- Search by name, email, phone, or department
- Import CSV spreadsheets (maximum 5 MB)
- Detect duplicates using normalized email; if email is missing, use normalized name + phone
- Review duplicate groups before cleanup
- Keep the oldest record in each group when removing duplicates
- Download a sample CSV file

## Requirements
1. Install Node.js LTS: https://nodejs.org/
2. Install MongoDB Community Server and make sure MongoDB is running: https://www.mongodb.com/try/download/community
3. Install Visual Studio Code (recommended): https://code.visualstudio.com/

## Run the project
1. Extract this project ZIP.
2. Open the folder `CodeAlpha-Task1-Data-Redundancy-Removal` in VS Code.
3. Open the VS Code terminal: **Terminal → New Terminal**.
4. Install dependencies:
   ```bash
   npm install
   ```
5. Create your environment file:
   - Windows PowerShell: `Copy-Item .env.example .env`
   - Or copy `.env.example` manually and rename the copy to `.env`.
6. Open `.env`. For a local MongoDB installation, keep these values:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://127.0.0.1:27017
   MONGODB_DB=codealpha_data_cleaner
   ```
7. Start the app:
   ```bash
   npm start
   ```
8. Open http://localhost:5000 in your browser.

Keep the terminal running while using the website. MongoDB must also be running.

## If you use MongoDB Atlas
Replace `MONGODB_URI` in `.env` with your Atlas connection string. Do not share your database password or commit `.env` to GitHub.

## CSV format
Download **Download sample CSV** from the website. The first row must contain column names. `name` is required; `email`, `phone`, and `department` are optional. Example:

```csv
name,email,phone,department
Asha Rao,asha@example.com,9876543210,IT
Ravi Kumar,ravi@example.com,9876501234,HR
Asha Rao,ASHA@example.com,9876543210,IT
```

## API endpoints
- `GET /api/health` — connection check
- `GET /api/stats` — dashboard counts
- `GET /api/records?search=...` — list/search records
- `POST /api/records` — create a record (JSON)
- `POST /api/records/import` — import CSV (`file` form field)
- `GET /api/duplicates` — list duplicate groups
- `DELETE /api/duplicates` — remove extra copies; JSON body must be `{"confirm":true}`
- `DELETE /api/records/:id` — delete one record
- `GET /api/sample.csv` — sample CSV download

## Notes
- This is a learning/demo project. Review duplicate groups before cleaning; deletion cannot be undone.
- Matching is rule-based and is not proof that two real-world people are the same.
