# Assumptions (hard rule 10)
- Pressure intensity weights (درسنامه 1.25 … تحلیل خطا 0.6) are owner-tunable defaults, not from spec.
- Planner fills each day to 85% weighted pressure; relief options 100/75/50/25%.
- Leech threshold = 4 lapses. Review daily limit 40, new-card limit 20 (settings).
- Exam sittings are spread over blueprint topics round-robin with legacy weight 0.3 (no per-question topic data).
- Third exam type = «برگزارشده» (registered upcoming exam after its result is entered).
- Exams are assumed to start 08:00 local for the countdown.
- Storage remains localStorage (IndexedDB migration deferred).
