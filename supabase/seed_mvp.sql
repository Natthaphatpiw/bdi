-- Seed for 202607180001_verified_care_route_mvp.sql.
-- Safe to re-run. Facts marked NEEDS_CONFIRMATION must surface a call-first warning.
-- Rows with DEMO_ONLY/is_demo=true are synthetic booth data, never user observations.

begin;

insert into public.source_documents
  (id, title, publisher, url, document_type, published_at, effective_date, retrieved_at, verification_status, is_official, effective_from, effective_to)
values
  ('doc:nhso:ucs-overview', 'สิทธิหลักประกันสุขภาพแห่งชาติและ 30 บาทรักษาทุกที่', 'สำนักงานหลักประกันสุขภาพแห่งชาติ', 'https://www.nhso.go.th/th/population-th/2024-08-20-15-19-43/30-bath-th-2', 'OFFICIAL_WEBPAGE', null, '2026-01-01', '2026-07-18T00:00:00+07:00', 'VERIFIED', true, '2026-01-01', null),
  ('doc:nhso:1330', 'ช่องทางตรวจสอบสิทธิและประสานบริการ สายด่วน 1330', 'สำนักงานหลักประกันสุขภาพแห่งชาติ', 'https://www.nhso.go.th/page/contact', 'OFFICIAL_WEBPAGE', null, '2026-01-01', '2026-07-18T00:00:00+07:00', 'VERIFIED', true, '2026-01-01', null),
  ('doc:sso:medical', 'สิทธิประโยชน์กรณีเจ็บป่วยของผู้ประกันตน', 'สำนักงานประกันสังคม', 'https://www.sso.go.th/', 'OFFICIAL_WEBPAGE', null, '2026-01-01', '2026-07-18T00:00:00+07:00', 'VERIFIED', true, '2026-01-01', null),
  ('doc:sso:dental-2569', 'หลักเกณฑ์สิทธิทันตกรรมประกันสังคม ปี 2569', 'สำนักงานประกันสังคม', 'https://www.sso.go.th/', 'OFFICIAL_WEBPAGE', null, '2026-01-01', '2026-07-18T00:00:00+07:00', 'NEEDS_CONFIRMATION', true, '2026-01-01', '2026-12-31'),
  ('doc:cgd:medical', 'ระบบตรวจสอบสิทธิสวัสดิการรักษาพยาบาลข้าราชการ', 'กรมบัญชีกลาง', 'https://mbdb.cgd.go.th/wel/', 'OFFICIAL_WEBPAGE', null, '2026-01-01', '2026-07-18T00:00:00+07:00', 'VERIFIED', true, '2026-01-01', null),
  ('doc:thai-dm-cpg:2566', 'แนวทางเวชปฏิบัติสำหรับโรคเบาหวาน พ.ศ. 2566', 'สมาคมโรคเบาหวานแห่งประเทศไทยและภาคี', 'https://www.thaiendocrine.org/wp-content/uploads/2023/08/Thai-DM-CPG-2566.pdf', 'OFFICIAL_GUIDELINE', '2023-08-01', '2023-08-01', '2026-07-18T00:00:00+07:00', 'VERIFIED', true, '2023-08-01', null),
  ('doc:niems:1669', 'สายด่วนการแพทย์ฉุกเฉิน 1669', 'สถาบันการแพทย์ฉุกเฉินแห่งชาติ', 'https://www.niems.go.th/1/News/Detail/7452?group=3', 'OFFICIAL_WEBPAGE', null, '2026-01-01', '2026-07-18T00:00:00+07:00', 'VERIFIED', true, '2026-01-01', null),
  ('doc:bma:health-centers', 'ข้อมูลศูนย์บริการสาธารณสุข กรุงเทพมหานคร', 'สำนักอนามัย กรุงเทพมหานคร', 'https://webportal.bangkok.go.th/healthcenter', 'OFFICIAL_DIRECTORY', null, '2026-01-01', '2026-07-18T00:00:00+07:00', 'NEEDS_CONFIRMATION', true, '2026-01-01', null),
  ('doc:bma:diabetes-clinics', 'รายชื่อศูนย์บริการสาธารณสุขที่มีคลินิกโรคเบาหวาน', 'สำนักอนามัย กรุงเทพมหานคร', 'https://webportal.bangkok.go.th/upload/user/00000101/Download/File/PDF/service/1_Service/1_S03.pdf', 'OFFICIAL_DIRECTORY', null, null, '2026-07-18T00:00:00+07:00', 'NEEDS_CONFIRMATION', true, '2026-07-18', null),
  ('doc:moi:older-person-allowance:2566', 'ระเบียบกระทรวงมหาดไทยว่าด้วยหลักเกณฑ์การจ่ายเงินเบี้ยยังชีพผู้สูงอายุ พ.ศ. 2566', 'กระทรวงมหาดไทย', 'https://www.dla.go.th/', 'OFFICIAL_REGULATION', '2023-08-11', '2023-08-12', '2026-07-18T00:00:00+07:00', 'NEEDS_CONFIRMATION', true, '2023-08-12', null),
  ('doc:demo:synthetic', 'ข้อมูลสังเคราะห์สำหรับการสาธิต BDI Hackathon 2026', 'รู้สิทธิ์ รู้สุข', null, 'DEMO_DATA', '2026-07-18', '2026-07-18', '2026-07-18T00:00:00+07:00', 'DEMO_ONLY', false, '2026-07-18', null)
on conflict (id) do update set
  title = excluded.title, publisher = excluded.publisher, url = excluded.url,
  document_type = excluded.document_type, published_at = excluded.published_at,
  effective_date = excluded.effective_date, retrieved_at = excluded.retrieved_at,
  verification_status = excluded.verification_status, is_official = excluded.is_official,
  effective_from = excluded.effective_from, effective_to = excluded.effective_to;

insert into public.agencies (id, name_th, phone, website_url, source_id, effective_from, effective_to, verification_status)
values
  ('agency:nhso', 'สำนักงานหลักประกันสุขภาพแห่งชาติ', '1330', 'https://www.nhso.go.th/', 'doc:nhso:ucs-overview', '2026-01-01', null, 'VERIFIED'),
  ('agency:sso', 'สำนักงานประกันสังคม', '1506', 'https://www.sso.go.th/', 'doc:sso:medical', '2026-01-01', null, 'VERIFIED'),
  ('agency:cgd', 'กรมบัญชีกลาง', '02-270-6400', 'https://www.cgd.go.th/', 'doc:cgd:medical', '2026-01-01', null, 'VERIFIED'),
  ('agency:dla', 'กรมส่งเสริมการปกครองท้องถิ่น', null, 'https://www.dla.go.th/', 'doc:moi:older-person-allowance:2566', '2023-08-12', null, 'NEEDS_CONFIRMATION'),
  ('agency:niems', 'สถาบันการแพทย์ฉุกเฉินแห่งชาติ', '1669', 'https://www.niems.go.th/', 'doc:niems:1669', '2026-01-01', null, 'VERIFIED'),
  ('agency:bma-health', 'สำนักอนามัย กรุงเทพมหานคร', null, 'https://webportal.bangkok.go.th/health', 'doc:bma:health-centers', '2026-01-01', null, 'NEEDS_CONFIRMATION')
