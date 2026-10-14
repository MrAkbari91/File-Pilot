# Automation and local assistant

Rules currently support an explicit source root, optional extension condition, and category,
category/extension, or modification year/month organization into that root. Create, edit, preview,
enable/pause, and delete are implemented. New rules are paused. No rule deletes files or overwrites
existing destinations.

Manual preview uses the current index. Scheduled preview rescans first, then prepares a plan at an
interval of at least five minutes. The scheduler checks once per minute while the app is running.
It logs preview/failure outcomes in SQLite. The rule list shows the last preview timestamp. Use
**Preview** to inspect a fresh plan, then separately approve its moves. The global pause switch
suspends scheduled jobs, and Cancel stops a running job at a safe boundary.

Missed jobs are not reported as completed while the app is closed. A due rule may run after the app
reopens. File watchers, arbitrary destinations, rename patterns, startup triggers, complex conditions,
OS background scheduling, and unattended execution are not implemented.

The assistant uses an explicit deterministic parser. Supported examples:

- `Find large videos` (over 100 MiB).
- `Show files larger than 500 MB` (binary units).
- `Show PDFs modified last month` (previous calendar month in local time).
- `Find files with invoice in their name`.
- `Organize my Downloads folder by file type`.
- `Find duplicate images`.
- `Create a rule for new PDF files`.

Search commands produce filters. Organization/duplicate/rule requests open the corresponding setup
screen; users still select the folder and settings. These navigation intents do not resolve or
authorize a Downloads path automatically. Unrecognized requests are rejected with examples.
No language model, paid API, arbitrary shell command, or model download is involved.
