# Supabase MVP Setup

## Run once in SQL Editor

1. เปิด projectที่ใช้กับ LIFF/Web.
2. รัน `supabase/migrations/202607180001_verified_care_route_mvp.sql` ทั้งไฟล์.
3. รัน `supabase/seed_mvp.sql` หลัง migrationสำเร็จ.
4. ตรวจว่า Anonymous Sign-ins เปิดสำหรับ web demoนอก `/demo` และตั้ง LINE auth bridgeตาม `SETUP.md`.
5. ตั้ง server-only `SUPABASE_SERVICE_KEY`; ห้ามใช้ service keyใน browser.

Migration ออกแบบให้รันซ้ำได้ในขอบเขตที่ระบุ (`create table if not exists`, indexes, replace views/functions, drop/create policies) และไม่มี PostGIS dependency. Active views/RPC แปลงวันปัจจุบันเป็น `Asia/Bangkok` อย่างชัดเจน แม้ฐานข้อมูลใช้ UTC เป็นค่าเริ่มต้น. หาก project มี PostGIS อยู่ app ยังคงใช้ Haversine layer เดียวกันเพื่อผล ranking ที่ทดสอบได้.

## Required environment

```env
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
KNOWLEDGE_PROVIDER=supabase
ENABLE_JSON_KNOWLEDGE_FALLBACK=true
```

## RLS model

- Public knowledge: selectสำหรับ anon/authenticated; writesผ่าน trusted backend/service role.
- Personal cases: owner `user_id` หรือ matching `demo_session_id`; demo rowsมี expiry.
- Case messages/routes/passports/feedback: accessผ่าน ownershipของ parent case.
- Raw triage provider data/audit events: ไม่เปิด public policy.
- Passport share: อ่านผ่าน server token endpointเท่านั้น; DBไม่เปิด share-token lookupให้ browser.

Server จะเรียก `purge_expired_demo_cases()` แบบ opportunistic เมื่อบันทึก demo. ถ้า project เปิด `pg_cron` อยู่แล้ว migration จะตั้ง job รายชั่วโมงให้อัตโนมัติโดยไม่บังคับติดตั้ง extension. หากไม่มี `pg_cron` ให้ schedule SQL นี้ซ้ำอย่างน้อยทุกชั่วโมงผ่าน platform runner:

```sql
select public.purge_expired_demo_cases();
```

## Verification queries

หลัง seed ให้ตรวจอย่างน้อย:

```sql
select count(*) from health_rights;
select count(*) from services;
select count(*) from facilities;
select * from active_service_coverages;
select * from care_route_candidate_view limit 20;
select * from facility_access_summary;
select public.purge_expired_demo_cases();
```

Migration/seed ถูกทดสอบบน PostgreSQL 18 เปล่าโดยรันซ้ำสองรอบ; candidate RPC, anon knowledge read, nullable feedback และ demo TTL purge ผ่านทั้งหมด.

จากนั้นเปิด `/api/health`; endpointแสดงเพียง readiness ไม่เปิดเผย model, key, LIFF ID หรือ infrastructure detail.

## Rollback

Migrationมี rollback notesในส่วนหัว. Production rollbackควร backupก่อนและ drop views/policiesก่อน tablesตาม reverse dependency order. อย่า drop case/passport tablesโดยไม่ exportข้อมูลตาม retention/consent policy.