on conflict (id) do update set name_th = excluded.name_th, phone = excluded.phone,
  website_url = excluded.website_url, source_id = excluded.source_id,
  effective_from = excluded.effective_from, effective_to = excluded.effective_to,
  verification_status = excluded.verification_status;

insert into public.health_rights
  (id, code, name_th, description_th, active, source_id, effective_from, effective_to, verification_status)
values
  ('right:ucs', 'UCS', 'สิทธิหลักประกันสุขภาพแห่งชาติ (บัตรทอง)', 'สิทธิบริการสาธารณสุขตามระบบหลักประกันสุขภาพแห่งชาติ โปรดตรวจสอบหน่วยบริการและเงื่อนไขล่าสุดกับ สปสช.', true, 'doc:nhso:ucs-overview', '2026-01-01', null, 'VERIFIED'),
  ('right:sss', 'SSS', 'สิทธิประกันสังคม', 'สิทธิของผู้ประกันตนตามเงื่อนไขการส่งเงินสมทบและสถานพยาบาลตามสิทธิ', true, 'doc:sso:medical', '2026-01-01', null, 'VERIFIED'),
  ('right:csmbs', 'CSMBS', 'สวัสดิการรักษาพยาบาลข้าราชการ', 'สวัสดิการรักษาพยาบาลของผู้มีสิทธิและบุคคลในครอบครัวตามหลักเกณฑ์กรมบัญชีกลาง', true, 'doc:cgd:medical', '2026-01-01', null, 'VERIFIED')
on conflict (id) do update set code = excluded.code, name_th = excluded.name_th,
  description_th = excluded.description_th, active = excluded.active, source_id = excluded.source_id,
  effective_from = excluded.effective_from, effective_to = excluded.effective_to,
  verification_status = excluded.verification_status;

insert into public.areas
  (id, area_code, name_th, level, parent_id, source_id, effective_from, effective_to, verification_status)
values
  ('area:th', 'TH', 'ประเทศไทย', 'COUNTRY', null, 'doc:demo:synthetic', '2026-07-18', null, 'DEMO_ONLY')
on conflict (id) do update set area_code = excluded.area_code, name_th = excluded.name_th,
  level = excluded.level, source_id = excluded.source_id, effective_from = excluded.effective_from,
  effective_to = excluded.effective_to, verification_status = excluded.verification_status;

insert into public.areas
  (id, area_code, name_th, level, parent_id, source_id, effective_from, effective_to, verification_status)
values
  ('area:bkk', 'BKK', 'กรุงเทพมหานคร', 'PROVINCE_SPECIAL_ADMIN', 'area:th', 'doc:bma:health-centers', '2026-01-01', null, 'VERIFIED'),
  ('area:bkk:lat-phrao', 'BKK-LATPHRAO', 'ลาดพร้าว', 'DISTRICT', 'area:bkk', 'doc:bma:health-centers', '2026-01-01', null, 'VERIFIED'),
  ('area:bkk:bang-kapi', 'BKK-BANGKAPI', 'บางกะปิ', 'DISTRICT', 'area:bkk', 'doc:bma:health-centers', '2026-01-01', null, 'VERIFIED'),
  ('area:bkk:ratchathewi', 'BKK-RATCHATHEWI', 'ราชเทวี', 'DISTRICT', 'area:bkk', 'doc:bma:health-centers', '2026-01-01', null, 'VERIFIED'),
  ('area:bkk:huai-khwang', 'BKK-HUAIKHWANG', 'ห้วยขวาง', 'DISTRICT', 'area:bkk', 'doc:bma:health-centers', '2026-01-01', null, 'VERIFIED')
on conflict (id) do update set area_code = excluded.area_code, name_th = excluded.name_th,
  level = excluded.level, parent_id = excluded.parent_id, source_id = excluded.source_id,
  effective_from = excluded.effective_from, effective_to = excluded.effective_to,
  verification_status = excluded.verification_status;

insert into public.conditions
  (id, icd10, name_th, category, safety_note_th, active, source_id, effective_from, effective_to, verification_status)
values
  ('cond:E11', 'E11', 'ภาวะที่อาจเกี่ยวข้องกับเบาหวานชนิดที่ 2', 'METABOLIC', 'ต้องประเมินและตรวจระดับน้ำตาล ไม่ใช้ข้อมูลนี้ยืนยันการวินิจฉัย', true, 'doc:thai-dm-cpg:2566', '2023-08-01', null, 'VERIFIED'),
  ('cond:acute-unspecified', null, 'อาการเจ็บป่วยเฉียบพลันที่ยังไม่ทราบสาเหตุ', 'GENERAL', 'ต้องประเมินอาการและสัญญาณอันตรายก่อนเลือกบริการ', true, 'doc:nhso:ucs-overview', '2026-01-01', null, 'VERIFIED'),
  ('cond:K02', 'K02', 'ภาวะที่อาจเกี่ยวข้องกับฟันผุหรือปัญหาทันตกรรมทั่วไป', 'DENTAL', 'อาการบวมมาก ไข้สูง หายใจหรือกลืนลำบากควรได้รับการประเมินเร่งด่วน', true, 'doc:sso:dental-2569', '2026-01-01', '2026-12-31', 'NEEDS_CONFIRMATION')
on conflict (id) do update set icd10 = excluded.icd10, name_th = excluded.name_th,
  category = excluded.category, safety_note_th = excluded.safety_note_th, active = excluded.active,
  source_id = excluded.source_id, effective_from = excluded.effective_from,
  effective_to = excluded.effective_to, verification_status = excluded.verification_status;

insert into public.symptoms
  (id, name_th, aliases, red_flag, red_flag_level, active, source_id, effective_from, effective_to, verification_status)
