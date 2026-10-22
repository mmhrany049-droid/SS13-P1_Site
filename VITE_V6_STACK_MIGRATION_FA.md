# SS 12 با فناوری v6

این شاخه همه قابلیت‌های v12 را نگه می‌دارد، اما ابزار ساخت وب آن با خانواده v6 یکسان شده است:

- React 18 + Vite 5 + `@vitejs/plugin-react`
- Tailwind 3 + PostCSS + Autoprefixer
- Vitest برای تست‌های وب
- Node.js API، احراز هویت، MFA، RBAC، persistence و منطق دامنه v12 بدون حذف

## اجرا

```bash
npm install
npm run dev       # وب با Vite
npm run build     # خروجی apps/web/dist
npm start         # API و سرویس یکپارچه روی همان خروجی
npm test
```

آداپتر `json` و `sqlite`، API و سرور v12 دست‌نخورده مانده‌اند. PostgreSQL همچنان در این نسخه پیاده‌سازی نشده است. برای production از Node.js >= 22.5 استفاده کنید.
