# قرارداد سرور ورود واحد

`POST /api/auth/login` با `{ identity, password }` پاسخ می‌دهد:

```json
{ "user": { "id": "...", "name": "..." }, "roles": [{ "role": "teacher", "organizationId": "...", "label": "معلم" }], "next": "/today" }
```

اگر بیش از یک نقش مجاز وجود داشته باشد، کلاینت `POST /api/auth/role` را با `roleAssignmentId` فراخوانی می‌کند. سرور باید session واحد HttpOnly بسازد و هر endpoint مجوز را از session و رابطه سازمانی محاسبه کند.

دانش‌آموز با role `student` به `/today` می‌رود. نقش‌های سازمانی به `/workspace` می‌روند. این تفاوت فقط یک تصمیم routing است، نه دو سایت.