values
  ('sym:fatigue', 'อ่อนเพลีย', '["เพลีย","ไม่มีแรง","เหนื่อยง่าย"]', false, null, true, 'doc:thai-dm-cpg:2566', '2023-08-01', null, 'VERIFIED'),
  ('sym:polyuria', 'ปัสสาวะบ่อย', '["ฉี่บ่อย","เข้าห้องน้ำบ่อย"]', false, null, true, 'doc:thai-dm-cpg:2566', '2023-08-01', null, 'VERIFIED'),
  ('sym:polydipsia', 'กระหายน้ำบ่อย', '["หิวน้ำบ่อย","ดื่มน้ำมากผิดปกติ"]', false, null, true, 'doc:thai-dm-cpg:2566', '2023-08-01', null, 'VERIFIED'),
  ('sym:dental-pain', 'ปวดฟันหรือมีปัญหาฟัน', '["ปวดฟัน","ฟันผุ","เหงือกอักเสบ","ต้องการขูดหินปูน"]', false, null, true, 'doc:sso:dental-2569', '2026-01-01', '2026-12-31', 'NEEDS_CONFIRMATION'),
  ('sym:unconscious', 'หมดสติหรือเรียกไม่รู้ตัว', '["หมดสติ","ไม่รู้สึกตัว","เรียกไม่ตอบ"]', true, 'EMERGENCY_NOW', true, 'doc:niems:1669', '2026-01-01', null, 'VERIFIED'),
  ('sym:severe-dyspnea', 'หายใจลำบากรุนแรง', '["หายใจไม่ออก","หอบมาก","ปากเขียว"]', true, 'EMERGENCY_NOW', true, 'doc:niems:1669', '2026-01-01', null, 'VERIFIED'),
  ('sym:severe-chest-pain', 'เจ็บหน้าอกรุนแรง', '["เจ็บหน้าอกมาก","แน่นหน้าอกรุนแรง"]', true, 'EMERGENCY_NOW', true, 'doc:niems:1669', '2026-01-01', null, 'VERIFIED'),
  ('sym:acute-weakness', 'แขนขาอ่อนแรงเฉียบพลัน', '["อ่อนแรงครึ่งซีก","หน้าเบี้ยวแขนตก"]', true, 'EMERGENCY_NOW', true, 'doc:niems:1669', '2026-01-01', null, 'VERIFIED'),
  ('sym:acute-slurred-speech', 'พูดไม่ชัดเฉียบพลัน', '["พูดไม่ชัดทันที","ลิ้นแข็งทันที"]', true, 'EMERGENCY_NOW', true, 'doc:niems:1669', '2026-01-01', null, 'VERIFIED'),
  ('sym:seizure', 'ชัก', '["ชักเกร็ง","กระตุกทั้งตัว"]', true, 'EMERGENCY_NOW', true, 'doc:niems:1669', '2026-01-01', null, 'VERIFIED'),
  ('sym:major-bleeding', 'เลือดออกมาก', '["เลือดไหลไม่หยุด","เสียเลือดมาก"]', true, 'EMERGENCY_NOW', true, 'doc:niems:1669', '2026-01-01', null, 'VERIFIED'),
  ('sym:acute-confusion', 'สับสนเฉียบพลัน', '["เพ้อเฉียบพลัน","จำคนไม่ได้ทันที"]', true, 'EMERGENCY_NOW', true, 'doc:niems:1669', '2026-01-01', null, 'VERIFIED'),
  ('sym:anaphylaxis', 'อาการแพ้รุนแรง', '["แพ้รุนแรง","หน้าบวมคอบวม","ผื่นร่วมกับหายใจไม่ออก"]', true, 'EMERGENCY_NOW', true, 'doc:niems:1669', '2026-01-01', null, 'VERIFIED')
on conflict (id) do update set name_th = excluded.name_th, aliases = excluded.aliases,
  red_flag = excluded.red_flag, red_flag_level = excluded.red_flag_level, active = excluded.active,
  source_id = excluded.source_id, effective_from = excluded.effective_from,
  effective_to = excluded.effective_to, verification_status = excluded.verification_status;

insert into public.symptom_condition_links
  (symptom_id, condition_id, likelihood, source_id, effective_from, effective_to, verification_status)
values
  ('sym:fatigue', 'cond:E11', null, 'doc:thai-dm-cpg:2566', '2023-08-01', null, 'VERIFIED'),
  ('sym:fatigue', 'cond:acute-unspecified', null, 'doc:nhso:ucs-overview', '2026-01-01', null, 'VERIFIED'),
  ('sym:polyuria', 'cond:E11', null, 'doc:thai-dm-cpg:2566', '2023-08-01', null, 'VERIFIED'),
  ('sym:polydipsia', 'cond:E11', null, 'doc:thai-dm-cpg:2566', '2023-08-01', null, 'VERIFIED'),
  ('sym:dental-pain', 'cond:K02', null, 'doc:sso:dental-2569', '2026-01-01', '2026-12-31', 'NEEDS_CONFIRMATION')
on conflict (symptom_id, condition_id) do update set likelihood = excluded.likelihood,
  source_id = excluded.source_id, effective_from = excluded.effective_from,
  effective_to = excluded.effective_to, verification_status = excluded.verification_status;

insert into public.services
  (id, name_th, type, care_level, description_th, eligible_age_min, eligible_age_max, interval_months, active, source_id, effective_from, effective_to, verification_status)
values
  ('svc:dm-assessment', 'ประเมินอาการและความเสี่ยงเบาหวานโดยบุคลากรทางการแพทย์', 'MEDICAL_ASSESSMENT', 'PRIMARY', 'ประเมินอาการ ตรวจร่างกาย และพิจารณาการตรวจที่จำเป็น', null, null, null, true, 'doc:thai-dm-cpg:2566', '2023-08-01', null, 'VERIFIED'),
  ('svc:dm-screening', 'ตรวจระดับน้ำตาลเพื่อคัดกรองเบาหวาน', 'SCREENING', 'PRIMARY', 'การตรวจระดับน้ำตาลตามข้อบ่งชี้และดุลยพินิจของบุคลากรทางการแพทย์', null, null, null, true, 'doc:thai-dm-cpg:2566', '2023-08-01', null, 'VERIFIED'),
  ('svc:general-acute-assessment', 'ประเมินอาการเจ็บป่วยเฉียบพลัน', 'MEDICAL_ASSESSMENT', 'PRIMARY', 'ประเมินอาการทั่วไปและส่งต่อเมื่อเกินศักยภาพ', null, null, null, true, 'doc:nhso:ucs-overview', '2026-01-01', null, 'VERIFIED'),
  ('svc:dental-basic', 'บริการทันตกรรมพื้นฐาน', 'DENTAL', 'PRIMARY', 'ตรวจและรักษาทางทันตกรรมตามข้อบ่งชี้และหลักเกณฑ์สิทธิ', null, null, 12, true, 'doc:sso:dental-2569', '2026-01-01', '2026-12-31', 'NEEDS_CONFIRMATION'),
  ('svc:ucs-right-verification', 'ตรวจสอบสิทธิบัตรทองและหน่วยบริการ', 'RIGHTS_NAVIGATION', 'PRIMARY', 'ตรวจสอบสิทธิและแนวทางใช้สิทธิผ่าน สปสช. 1330', null, null, null, true, 'doc:nhso:1330', '2026-01-01', null, 'VERIFIED'),
  ('svc:sss-right-verification', 'ตรวจสอบสิทธิทันตกรรมประกันสังคม', 'RIGHTS_NAVIGATION', 'PRIMARY', 'ตรวจสอบหลักเกณฑ์และสถานพยาบาลผ่าน 1506', null, null, null, true, 'doc:sso:dental-2569', '2026-01-01', '2026-12-31', 'NEEDS_CONFIRMATION'),
  ('svc:emergency-response', 'การช่วยเหลือการแพทย์ฉุกเฉิน', 'EMERGENCY', 'EMERGENCY', 'โทร 1669 เพื่อรับคำแนะนำและประสานความช่วยเหลือฉุกเฉิน', null, null, null, true, 'doc:niems:1669', '2026-01-01', null, 'VERIFIED')
on conflict (id) do update set name_th = excluded.name_th, type = excluded.type,
  care_level = excluded.care_level, description_th = excluded.description_th,
  eligible_age_min = excluded.eligible_age_min, eligible_age_max = excluded.eligible_age_max,
  interval_months = excluded.interval_months, active = excluded.active, source_id = excluded.source_id,
  effective_from = excluded.effective_from, effective_to = excluded.effective_to,
  verification_status = excluded.verification_status;

insert into public.condition_service_links
  (condition_id, service_id, guideline_th, priority, source_id, effective_from, effective_to, verification_status)
values
  ('cond:E11', 'svc:dm-assessment', 'ประเมินอาการก่อนและพิจารณาการตรวจตามข้อบ่งชี้', 10, 'doc:thai-dm-cpg:2566', '2023-08-01', null, 'VERIFIED'),
  ('cond:E11', 'svc:dm-screening', 'ตรวจระดับน้ำตาลตามการประเมินของบุคลากร', 20, 'doc:thai-dm-cpg:2566', '2023-08-01', null, 'VERIFIED'),
  ('cond:acute-unspecified', 'svc:general-acute-assessment', 'ประเมินอาการและ red flags', 10, 'doc:nhso:ucs-overview', '2026-01-01', null, 'VERIFIED'),
  ('cond:acute-unspecified', 'svc:ucs-right-verification', 'ตรวจสอบสิทธิเมื่อหน่วยบริการอยู่ต่างพื้นที่', 20, 'doc:nhso:1330', '2026-01-01', null, 'VERIFIED'),
  ('cond:K02', 'svc:dental-basic', 'รับการประเมินทันตกรรมตามอาการ', 10, 'doc:sso:dental-2569', '2026-01-01', '2026-12-31', 'NEEDS_CONFIRMATION'),
  ('cond:K02', 'svc:sss-right-verification', 'ยืนยันหลักเกณฑ์และสถานพยาบาลก่อนนัด', 20, 'doc:sso:dental-2569', '2026-01-01', '2026-12-31', 'NEEDS_CONFIRMATION')
on conflict (condition_id, service_id) do update set guideline_th = excluded.guideline_th,
  priority = excluded.priority, source_id = excluded.source_id,
  effective_from = excluded.effective_from, effective_to = excluded.effective_to,
  verification_status = excluded.verification_status;

insert into public.service_right_coverages
  (service_id, right_id, coverage_status, copay_type, copay_amount, copay_text_th, conditions_th, referral_required, effective_from, effective_to, source_id, verification_status)
values
  ('svc:dm-assessment', 'right:csmbs', 'COVERED_CONDITIONAL', 'UNKNOWN', null, 'ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้สำหรับรายการบริการจริง โปรดให้สถานพยาบาลตรวจสอบสิทธิ', 'ขึ้นกับสถานพยาบาล ประเภทบริการ และหลักเกณฑ์เบิกจ่ายตรง', null, '2026-01-01', null, 'doc:cgd:medical', 'VERIFIED'),
  ('svc:dm-screening', 'right:csmbs', 'COVERED_CONDITIONAL', 'UNKNOWN', null, 'ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้สำหรับการตรวจที่แพทย์สั่ง', 'ต้องตรวจสอบข้อบ่งชี้และสิทธิ ณ วันรับบริการ', null, '2026-01-01', null, 'doc:cgd:medical', 'VERIFIED'),
  ('svc:general-acute-assessment', 'right:ucs', 'COVERED_CONDITIONAL', 'UNKNOWN', null, 'ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้จนกว่าจะตรวจสอบหน่วยบริการและรายการรักษา', 'เมื่ออยู่นอกพื้นที่โปรดตรวจสอบกับ 1330', null, '2026-01-01', null, 'doc:nhso:ucs-overview', 'VERIFIED'),
  ('svc:ucs-right-verification', 'right:ucs', 'COVERED', 'FREE', 0, 'การโทรสอบถาม 1330 ไม่มีค่าบริการจากหน่วยงาน แต่อาจมีค่าบริการโทรศัพท์ตามเครือข่าย', 'ใช้เพื่อยืนยันสิทธิ ไม่ใช่การรับประกันการเข้าถึง', false, '2026-01-01', null, 'doc:nhso:1330', 'VERIFIED'),
  ('svc:dental-basic', 'right:sss', 'COVERED_CONDITIONAL', 'VARIABLE', null, 'ค่าใช้จ่ายขึ้นกับรายการบริการและหลักเกณฑ์ที่มีผล โปรดยืนยันกับสถานพยาบาลหรือ 1506', 'ต้องมีสถานะผู้ประกันตนที่เข้าเงื่อนไข', false, '2026-01-01', '2026-12-31', 'doc:sso:dental-2569', 'NEEDS_CONFIRMATION'),
  ('svc:sss-right-verification', 'right:sss', 'COVERED', 'UNKNOWN', null, 'อาจมีค่าบริการโทรศัพท์ตามเครือข่าย', 'ใช้เพื่อยืนยันสิทธิ ไม่ใช่การรับรองว่าสถานพยาบาลใดรับสิทธิ', false, '2026-01-01', '2026-12-31', 'doc:sso:dental-2569', 'NEEDS_CONFIRMATION'),
  ('svc:emergency-response', 'right:ucs', 'COVERED', 'UNKNOWN', null, 'ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้สำหรับการรักษาภายหลังการช่วยเหลือฉุกเฉิน', 'ภาวะฉุกเฉินให้โทร 1669 โดยไม่ต้องรอตรวจสิทธิ', false, '2026-01-01', null, 'doc:niems:1669', 'VERIFIED')
on conflict (service_id, right_id, effective_from) do update set
  coverage_status = excluded.coverage_status, copay_type = excluded.copay_type,
  copay_amount = excluded.copay_amount, copay_text_th = excluded.copay_text_th,
  conditions_th = excluded.conditions_th, referral_required = excluded.referral_required,
  effective_to = excluded.effective_to, source_id = excluded.source_id,
  verification_status = excluded.verification_status;

insert into public.facilities
  (id, hcode, name_th, facility_type, care_level, address_th, area_id, lat, lng, phone, website_url, map_url, opening_hours, call_before_visit, source_id, data_updated_at, effective_from, effective_to, verification_status, active)
values
  ('fac:bma-hc66', '21748', 'ศูนย์บริการสาธารณสุข 66 ตำหนักพระแม่กวนอิม โชคชัย 4', 'PUBLIC_HEALTH_CENTER', 'PRIMARY', 'เขตลาดพร้าว กรุงเทพมหานคร', 'area:bkk:lat-phrao', 13.8105416, 100.5948073, '02-539-4828', 'https://webportal.bangkok.go.th/healthcenter66', 'https://www.google.com/maps/search/?api=1&query=13.8105416,100.5948073', '{"timezone":"Asia/Bangkok","weekly":{"mon":[["08:00","16:00"]],"tue":[["08:00","16:00"]],"wed":[["08:00","16:00"]],"thu":[["08:00","16:00"]],"fri":[["08:00","16:00"]],"sat":[["08:00","11:00"]],"sun":[]},"note_th":"เวลาเปิดตามข้อมูลที่อัปเดตล่าสุด โปรดโทรยืนยัน"}', true, 'doc:bma:health-centers', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'NEEDS_CONFIRMATION', true),
  ('fac:bma-hc35', '13680', 'ศูนย์บริการสาธารณสุข 35 หัวหมาก', 'PUBLIC_HEALTH_CENTER', 'PRIMARY', 'เขตบางกะปิ กรุงเทพมหานคร', 'area:bkk:bang-kapi', 13.7604522, 100.6388663, '02-374-3550', 'https://webportal.bangkok.go.th/healthcenter35', 'https://www.google.com/maps/search/?api=1&query=13.7604522,100.6388663', '{"timezone":"Asia/Bangkok","weekly":{"mon":[["08:00","16:00"]],"tue":[["08:00","16:00"]],"wed":[["08:00","16:00"]],"thu":[["08:00","16:00"]],"fri":[["08:00","16:00"]],"sat":[],"sun":[]},"note_th":"เวลาเปิดตามข้อมูลที่อัปเดตล่าสุด โปรดโทรยืนยัน"}', true, 'doc:bma:health-centers', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'NEEDS_CONFIRMATION', true),
  ('fac:rajavithi', '11600', 'โรงพยาบาลราชวิถี', 'PUBLIC_HOSPITAL', 'TERTIARY', 'เขตราชเทวี กรุงเทพมหานคร', 'area:bkk:ratchathewi', 13.7659, 100.5341, '02-206-2900', 'https://www.rajavithi.go.th/', 'https://www.google.com/maps/search/?api=1&query=13.7659,100.5341', '{"timezone":"Asia/Bangkok","weekly":null,"note_th":"เวลาของแต่ละคลินิกแตกต่างกัน โปรดโทรยืนยันก่อนเดินทาง"}', true, 'doc:cgd:medical', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'NEEDS_CONFIRMATION', true),
  ('fac:nhso-1330', null, 'สายด่วน สปสช. 1330', 'RIGHTS_NAVIGATION_SERVICE', 'PRIMARY', null, 'area:th', null, null, '1330', 'https://www.nhso.go.th/page/contact', null, '{"timezone":"Asia/Bangkok","weekly":null,"note_th":"โปรดตรวจสอบช่องทางล่าสุดจากเว็บไซต์ทางการ"}', false, 'doc:nhso:1330', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'VERIFIED', true),
  ('fac:sso-1506', null, 'สายด่วนประกันสังคม 1506', 'RIGHTS_NAVIGATION_SERVICE', 'PRIMARY', null, 'area:th', null, null, '1506', 'https://www.sso.go.th/', null, '{"timezone":"Asia/Bangkok","weekly":null,"note_th":"โปรดตรวจสอบเวลาบริการล่าสุด"}', false, 'doc:sso:medical', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'VERIFIED', true),
  ('fac:sso-eservice', null, 'ระบบตรวจสอบสิทธิประกันสังคมออนไลน์', 'RIGHTS_NAVIGATION_SERVICE', 'PRIMARY', null, 'area:th', null, null, null, 'https://www.sso.go.th/', null, '{"timezone":"Asia/Bangkok","weekly":null,"note_th":"ช่องทางออนไลน์อาจปิดปรับปรุง โปรดใช้ 1506 เป็นช่องทางสำรอง"}', false, 'doc:sso:medical', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'VERIFIED', true),
  ('fac:niems-1669', null, 'สายด่วนการแพทย์ฉุกเฉิน 1669', 'EMERGENCY_COORDINATION', 'EMERGENCY', null, 'area:th', null, null, '1669', 'https://www.niems.go.th/', null, '{"timezone":"Asia/Bangkok","weekly":{"mon":[["00:00","24:00"]],"tue":[["00:00","24:00"]],"wed":[["00:00","24:00"]],"thu":[["00:00","24:00"]],"fri":[["00:00","24:00"]],"sat":[["00:00","24:00"]],"sun":[["00:00","24:00"]]},"note_th":"สายด่วนฉุกเฉิน 24 ชั่วโมง"}', false, 'doc:niems:1669', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'VERIFIED', true)
on conflict (id) do update set hcode = excluded.hcode, name_th = excluded.name_th,
  facility_type = excluded.facility_type, care_level = excluded.care_level,
  address_th = excluded.address_th, area_id = excluded.area_id, lat = excluded.lat, lng = excluded.lng,
  phone = excluded.phone, website_url = excluded.website_url, map_url = excluded.map_url,
  opening_hours = excluded.opening_hours, call_before_visit = excluded.call_before_visit,
  source_id = excluded.source_id, data_updated_at = excluded.data_updated_at,
  effective_from = excluded.effective_from, effective_to = excluded.effective_to,
  verification_status = excluded.verification_status, active = excluded.active;

insert into public.facility_rights
  (facility_id, right_id, acceptance_status, conditions_th, source_id, verified_at, effective_from, effective_to, verification_status)
values
  ('fac:bma-hc66', 'right:ucs', 'ACCEPTED', 'ต้องตรวจสอบหน่วยบริการและบริการก่อนเดินทาง', 'doc:bma:health-centers', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'NEEDS_CONFIRMATION'),
  ('fac:bma-hc66', 'right:csmbs', 'CONDITIONAL', 'การเบิกจ่ายตรงต้องตรวจสอบเป็นรายกรณี', 'doc:cgd:medical', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'NEEDS_CONFIRMATION'),
  ('fac:bma-hc66', 'right:sss', 'UNKNOWN', 'ยังไม่มีหลักฐานยืนยันการใช้สิทธิทันตกรรม โปรดตรวจสอบกับ 1506', 'doc:sso:dental-2569', '2026-07-18T00:00:00+07:00', '2026-01-01', '2026-12-31', 'NEEDS_CONFIRMATION'),
  ('fac:bma-hc35', 'right:ucs', 'ACCEPTED', 'ต้องตรวจสอบหน่วยบริการประจำและบริการที่เปิด', 'doc:bma:health-centers', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'NEEDS_CONFIRMATION'),
  ('fac:rajavithi', 'right:csmbs', 'ACCEPTED', 'โรงพยาบาลต้องตรวจสอบสิทธิและเงื่อนไขรายการจริง', 'doc:cgd:medical', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'VERIFIED'),
  ('fac:nhso-1330', 'right:ucs', 'ACCEPTED', 'ช่องทางตรวจสอบสิทธิ ไม่ใช่สถานพยาบาล', 'doc:nhso:1330', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'VERIFIED'),
  ('fac:sso-1506', 'right:sss', 'ACCEPTED', 'ช่องทางตรวจสอบสิทธิ ไม่ใช่สถานพยาบาล', 'doc:sso:medical', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'VERIFIED'),
  ('fac:sso-eservice', 'right:sss', 'ACCEPTED', 'ช่องทางตรวจสอบสิทธิออนไลน์ ไม่ใช่สถานพยาบาล', 'doc:sso:medical', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'VERIFIED'),
  ('fac:niems-1669', 'right:ucs', 'ACCEPTED', 'ภาวะฉุกเฉินไม่ต้องรอตรวจสิทธิ', 'doc:niems:1669', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'VERIFIED'),
  ('fac:niems-1669', 'right:sss', 'ACCEPTED', 'ภาวะฉุกเฉินไม่ต้องรอตรวจสิทธิ', 'doc:niems:1669', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'VERIFIED'),
  ('fac:niems-1669', 'right:csmbs', 'ACCEPTED', 'ภาวะฉุกเฉินไม่ต้องรอตรวจสิทธิ', 'doc:niems:1669', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'VERIFIED')
on conflict (facility_id, right_id) do update set acceptance_status = excluded.acceptance_status,
  conditions_th = excluded.conditions_th, source_id = excluded.source_id,
  verified_at = excluded.verified_at, effective_from = excluded.effective_from,
  effective_to = excluded.effective_to, verification_status = excluded.verification_status;

insert into public.facility_services
  (facility_id, service_id, availability_status, conditions_th, source_id, verified_at, effective_from, effective_to, verification_status)
values
  ('fac:bma-hc66', 'svc:dm-assessment', 'AVAILABLE_CONDITIONAL', 'โปรดโทรยืนยันวันและช่วงเวลาคลินิก', 'doc:bma:diabetes-clinics', '2026-07-18T00:00:00+07:00', '2026-07-18', null, 'NEEDS_CONFIRMATION'),
  ('fac:bma-hc66', 'svc:dm-screening', 'AVAILABLE_CONDITIONAL', 'ขึ้นกับการประเมินและตารางบริการ', 'doc:bma:diabetes-clinics', '2026-07-18T00:00:00+07:00', '2026-07-18', null, 'NEEDS_CONFIRMATION'),
  ('fac:bma-hc66', 'svc:general-acute-assessment', 'AVAILABLE_CONDITIONAL', 'โปรดโทรยืนยันก่อนเดินทาง', 'doc:bma:health-centers', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'NEEDS_CONFIRMATION'),
  ('fac:bma-hc66', 'svc:dental-basic', 'UNKNOWN', 'ยังต้องโทรยืนยันบริการและคิว', 'doc:bma:health-centers', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'NEEDS_CONFIRMATION'),
  ('fac:bma-hc35', 'svc:general-acute-assessment', 'AVAILABLE_CONDITIONAL', 'โปรดโทรยืนยันก่อนเดินทาง', 'doc:bma:health-centers', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'NEEDS_CONFIRMATION'),
  ('fac:rajavithi', 'svc:dm-assessment', 'AVAILABLE_CONDITIONAL', 'ต้องตรวจสอบคลินิก วันนัด และขั้นตอน', 'doc:cgd:medical', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'NEEDS_CONFIRMATION'),
  ('fac:nhso-1330', 'svc:ucs-right-verification', 'AVAILABLE', 'ตรวจสอบสิทธิทางโทรศัพท์ ไม่ใช่บริการรักษา', 'doc:nhso:1330', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'VERIFIED'),
  ('fac:sso-1506', 'svc:sss-right-verification', 'AVAILABLE', 'ตรวจสอบสิทธิทางโทรศัพท์ ไม่ใช่บริการทันตกรรม', 'doc:sso:medical', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'VERIFIED'),
  ('fac:sso-eservice', 'svc:sss-right-verification', 'AVAILABLE', 'ตรวจสอบสิทธิออนไลน์ ไม่ใช่บริการทันตกรรม', 'doc:sso:medical', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'VERIFIED'),
  ('fac:niems-1669', 'svc:emergency-response', 'AVAILABLE', 'สำหรับอาการฉุกเฉิน โทร 1669 ทันที', 'doc:niems:1669', '2026-07-18T00:00:00+07:00', '2026-01-01', null, 'VERIFIED')
on conflict (facility_id, service_id) do update set availability_status = excluded.availability_status,
  conditions_th = excluded.conditions_th, source_id = excluded.source_id,
  verified_at = excluded.verified_at, effective_from = excluded.effective_from,
  effective_to = excluded.effective_to, verification_status = excluded.verification_status;

insert into public.benefits
  (id, name_th, description_th, value_text_th, case_relevance_tags, agency_id, active, source_id, effective_from, effective_to, verification_status)
values
  ('benefit:older-person-allowance', 'เบี้ยยังชีพผู้สูงอายุ', 'สวัสดิการเงินช่วยเหลือตามคุณสมบัติที่กำหนด ต้องประเมินด้วยกฎและข้อมูลที่ผู้ใช้ยืนยัน', 'จำนวนเงินและคุณสมบัติต้องตรวจสอบตามระเบียบและประกาศที่มีผล', '["OLDER_PERSON","SOCIAL_SUPPORT"]', 'agency:dla', true, 'doc:moi:older-person-allowance:2566', '2023-08-12', null, 'NEEDS_CONFIRMATION'),
  ('benefit:sss-dental', 'สิทธิประโยชน์ทันตกรรมประกันสังคม', 'สิทธิทันตกรรมสำหรับผู้ประกันตนที่เข้าเงื่อนไขตามหลักเกณฑ์ปี 2569', 'วงเงินและรายการบริการต้องตรวจสอบกับ 1506 หรือสถานพยาบาล', '["DENTAL","SSS"]', 'agency:sso', true, 'doc:sso:dental-2569', '2026-01-01', '2026-12-31', 'NEEDS_CONFIRMATION')
on conflict (id) do update set name_th = excluded.name_th, description_th = excluded.description_th,
  value_text_th = excluded.value_text_th, case_relevance_tags = excluded.case_relevance_tags,
  agency_id = excluded.agency_id, active = excluded.active, source_id = excluded.source_id,
  effective_from = excluded.effective_from, effective_to = excluded.effective_to,
  verification_status = excluded.verification_status;

insert into public.eligibility_rules
  (id, benefit_id, description_th, logic_json, required_attrs, effective_from, effective_to, source_id, verification_status, active)
values
  ('rule:older-person-allowance:2026', 'benefit:older-person-allowance', 'อายุอย่างน้อย 60 ปี มีสัญชาติไทย ลงทะเบียนในพื้นที่ และไม่รับบำนาญหรือรายได้ประจำจากรัฐ', '{"all":[{"attr":"age","op":">=","value":60},{"attr":"thai_nationality","op":"==","value":true},{"attr":"registered_in_area","op":"==","value":true},{"attr":"receives_state_pension","op":"==","value":false},{"attr":"receives_regular_state_income","op":"==","value":false}]}', '["age","thai_nationality","registered_in_area","receives_state_pension","receives_regular_state_income"]', '2023-08-12', null, 'doc:moi:older-person-allowance:2566', 'NEEDS_CONFIRMATION', true),
  ('rule:sss-dental:2026', 'benefit:sss-dental', 'ผู้ใช้ยืนยันสิทธิประกันสังคมและสถานะผู้ประกันตนยังมีผล', '{"all":[{"attr":"scheme","op":"==","value":"SSS"},{"attr":"insured_status","op":"==","value":"ACTIVE"}]}', '["scheme","insured_status"]', '2026-01-01', '2026-12-31', 'doc:sso:dental-2569', 'NEEDS_CONFIRMATION', true)
on conflict (id) do update set benefit_id = excluded.benefit_id,
  description_th = excluded.description_th, logic_json = excluded.logic_json,
  required_attrs = excluded.required_attrs, effective_from = excluded.effective_from,
  effective_to = excluded.effective_to, source_id = excluded.source_id,
  verification_status = excluded.verification_status, active = excluded.active;

insert into public.safety_rules
  (id, keywords, normalized_symptom_id, urgency_floor, hotline, message_th, exclusions, negation_patterns, source_id, effective_from, effective_to, verification_status, active)
values
  ('safety:unconscious', '["หมดสติ","ไม่รู้สึกตัว","เรียกไม่รู้ตัว","เรียกไม่ตอบ"]', 'sym:unconscious', 'EMERGENCY_NOW', '1669', 'อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน โทร 1669 ทันที', '["ไม่ได้หมดสติ","ไม่หมดสติ","รู้สึกตัวดี"]', '["ไม่(?:ได้)?\\s*หมดสติ","ยังรู้สึกตัวดี"]', 'doc:niems:1669', '2026-01-01', null, 'VERIFIED', true),
  ('safety:severe-dyspnea', '["หายใจไม่ออก","หายใจลำบากรุนแรง","หอบมาก","ปากเขียว"]', 'sym:severe-dyspnea', 'EMERGENCY_NOW', '1669', 'อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน โทร 1669 ทันที', '["ไม่หอบ","หายใจปกติ","ไม่มีอาการหายใจลำบาก"]', '["ไม่(?:มี)?\\s*หอบ","ไม่(?:มีอาการ)?\\s*หายใจลำบาก","หายใจปกติ"]', 'doc:niems:1669', '2026-01-01', null, 'VERIFIED', true),
  ('safety:severe-chest-pain', '["เจ็บหน้าอกรุนแรง","เจ็บหน้าอกมาก","แน่นหน้าอกรุนแรง","จุกแน่นอกมาก"]', 'sym:severe-chest-pain', 'EMERGENCY_NOW', '1669', 'อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน โทร 1669 ทันที', '["ไม่เจ็บหน้าอก","ไม่มีอาการเจ็บหน้าอก","ไม่แน่นหน้าอก"]', '["ไม่(?:มีอาการ)?\\s*เจ็บหน้าอก","ไม่\\s*แน่นหน้าอก"]', 'doc:niems:1669', '2026-01-01', null, 'VERIFIED', true),
  ('safety:acute-weakness', '["แขนขาอ่อนแรงเฉียบพลัน","อ่อนแรงครึ่งซีก","หน้าเบี้ยวแขนตก"]', 'sym:acute-weakness', 'EMERGENCY_NOW', '1669', 'อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน โทร 1669 ทันที', '["ไม่มีแขนขาอ่อนแรง","ไม่อ่อนแรง"]', '["ไม่(?:มี)?\\s*อ่อนแรง","ไม่มีแขนขาอ่อนแรง"]', 'doc:niems:1669', '2026-01-01', null, 'VERIFIED', true),
  ('safety:acute-slurred-speech', '["พูดไม่ชัดเฉียบพลัน","พูดไม่ชัดทันที","ลิ้นแข็งทันที"]', 'sym:acute-slurred-speech', 'EMERGENCY_NOW', '1669', 'อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน โทร 1669 ทันที', '["พูดชัดปกติ","ไม่มีอาการพูดไม่ชัด"]', '["ไม่มีอาการพูดไม่ชัด","พูดชัดปกติ"]', 'doc:niems:1669', '2026-01-01', null, 'VERIFIED', true),
  ('safety:seizure', '["ชัก","ชักเกร็ง","กระตุกทั้งตัว"]', 'sym:seizure', 'EMERGENCY_NOW', '1669', 'อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน โทร 1669 ทันที', '["ไม่ได้ชัก","ไม่มีอาการชัก"]', '["ไม่(?:ได้|มีอาการ)?\\s*ชัก"]', 'doc:niems:1669', '2026-01-01', null, 'VERIFIED', true),
  ('safety:major-bleeding', '["เลือดออกมาก","เลือดไหลไม่หยุด","เสียเลือดมาก"]', 'sym:major-bleeding', 'EMERGENCY_NOW', '1669', 'อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน โทร 1669 ทันที', '["ไม่มีเลือดออก","เลือดหยุดแล้ว"]', '["ไม่(?:มี)?\\s*เลือดออก","เลือดหยุดแล้ว"]', 'doc:niems:1669', '2026-01-01', null, 'VERIFIED', true),
  ('safety:acute-confusion', '["สับสนเฉียบพลัน","เพ้อเฉียบพลัน","จำคนไม่ได้ทันที"]', 'sym:acute-confusion', 'EMERGENCY_NOW', '1669', 'อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน โทร 1669 ทันที', '["ไม่สับสน","รู้เรื่องดี","ไม่มีอาการสับสน"]', '["ไม่(?:มีอาการ)?\\s*สับสน","รู้เรื่องดี"]', 'doc:niems:1669', '2026-01-01', null, 'VERIFIED', true),
  ('safety:anaphylaxis', '["แพ้รุนแรง","หน้าบวมคอบวม","ผื่นร่วมกับหายใจไม่ออก"]', 'sym:anaphylaxis', 'EMERGENCY_NOW', '1669', 'อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน โทร 1669 ทันที', '["ไม่มีอาการแพ้","ไม่บวม","หายใจปกติ"]', '["ไม่(?:มีอาการ)?\\s*แพ้","ไม่\\s*บวม","หายใจปกติ"]', 'doc:niems:1669', '2026-01-01', null, 'VERIFIED', true)
on conflict (id) do update set keywords = excluded.keywords,
  normalized_symptom_id = excluded.normalized_symptom_id, urgency_floor = excluded.urgency_floor,
  hotline = excluded.hotline, message_th = excluded.message_th, exclusions = excluded.exclusions,
  negation_patterns = excluded.negation_patterns, source_id = excluded.source_id,
  effective_from = excluded.effective_from, effective_to = excluded.effective_to,
  verification_status = excluded.verification_status, active = excluded.active;

insert into public.fact_sources
  (entity_type, entity_id, predicate, source_id, confidence, reviewer, extracted_at, effective_from, effective_to)
values
  ('right', 'right:ucs', 'description_th', 'doc:nhso:ucs-overview', 0.95, 'seed:mvp-v1', '2026-07-18T00:00:00+07:00', '2026-01-01', null),
  ('right', 'right:sss', 'description_th', 'doc:sso:medical', 0.95, 'seed:mvp-v1', '2026-07-18T00:00:00+07:00', '2026-01-01', null),
  ('right', 'right:csmbs', 'description_th', 'doc:cgd:medical', 0.95, 'seed:mvp-v1', '2026-07-18T00:00:00+07:00', '2026-01-01', null),
  ('condition', 'cond:E11', 'safety_note_th', 'doc:thai-dm-cpg:2566', 0.95, 'seed:mvp-v1', '2026-07-18T00:00:00+07:00', '2023-08-01', null),
  ('facility', 'fac:bma-hc66', 'opening_hours', 'doc:bma:health-centers', 0.60, 'seed:mvp-v1', '2026-07-18T00:00:00+07:00', '2026-01-01', null)
on conflict (entity_type, entity_id, predicate, source_id, effective_from) do update set
  confidence = excluded.confidence, reviewer = excluded.reviewer,
  extracted_at = excluded.extracted_at, effective_to = excluded.effective_to;

-- Synthetic booth cases. No national ID, name, phone, or other direct identifier.
insert into public.cases
  (id, user_id, demo_session_id, status, original_narrative, patient_relation, age, sex, scheme, area_code, consent_scope, created_at, updated_at, expires_at)
values
  ('00000000-0000-4000-8000-00000000000a', null, 'seed:demo:a', 'route_ready', 'พ่ออายุ 68 ปี เพลียมาก ปัสสาวะบ่อย กระหายน้ำ 5 วัน อยู่ลาดพร้าว ใช้สิทธิข้าราชการ ได้รับบำนาญ และไม่มี red flags ที่ถาม', 'father', 68, 'male', 'CSMBS', 'BKK-LATPHRAO', '{"demo":true,"persist_pii":false}', now(), now(), now() + interval '30 days'),
  ('00000000-0000-4000-8000-00000000000b', null, 'seed:demo:b', 'route_ready', 'บัตรทองลงทะเบียนต่างจังหวัด ตอนนี้อยู่บางกะปิ มีไข้ต่ำและเจ็บคอ 2 วัน ไม่มี red flags ที่ถาม', 'self', 35, null, 'UCS', 'BKK-BANGKAPI', '{"demo":true,"persist_pii":false}', now(), now(), now() + interval '30 days'),
  ('00000000-0000-4000-8000-00000000000c', null, 'seed:demo:c', 'route_ready', 'ผู้ประกันตนต้องการตรวจฟันและขูดหินปูน อยู่ห้วยขวาง ไม่มีอาการฉุกเฉิน', 'self', 29, null, 'SSS', 'BKK-HUAIKHWANG', '{"demo":true,"persist_pii":false}', now(), now(), now() + interval '30 days')
on conflict (id) do update set demo_session_id = excluded.demo_session_id,
  status = excluded.status, original_narrative = excluded.original_narrative,
  patient_relation = excluded.patient_relation, age = excluded.age, sex = excluded.sex,
  scheme = excluded.scheme, area_code = excluded.area_code, consent_scope = excluded.consent_scope,
  updated_at = now(), expires_at = now() + interval '30 days';

insert into public.care_routes
  (id, case_id, route_type, facility_id, service_ids, urgency, score, score_breakdown, why_selected, cost_summary, preparation_items, evidence_ids, created_at)
values
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', 'PRIMARY', 'fac:bma-hc66', '["svc:dm-assessment","svc:dm-screening"]', 'SOON_1_3_DAYS', 70, '{"service_match":35,"right_match":15,"open_at_requested_time":null,"area_or_distance_match":10,"source_freshness_and_verification":5,"observed_access_reliability":0}', '["อาการควรได้รับการประเมิน","มีบริการที่เกี่ยวข้อง","อยู่ในพื้นที่ลาดพร้าว","ต้องโทรยืนยันสิทธิ์และเวลา"]', '{"status":"UNKNOWN","text_th":"ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้"}', '["บัตรประชาชน","รายการยา","ผลตรวจเดิมถ้ามี"]', '["doc:thai-dm-cpg:2566","doc:cgd:medical","doc:bma:diabetes-clinics"]', now()),
  ('10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000b', 'PRIMARY', 'fac:bma-hc35', '["svc:general-acute-assessment"]', 'SOON_1_3_DAYS', 75, '{"service_match":35,"right_match":25,"open_at_requested_time":null,"area_or_distance_match":10,"source_freshness_and_verification":5,"observed_access_reliability":0}', '["มีบริการประเมินอาการ","รับสิทธิ์แบบมีเงื่อนไขที่ต้องยืนยัน","อยู่ในพื้นที่บางกะปิ"]', '{"status":"UNKNOWN","text_th":"ต้องยืนยันหน่วยบริการและค่าใช้จ่ายกับ 1330"}', '["บัตรประชาชน","ข้อมูลหน่วยบริการประจำ"]', '["doc:nhso:ucs-overview","doc:nhso:1330","doc:bma:health-centers"]', now()),
  ('10000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-00000000000c', 'PRIMARY', 'fac:sso-1506', '["svc:sss-right-verification"]', 'ROUTINE_APPOINTMENT', 65, '{"service_match":35,"right_match":25,"open_at_requested_time":null,"area_or_distance_match":0,"source_freshness_and_verification":5,"observed_access_reliability":0}', '["ยืนยันกฎปี 2569 ก่อนเลือกสถานพยาบาล","ลดความเสี่ยงใช้ข้อมูลวงเงินเก่า"]', '{"status":"VARIABLE","text_th":"ค่าใช้จ่ายขึ้นกับรายการและหลักเกณฑ์ที่มีผล"}', '["ข้อมูลสถานะผู้ประกันตน","บัตรประชาชนสำหรับนำไปยืนยันที่สถานพยาบาล"]', '["doc:sso:dental-2569","doc:sso:medical"]', now())
on conflict (id) do update set facility_id = excluded.facility_id,
  service_ids = excluded.service_ids, urgency = excluded.urgency, score = excluded.score,
  score_breakdown = excluded.score_breakdown, why_selected = excluded.why_selected,
  cost_summary = excluded.cost_summary, preparation_items = excluded.preparation_items,
  evidence_ids = excluded.evidence_ids;

insert into public.facility_access_feedback
  (id, case_id, facility_id, route_id, outcome, right_accepted, service_received, unexpected_cost, cost_amount, missing_documents, transferred_to, notes, submitted_at, moderation_status, is_demo)
values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'fac:bma-hc66', '10000000-0000-4000-8000-00000000000a', 'RECEIVED_AS_PLANNED', true, true, false, null, '[]', null, 'ข้อมูลตัวอย่างสำหรับการสาธิต ไม่ใช่ประสบการณ์ผู้ใช้จริง', '2026-07-15T10:00:00+07:00', 'DEMO_APPROVED', true),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000b', 'fac:bma-hc35', '10000000-0000-4000-8000-00000000000b', 'RECEIVED_AS_PLANNED', true, true, false, null, '[]', null, 'ข้อมูลตัวอย่างสำหรับการสาธิต ไม่ใช่ประสบการณ์ผู้ใช้จริง', '2026-07-16T11:30:00+07:00', 'DEMO_APPROVED', true),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000000c', 'fac:sso-1506', '10000000-0000-4000-8000-00000000000c', 'TRANSFERRED_ELSEWHERE', null, false, null, null, '[]', 'สถานพยาบาลที่เข้าร่วมตามข้อมูลที่ตรวจสอบในวันนั้น', 'ข้อมูลตัวอย่างสำหรับการสาธิต: สายด่วนเป็นจุดตรวจสอบสิทธิ ไม่ใช่สถานพยาบาล', '2026-07-17T09:15:00+07:00', 'DEMO_APPROVED', true)
on conflict (id) do update set outcome = excluded.outcome,
  right_accepted = excluded.right_accepted, service_received = excluded.service_received,
  unexpected_cost = excluded.unexpected_cost, cost_amount = excluded.cost_amount,
  missing_documents = excluded.missing_documents, transferred_to = excluded.transferred_to,
  notes = excluded.notes, submitted_at = excluded.submitted_at,
  moderation_status = excluded.moderation_status, is_demo = excluded.is_demo;

commit;
